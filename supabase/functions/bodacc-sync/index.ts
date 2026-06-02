// Edge Function — Veille BODACC v4
// ─────────────────────────────────────────────────────────────────────────────
// Mode quotidien  (sans org_id) : approche inversée
//   BODACC → tous les SIRENs du jour → match clients → alertes + statuts
//   Scalable à l'infini : 2 000 ou 2 000 000 clients = même nombre d'appels API
//
// Mode onboarding (avec org_id) : scan historique client-par-client
//   date_min auto = date de la facture la plus ancienne du tenant
//   Exécuté une seule fois à l'arrivée d'un nouveau tenant
//
// Mode client_unique : vérification à la demande pour un ou plusieurs SIRETs
//   Déclenché depuis le panneau client (bouton Synchroniser BODACC)
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BODACC_BASE  = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records'

const TYPES_SURVEILLÉS = ['liquidation', 'redressement', 'sauvegarde', 'cloture']
const PRIORITE: Record<string, number> = { liquidation: 1, redressement: 2, sauvegarde: 3, cloture: 4 }

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

function siretToSiren(siret: string): string {
  return siret.replace(/\s/g, '').slice(0, 9)
}

function sirenAvecEspaces(siren: string): string {
  return `${siren.slice(0, 3)} ${siren.slice(3, 6)} ${siren.slice(6, 9)}`
}

function dateHier(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

type TypeProcedure = 'liquidation' | 'redressement' | 'sauvegarde' | 'cloture' | 'autre'

interface Jugement {
  nature?: string
  complementJugement?: string
  date?: string
  famille?: string
}

interface BodaccRecord {
  id: string
  publicationavis: string | null
  dateparution: string | null
  familleavis: string | null
  familleavis_lib: string | null
  typeavis: string | null
  tribunal: string | null
  jugement: string | null
  registre: string[] | null
  [key: string]: unknown
}

interface ClientRow {
  code_dso: string
  siret: string
  organisation_id: string
}

function parseJugement(raw: string | null): Jugement | null {
  if (!raw) return null
  try { return JSON.parse(raw) as Jugement } catch { return null }
}

function classifierType(r: BodaccRecord): TypeProcedure {
  const jugement = parseJugement(r.jugement)
  const texte = [
    r.familleavis_lib, r.familleavis, r.typeavis,
    jugement?.nature, jugement?.complementJugement, jugement?.famille,
  ].filter(Boolean).join(' ').toLowerCase()

  if (texte.includes('liquidation'))                            return 'liquidation'
  if (texte.includes('redressement'))                           return 'redressement'
  if (texte.includes('sauvegarde'))                             return 'sauvegarde'
  if (texte.includes('clôture') || texte.includes('cloture'))  return 'cloture'
  return 'autre'
}

function buildDescription(r: BodaccRecord): string {
  const jugement = parseJugement(r.jugement)
  return [
    jugement?.nature,
    r.tribunal,
    jugement?.complementJugement,
  ].filter(Boolean).join(' — ').slice(0, 500)
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Pagine l'API BODACC sans limite — prend tout ce qui correspond au filtre
async function fetchAllBodacc(filtre: string): Promise<BodaccRecord[]> {
  const all: BodaccRecord[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const url = new URL(BODACC_BASE)
    url.searchParams.set('where', filtre)
    url.searchParams.set('order_by', 'dateparution desc')
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('offset', String(offset))

    try {
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) })
      if (!res.ok) {
        console.warn(`[bodacc-sync] HTTP ${res.status} offset=${offset}`)
        break
      }
      const data = await res.json() as { total_count: number; results?: BodaccRecord[] }
      const results = data.results ?? []
      all.push(...results)
      offset += results.length
      if (offset >= data.total_count || results.length === 0) break
      await sleep(150)
    } catch (err) {
      console.warn(`[bodacc-sync] erreur fetch offset=${offset}:`, err)
      break
    }
  }

  console.log(`[bodacc-sync] BODACC → ${all.length} records récupérés`)
  return all
}

