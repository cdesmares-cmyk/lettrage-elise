// Edge Function — Calcul quotidien des scores de risque client
// Appelée par cron à 6h00 — traitement en parallèle par organisation

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

    // 2. Calcul en parallèle — évite l'accumulation des temps séquentiels
    const resultats = await Promise.all(
      (orgs ?? []).map(async (org) => {
        try {
          const { data, error } = await supabase
            .rpc('calculer_scores_org', { p_organisation_id: org.id })
            .single()
          if (error) return { orgId: org.id, alertes: 0, erreur: error.message }
          const row = data as { alertes_inserees: number } | null
          return { orgId: org.id, alertes: row?.alertes_inserees ?? 0, erreur: null }
        } catch (err) {
          return { orgId: org.id, alertes: 0, erreur: String(err) }
        }
      })
    )

    const totalAlertes = resultats.reduce((s, r) => s + r.alertes, 0)
    const erreurs = resultats.filter(r => r.erreur).map(r => `org ${r.orgId}: ${r.erreur}`)

    console.log(`[score-calc] terminé — ${(orgs ?? []).length} org(s), ${totalAlertes} alerte(s) insérée(s)`)
    if (erreurs.length) console.warn('[score-calc] erreurs:', erreurs)

    return json({ orgs_traitees: (orgs ?? []).length, alertes_inserees: totalAlertes, erreurs })

  } catch (err) {
    console.error('[score-calc] erreur critique:', err)
    return json({ error: String(err) }, 500)
  }
})
