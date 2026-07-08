// Edge Function — Axonaut PDF Import
// Reçoit une liste de numero_piece et va chercher les public_path
// correspondants via l'API Axonaut (?number=XXX).
// Traite 20 appels en parallèle, met à jour axonaut_pdf_url en batch.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET  = Deno.env.get('CRON_SECRET') ?? ''

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const BATCH_SIZE = 20

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // Auth : CRON_SECRET (tests SQL) ou JWT utilisateur (frontend)
  const cronSecret = req.headers.get('x-cron-secret')
  const authHeader = req.headers.get('Authorization')

  let authenticated = false
  if (CRON_SECRET && cronSecret === CRON_SECRET) {
    authenticated = true
  } else if (authHeader) {
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (user) authenticated = true
  }
  if (!authenticated) return json({ error: 'unauthorized' }, 401)

  let body: { organisation_id?: string; numeros_pieces?: string[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid json' }, 400)
  }

  const { organisation_id, numeros_pieces } = body
  if (!organisation_id || !Array.isArray(numeros_pieces) || !numeros_pieces.length)
    return json({ error: 'organisation_id et numeros_pieces requis' }, 400)

  // Clé API Axonaut de l'org
  const { data: integ } = await supabase
    .from('integrations')
    .select('api_key')
    .eq('organisation_id', organisation_id)
    .eq('provider', 'axonaut')
    .eq('actif', true)
    .single()

  if (!integ?.api_key) return json({ error: 'Intégration Axonaut non configurée' }, 400)

  const apiKey = integ.api_key as string
  const updates: { numero_piece: string; pdf_url: string }[] = []
  let nbTraites  = 0
  let nbTrouves  = 0
  let nbEchecs   = 0

  // Traitement par batches de 20 appels parallèles
  for (let i = 0; i < numeros_pieces.length; i += BATCH_SIZE) {
    const batch = numeros_pieces.slice(i, i + BATCH_SIZE)

    const resultats = await Promise.allSettled(
      batch.map(async (numero: string) => {
        const res = await fetch(
          `https://axonaut.com/api/v2/invoices?number=${encodeURIComponent(numero)}`,
          { headers: { userApiKey: apiKey }, signal: AbortSignal.timeout(8000) }
        )
        if (!res.ok) return null
        const data = await res.json() as { public_path?: string }[]
        const facture = Array.isArray(data) ? data[0] : null
        return facture?.public_path
          ? { numero_piece: numero, pdf_url: facture.public_path }
          : null
      })
    )

    for (const r of resultats) {
      nbTraites++
      if (r.status === 'fulfilled' && r.value) {
        updates.push(r.value)
        nbTrouves++
      } else {
        nbEchecs++
      }
    }
  }

  // Mise à jour en base via RPC batch
  if (updates.length) {
    await supabase.rpc('bulk_update_axonaut_pdf', {
      updates: updates,
      org_id:  organisation_id,
    })
  }

  await supabase.from('cron_runs').insert({
    fonction:        'axonaut-pdf-import',
    organisation_id,
    statut:          nbEchecs > 0 && nbTrouves === 0 ? 'erreur' : nbEchecs > 0 ? 'partiel' : 'ok',
    nb_traite:       nbTrouves,
    message:         `${nbTrouves} URLs trouvées · ${nbEchecs} sans PDF · ${nbTraites} traitées`,
  })

  console.log(`[axonaut-pdf-import] org ${organisation_id} : ${nbTrouves}/${nbTraites} URLs`)
  return json({ ok: true, nb_traites: nbTraites, nb_trouves: nbTrouves, nb_echecs: nbEchecs })
})
