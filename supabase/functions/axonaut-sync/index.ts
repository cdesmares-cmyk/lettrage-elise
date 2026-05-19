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

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Non autorisé', { status: 401, headers: CORS })

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY)

    const body = await req.json()
    const action: string = body.action
    const depuis: string | null = body.depuis ?? null
    const depuisTs = depuis ? Math.floor(new Date(depuis).getTime() / 1000) : 0

    const { data: integration, error: intErr } = await supabaseUser
      .from('integrations')
      .select('api_key, organisation_id')
      .eq('provider', 'axonaut')
      .eq('actif', true)
      .single()

    if (intErr || !integration?.api_key) {
      console.error('integrations read error:', intErr)
      return json({ error: `Clef API introuvable : ${intErr?.message ?? 'null'}` }, 400)
    }

    const { api_key: apiKey, organisation_id: orgId } = integration as { api_key: string; organisation_id: string }
    const axonautHeaders = { userApiKey: apiKey }

    // ── test ────────────────────────────────────────────────────────────────
    if (action === 'test') {
      const res = await fetch(`${AXONAUT_BASE}/invoices?page=1`, { headers: { ...axonautHeaders, page: '1' } })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        return json({ ok: false, message: `Axonaut HTTP ${res.status} — ${txt}` })
      }
      await supabaseAdmin
        .from('integrations')
        .update({ verifie_le: new Date().toISOString(), actif: true })
        .eq('provider', 'axonaut')
        .eq('organisation_id', orgId)
      return json({ ok: true, message: 'Connexion validée' })
    }

    // ── sync ────────────────────────────────────────────────────────────────
    if (action === 'sync') {
      let page  = 0
      let nbMaj = 0

      while (true) {
        const res = await fetch(`${AXONAUT_BASE}/invoices?page=${page + 1}`, { headers: { ...axonautHeaders, page: String(page + 1) } })
        if (!res.ok) return json({ error: `Axonaut HTTP ${res.status}` }, 502)

        const invoices = await res.json() as Array<{ number: string; public_path: string; date: string }>
        if (!Array.isArray(invoices) || invoices.length === 0) break

        const filtrees = depuisTs ? invoices.filter(inv => Number(inv.date) >= depuisTs) : invoices

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

        if (depuisTs && invoices.every(inv => Number(inv.date) < depuisTs)) break
        if (invoices.length < PER_PAGE) break
        page++
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

  } catch (err) {
    console.error('Unhandled error:', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