// Construit les alertes à insérer à partir des records BODACC et des clients matchés
function construireAlertes(records: BodaccRecord[], clients: ClientRow[]): Record<string, unknown>[] {
  const recordsBySiren: Record<string, BodaccRecord[]> = {}
  for (const r of records) {
    const sirens = (r.registre ?? []).map(s => s.replace(/\s/g, '')).filter(s => /^\d{9}$/.test(s))
    for (const siren of sirens) {
      if (!recordsBySiren[siren]) recordsBySiren[siren] = []
      recordsBySiren[siren].push(r)
    }
  }

  const alertes: Record<string, unknown>[] = []
  for (const client of clients) {
    const siren = siretToSiren(client.siret)
    for (const r of recordsBySiren[siren] ?? []) {
      const type = classifierType(r)
      if (!TYPES_SURVEILLÉS.includes(type)) continue
      alertes.push({
        organisation_id: client.organisation_id,
        code_client:     client.code_dso,
        siret:           client.siret,
        bodacc_id:       r.id,
        famille:         'BODACC-A/B',
        type_procedure:  type,
        tribunal:        r.tribunal ?? null,
        date_jugement:   parseJugement(r.jugement)?.date ?? null,
        date_parution:   r.dateparution ?? null,
        description:     buildDescription(r),
      })
    }
  }
  return alertes
}

// Recalcule statut_juridique pour un client précis à partir de ses alertes actives (non masquées)
async function mettreAJourStatutClient(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  codeDso: string
): Promise<void> {
  const { data: alertes, error: errLecture } = await supabase
    .from('alertes_risque')
    .select('type_procedure')
    .eq('organisation_id', orgId)
    .eq('code_client', codeDso)
    .eq('masquee', false)

  if (errLecture) {
    console.warn(`[bodacc-sync] lecture alertes ${codeDso}:`, errLecture.message)
    return
  }

  const meilleur = ((alertes ?? []) as { type_procedure: string }[])
    .sort((a, b) => (PRIORITE[a.type_procedure] ?? 99) - (PRIORITE[b.type_procedure] ?? 99))[0]

  const { error: errMaj } = await supabase
    .from('clients')
    .update({ statut_juridique: meilleur?.type_procedure ?? null } as never)
    .eq('organisation_id', orgId)
    .eq('code_dso', codeDso)

  if (errMaj) console.warn(`[bodacc-sync] update statut ${codeDso}:`, errMaj.message)
}

// Lit toutes les alertes actives (non masquées) et met à jour statut_juridique en batch
// Utilisé par les modes quotidien et onboarding (volumétrie importante)
async function mettreAJourStatuts(supabase: ReturnType<typeof createClient>): Promise<number> {
  const alertes: Array<{ organisation_id: string; code_client: string; type_procedure: string }> = []
  const PAGE = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('alertes_risque')
      .select('organisation_id, code_client, type_procedure')
      .eq('masquee', false)
      .range(offset, offset + PAGE - 1)
    if (error || !data?.length) break
    alertes.push(...(data as typeof alertes))
    if (data.length < PAGE) break
    offset += PAGE
  }

  if (!alertes.length) return 0

  const parClient: Record<string, { org: string; code: string; type: string }> = {}
  for (const a of alertes) {
    const key = `${a.organisation_id}__${a.code_client}`
    const actuel = parClient[key]
    if (!actuel || (PRIORITE[a.type_procedure] ?? 99) < (PRIORITE[actuel.type] ?? 99)) {
      parClient[key] = { org: a.organisation_id, code: a.code_client, type: a.type_procedure }
    }
  }

  const groupes: Record<string, { org: string; type: string; codes: string[] }> = {}
  for (const { org, code, type } of Object.values(parClient)) {
    const key = `${org}__${type}`
    if (!groupes[key]) groupes[key] = { org, type, codes: [] }
    groupes[key].codes.push(code)
  }

  let nbMaj = 0
  for (const { org, type, codes } of Object.values(groupes)) {
    for (let i = 0; i < codes.length; i += 500) {
      const { error } = await supabase
        .from('clients')
        .update({ statut_juridique: type } as never)
        .eq('organisation_id', org)
        .in('code_dso', codes.slice(i, i + 500))
      if (error) {
        console.warn(`[bodacc-sync] update statut batch org=${org} type=${type}:`, error.message)
      } else {
        nbMaj += codes.slice(i, i + 500).length
      }
    }
  }
  return nbMaj
}

