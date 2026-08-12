// Edge Function — Axonaut PDF Import
// Reçoit une liste de numero_piece et va chercher les public_path
// correspondants via l'API Axonaut (?number=XXX).
// Traite 20 appels en parallèle, pause 300ms entre batches pour éviter le rate limit.

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

const BATCH_SIZE  = 20
const BATCH_DELAY = 300 // ms entre chaque batch — évite le rate limit Axonaut

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

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
  let nbTrouves    = 0
  let nbSansPdf    = 0  // Axonaut répond OK mais pas de public_path
  let nbRateLimit  = 0  // HTTP 429
  let nbErreurApi  = 0  // Autre erreur HTTP ou timeout réseau

  // Traitement par batches de 20 appels parallèles, pause entre chaque batch
  for (let i = 0; i < numeros_pieces.length; i += BATCH_SIZE) {
    if (i > 0) await sleep(BATCH_DELAY)

    const batch = numeros_pieces.slice(i, i + BATCH_SIZE)

    const resultats = await Promise.allSettled(
      batch.map(async (numero: string) => {
        const res = await fetch(
          `https://axonaut.com/api/v2/invoices?number=${encodeURIComponent(numero)}`,
          { headers: { userApiKey: apiKey }, signal: AbortSignal.timeout(8000) }
        )
        if (res.status === 429) return { status: 'rate_limit' as const }
        if (!res.ok)            return { status: 'erreur_api' as const, code: res.status }
        const data = await res.json() as { public_path?: string }[]
        const facture = Array.isArray(data) ? data[0] : null
        return facture?.public_path
          ? { status: 'ok' as const, numero_piece: numero, pdf_url: facture.public_path }
          : { status: 'sans_pdf' as const }
      })
    )

    for (const r of resultats) {
      if (r.status === 'rejected') {
        nbErreurApi++ // timeout réseau ou exception
        continue
      }
      const val = r.value
      if (val.status === 'ok') {
        updates.push({ numero_piece: val.numero_piece, pdf_url: val.pdf_url })
        nbTrouves++
      } else if (val.status === 'rate_limit') {
        nbRateLimit++
      } else if (val.status === 'sans_pdf') {
        nbSansPdf++
      } else {
        nbErreurApi++
      }
    }

    // Si on commence à se faire throttler, on arrête d'aggraver la situation
    if (nbRateLimit > 10) {
      console.warn(`[axonaut-pdf-import] ${nbRateLimit} rate limits — arrêt anticipé au batch ${Math.ceil(i / BATCH_SIZE) + 1}`)
      break
    }
  }

  const nbTraites = nbTrouves + nbSansPdf + nbRateLimit + nbErreurApi
  const statut = nbRateLimit > 0 || nbErreurApi > 0
    ? (nbTrouves === 0 ? 'erreur' : 'partiel')
    : 'ok'

  const messageParts = [
    `${nbTrouves} URLs trouvées`,
    nbSansPdf    > 0 ? `${nbSansPdf} sans PDF` : null,
    nbRateLimit  > 0 ? `${nbRateLimit} rate-limitées (429)` : null,
    nbErreurApi  > 0 ? `${nbErreurApi} erreurs API/timeout` : null,
    `${nbTraites} traitées`,
  ].filter(Boolean).join(' · ')

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
    statut,
    nb_traite:       nbTrouves,
    message:         messageParts,
  })

  console.log(`[axonaut-pdf-import] org ${organisation_id} : ${messageParts}`)
  return json({ ok: true, nb_traites: nbTraites, nb_trouves: nbTrouves, nb_sans_pdf: nbSansPdf, nb_rate_limit: nbRateLimit, nb_erreurs: nbErreurApi })
})
