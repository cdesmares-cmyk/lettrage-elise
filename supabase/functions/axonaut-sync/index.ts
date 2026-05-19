import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const AXONAUT_BASE      = 'https://axonaut.com/api/v2'
const PER_PAGE          = 50

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Non autorisé', { status: 401, headers: CORS })

  // Client avec droits de l'utilisateur (RLS actif) pour lire integrations
  const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  // Client admin pour écrire dans factures sans restriction RLS
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

  const { action, depuis } = await req.json()
  // depuis : date ISO optionnelle (ex: '2026-01-01') pour limiter la synchro
  const depuisTs = depuis ? Math.floor(new Date(depuis).getTime() / 1000) : 0

  // Lecture de la clef API depuis integrations (RLS garantit que c'est bien la bonne org)
  const { data: integration, error: intErr } = await supabaseUser
    .from('integrations')
    .select('api_key, organisation_id')
    .eq('provider', 'axonaut')
    .eq('actif', true)
    .single()

  if (intErr || !integration?.api_key) {
    return json({ error: 'Aucune clef API Axonaut configurée' }, 400)
  }

  const { api_key: apiKey, organisation_id: orgId } = integration

  // ── Action : tester la connexion ─────────────────────────────────────────
  if (action === 'test') {
    const res = await fetch(`${AXONAUT_BASE}/invoices?userApiKey=${apiKey}&page=0&per_page=1`)
    if (!res.ok) return json({ ok: false, message: `Axonaut HTTP ${res.status}` })

    // Marquer la connexion comme vérifiée
    await supabaseAdmin
      .from('integrations')
      .update({ verifie_le: new Date().toISOString(), actif: true })
      .eq('provider', 'axonaut')
      .eq('organisation_id', orgId)

    return json({ ok: true, message: 'Connexion validée' })
  }

  // ── Action : synchroniser les public_path ─────────────────────────────────
  if (action === 'sync') {
    let page    = 0
    let nbMaj   = 0

    while (true) {
      const res = await fetch(`${AXONAUT_BASE}/invoices?userApiKey=${apiKey}&page=${page}&per_page=${PER_PAGE}`)
      if (!res.ok) return json({ error: `Axonaut HTTP ${res.status}` }, 502)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoices: any[] = await res.json()
      if (!Array.isArray(invoices) || invoices.length === 0) break

      // Filtrer par date si 'depuis' est fourni (date = unix timestamp dans l'API Axonaut)
      const filtrees = depuisTs
        ? invoices.filter(inv => Number(inv.date) >= depuisTs)
        : invoices

      // Mise à jour en parallèle pour toute la page
      const updates = filtrees
        .filter(inv => inv.number && inv.public_path)
        .map(inv =>
          supabaseAdmin
            .from('factures')
            .update({ axonaut_pdf_url: inv.public_path })
            .eq('numero_piece', inv.number)
            .eq('organisation_id', orgId)
        )

      const results = await Promise.all(updates)
      nbMaj += results.filter(r => !r.error).length

      // Arrêt anticipé : si toutes les factures de la page sont antérieures à 'depuis'
      if (depuisTs && invoices.every(inv => Number(inv.date) < depuisTs)) break
      if (invoices.length < PER_PAGE) break
      page++

      // Pause pour respecter les limites de l'API Axonaut
      await new Promise(r => setTimeout(r, 120))
    }

    await supabaseAdmin
      .from('integrations')
      .update({ verifie_le: new Date().toISOString() })
      .eq('provider', 'axonaut')
      .eq('organisation_id', orgId)

    return json({ ok: true, nb_mises_a_jour: nbMaj })
  }

  return json({ error: 'Action inconnue' }, 400)
})