// ─── MODE QUOTIDIEN : approche inversée ──────────────────────────────────────
async function scanQuotidien(supabase: ReturnType<typeof createClient>) {
  const dateMin = dateHier()
  const filtre  = `familleavis="collective" AND dateparution>="${dateMin}"`

  const records = await fetchAllBodacc(filtre)
  if (!records.length) return { mode: 'quotidien', alertes_insérées: 0, statuts_mis_a_jour: 0 }

  const sirens = [...new Set(
    records.flatMap(r => (r.registre ?? []).map(s => s.replace(/\s/g, '')).filter(s => /^\d{9}$/.test(s)))
  )]
  console.log(`[bodacc-sync] ${sirens.length} SIRENs uniques dans le batch BODACC`)

  const { data: clients, error: errClients } = await supabase
    .rpc('match_clients_par_siren', { sirens })
  if (errClients) throw new Error(errClients.message)

  const rows = (clients ?? []) as ClientRow[]
  console.log(`[bodacc-sync] ${rows.length} clients matchés (toutes orgs)`)

  const alertes = construireAlertes(records, rows)
  let nbInsérées = 0
  for (let i = 0; i < alertes.length; i += 500) {
    const { error } = await supabase
      .from('alertes_risque')
      .upsert(alertes.slice(i, i + 500) as never, { onConflict: 'organisation_id,bodacc_id', ignoreDuplicates: true })
    if (!error) nbInsérées += alertes.slice(i, i + 500).length
  }

  const nbStatuts = await mettreAJourStatuts(supabase)

  return { mode: 'quotidien', records_bodacc: records.length, sirens_uniques: sirens.length, clients_matchés: rows.length, alertes_insérées: nbInsérées, statuts_mis_a_jour: nbStatuts }
}

