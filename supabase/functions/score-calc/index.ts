// Edge Function — Calcul quotidien des scores de risque client
// Appelée par cron à 6h00 — calcule le top 20 par organisation via RPC calculer_scores_org

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET   = Deno.env.get('CRON_SECRET') ?? ''

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET)
    return json({ error: 'unauthorized' }, 401)

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // 1. Récupère toutes les organisations actives
    const { data: orgs, error: orgsErr } = await supabase
      .from('organisations')
      .select('id')
    if (orgsErr) throw orgsErr

    let totalAlertes = 0
    const erreurs: string[] = []

    // 2. Calcul pour chaque organisation
    for (const org of (orgs ?? [])) {
      try {
        const { data, error } = await supabase
          .rpc('calculer_scores_org', { p_organisation_id: org.id })
          .single()
        if (error) {
          erreurs.push(`org ${org.id}: ${error.message}`)
        } else {
          const row = data as { alertes_inserees: number } | null
          totalAlertes += row?.alertes_inserees ?? 0
        }
      } catch (err) {
        erreurs.push(`org ${org.id}: ${String(err)}`)
      }
    }

    console.log(`[score-calc] terminé — ${(orgs ?? []).length} org(s), ${totalAlertes} alerte(s) insérée(s)`)
    if (erreurs.length) console.warn('[score-calc] erreurs:', erreurs)

    return json({ orgs_traitees: (orgs ?? []).length, alertes_inserees: totalAlertes, erreurs })

  } catch (err) {
    console.error('[score-calc] erreur critique:', err)
    return json({ error: String(err) }, 500)
  }
})