// ─── MODE ONBOARDING : scan historique client-par-client pour un tenant ──────
async function scanOnboarding(supabase: ReturnType<typeof createClient>, orgId: string, dateMinParam: string | null) {
  let dateMin = dateMinParam
  if (!dateMin) {
    const { data: oldest } = await supabase
      .from('factures')
      .select('date_emission')
      .eq('organisation_id', orgId)
      .not('date_emission', 'is', null)
      .order('date_emission', { ascending: true })
      .limit(1)
      .maybeSingle()
    dateMin = (oldest as { date_emission: string } | null)?.date_emission ?? '2020-01-01'
  }
  console.log(`[bodacc-sync] onboarding org=${orgId} depuis ${dateMin}`)

  const rows: ClientRow[] = []
  const PAGE = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('clients')
      .select('code_dso, siret, organisation_id')
      .eq('organisation_id', orgId)
      .not('siret', 'is', null)
      .neq('siret', '')
      .range(offset, offset + PAGE - 1)
    if (error || !data?.length) break
    rows.push(...(data as ClientRow[]))
    if (data.length < PAGE) break
    offset += PAGE
  }
  console.log(`[bodacc-sync] onboarding : ${rows.length} clients avec SIRET`)

  let nbInsérées = 0
  const erreursLog: string[] = []

  for (const client of rows) {
    const siren      = siretToSiren(client.siret)
    const sirenSpace = sirenAvecEspaces(siren)
    const filtre     = `familleavis="collective" AND (registre="${siren}" OR registre="${sirenSpace}")`

    const records = await fetchAllBodacc(`${filtre} AND dateparution>="${dateMin}"`)
    await sleep(250)

    const alertes = construireAlertes(records, [client])
    if (!alertes.length) continue

    const { error } = await supabase
      .from('alertes_risque')
      .upsert(alertes as never, { onConflict: 'organisation_id,bodacc_id', ignoreDuplicates: true })
    if (error) {
      erreursLog.push(`${client.code_dso}: ${error.message}`)
    } else {
      nbInsérées += alertes.length
    }
  }

  const nbStatuts = await mettreAJourStatuts(supabase)

  return { mode: 'onboarding', org_id: orgId, date_min: dateMin, clients_traités: rows.length, alertes_insérées: nbInsérées, statuts_mis_a_jour: nbStatuts, erreurs: erreursLog }
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Non autorisé' }, 401)

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await supabaseUser.auth.getUser()
    if (!user) return json({ error: 'Non authentifié' }, 401)

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: profil } = await supabase
      .from('utilisateurs')
      .select('role, organisation_id')
      .eq('id', user.id)
      .single()
    if (!profil || !['admin', 'responsable_poste_client', 'superadmin'].includes(profil.role))
      return json({ error: 'Accès réservé aux administrateurs' }, 403)

    let body: Record<string, unknown> = {}
    try { body = await req.json() as Record<string, unknown> } catch { /* body vide = mode quotidien */ }

    const action  = typeof body.action   === 'string' ? body.action : null
    const orgId   = typeof body.org_id   === 'string' ? body.org_id : null
    const dateMin = typeof body.date_min === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date_min) ? body.date_min : null

    // ── MODE CLIENT_UNIQUE : vérification à la demande ────────────────────────
    if (action === 'client_unique') {
      const sirets = Array.isArray(body.sirets)
        ? (body.sirets as string[]).filter(s => typeof s === 'string' && s.length > 0)
        : []
      if (!sirets.length) return json({ error: 'sirets (array non vide) requis' }, 400)

      const orgCible = (orgId ?? profil.organisation_id) as string
      if (profil.role === 'admin' && orgCible !== profil.organisation_id)
        return json({ error: 'Accès non autorisé à cette organisation' }, 403)

      let nbInsérées = 0
      for (const siret of sirets) {
        const siren      = siretToSiren(siret)
        const sirenSpace = sirenAvecEspaces(siren)
        const filtre     = `familleavis="collective" AND (registre="${siren}" OR registre="${sirenSpace}")`
        const records    = await fetchAllBodacc(filtre)

        const { data: clientsMatchés } = await supabase
          .from('clients')
          .select('code_dso, siret, organisation_id')
          .eq('organisation_id', orgCible)
          .eq('siret', siret)
          .limit(10)
        const rows = (clientsMatchés ?? []) as ClientRow[]
        if (!rows.length) continue

        const alertes = construireAlertes(records, rows)
        if (alertes.length > 0) {
          const { error } = await supabase
            .from('alertes_risque')
            .upsert(alertes as never, { onConflict: 'organisation_id,bodacc_id', ignoreDuplicates: true })
          if (!error) nbInsérées += alertes.length
        }

        // Recalcul ciblé du statut pour chaque client concerné
        for (const client of rows) {
          await mettreAJourStatutClient(supabase, client.organisation_id, client.code_dso)
        }
      }

      const résumé = { mode: 'client_unique', sirets_traités: sirets.length, alertes_inserees: nbInsérées }
      console.log('[bodacc-sync] terminé :', résumé)
      return json(résumé)
    }

    // ── MODE RECALCULER_STATUT : recalcul sans appel BODACC ──────────────────
    if (action === 'recalculer_statut') {
      const codeDso = typeof body.code_dso === 'string' ? body.code_dso : null
      if (!codeDso) return json({ error: 'code_dso requis' }, 400)

      const orgCible = (orgId ?? profil.organisation_id) as string
      if (profil.role !== 'superadmin' && orgCible !== profil.organisation_id)
        return json({ error: 'Accès non autorisé' }, 403)

      await mettreAJourStatutClient(supabase, orgCible, codeDso)

      const { data: row } = await supabase
        .from('clients')
        .select('statut_juridique')
        .eq('organisation_id', orgCible)
        .eq('code_dso', codeDso)
        .maybeSingle()

      return json({ ok: true, statut_juridique: (row as { statut_juridique: string | null } | null)?.statut_juridique ?? null })
    }

    // ── MODE MASQUER_ALERTE : faux positif ────────────────────────────────────
    if (action === 'masquer_alerte') {
      const alerteId = typeof body.alerte_id === 'string' ? body.alerte_id : null
      if (!alerteId) return json({ error: 'alerte_id requis' }, 400)

      const { data: alerte } = await supabase
        .from('alertes_risque')
        .select('organisation_id, code_client')
        .eq('id', alerteId)
        .maybeSingle()
      if (!alerte) return json({ error: 'Alerte introuvable' }, 404)

      if (profil.role !== 'superadmin' && alerte.organisation_id !== profil.organisation_id)
        return json({ error: 'Accès non autorisé' }, 403)

      const { error: errMasque } = await supabase
        .from('alertes_risque')
        .update({ masquee: true })
        .eq('id', alerteId)
      if (errMasque) return json({ error: errMasque.message }, 400)

      await mettreAJourStatutClient(
        supabase,
        alerte.organisation_id as string,
        alerte.code_client as string
      )

      return json({ ok: true })
    }

    // Mode quotidien (cross-org) : superadmin uniquement
    if (!orgId && profil.role !== 'superadmin')
      return json({ error: 'Le mode quotidien est réservé au superadmin' }, 403)

    // Mode onboarding : admin limité à sa propre org
    if (orgId && profil.role === 'admin' && orgId !== profil.organisation_id)
      return json({ error: 'Accès non autorisé à cette organisation' }, 403)

    const résumé = orgId
      ? await scanOnboarding(supabase, orgId, dateMin)
      : await scanQuotidien(supabase)

    console.log('[bodacc-sync] terminé :', résumé)
    return json(résumé)

  } catch (err) {
    console.error('[bodacc-sync] erreur critique :', err)
    return json({ error: String(err) }, 500)
  }
})
