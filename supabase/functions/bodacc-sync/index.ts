// Edge Function — Veille BODACC v3
// ─────────────────────────────────────────────────────────────────────────────
// Mode quotidien  (sans org_id) : approche inversée
//   BODACC → tous les SIRENs du jour → match clients → alertes + statuts
//   Scalable à l'infini : 2 000 ou 2 000 000 clients = même nombre d'appels API
//
// Mode onboarding (avec org_id) : scan historique client-par-client
//   date_min auto = date de la facture la plus ancienne du tenant
//   Exécuté une seule fois à l'arrivée d'un nouveau tenant
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

// Pagine l'API BODACC sans limite — prend tout ce qui est publié depuis dateMin
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
  // Index records par SIREN (format sans espaces)
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
        // notifie_le : null par défaut → Phase 4 emails lira WHERE notifie_le IS NULL
      })
    }
  }
  return alertes
}

// Lit toutes les alertes et met à jour statut_juridique (priorité : liquidation > redressement > sauvegarde > cloture)
async function mettreAJourStatuts(supabase: ReturnType<typeof createClient>): Promise<number> {
  // Pagination pour dépasser la limite PostgREST de 1000 lignes
  const alertes: Array<{ organisation_id: string; code_client: string; type_procedure: string }> = []
  const PAGE = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('alertes_risque')
      .select('organisation_id, code_client, type_procedure')
      .range(offset, offset + PAGE - 1)
    if (error || !data?.length) break
    alertes.push(...(data as typeof alertes))
    if (data.length < PAGE) break
    offset += PAGE
  }

  if (!alertes.length) return 0

  const parClient: Record<string, { org: string; code: string; type: string }> = {}
  for (const a of alertes as Array<{ organisation_id: string; code_client: string; type_procedure: string }>) {
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
      if (!error) nbMaj += codes.slice(i, i + 500).length
    }
  }
  return nbMaj
}

// ─── MODE QUOTIDIEN : approche inversée ──────────────────────────────────────
async function scanQuotidien(supabase: ReturnType<typeof createClient>) {
  const dateMin = dateHier()
  const filtre  = `familleavis="collective" AND dateparution>="${dateMin}"`

  // 1. Toutes les publications BODACC depuis hier (pagination automatique, sans limite)
  const records = await fetchAllBodacc(filtre)
  if (!records.length) return { mode: 'quotidien', alertes_insérées: 0, statuts_mis_a_jour: 0 }

  // 2. SIRENs uniques trouvés dans le batch (format 9 chiffres sans espaces)
  const sirens = [...new Set(
    records.flatMap(r => (r.registre ?? []).map(s => s.replace(/\s/g, '')).filter(s => /^\d{9}$/.test(s)))
  )]
  console.log(`[bodacc-sync] ${sirens.length} SIRENs uniques dans le batch BODACC`)

  // 3. Un seul appel SQL : tous les clients de toutes les orgs qui matchent ces SIRENs
  // Un SIREN peut matcher plusieurs orgs → tous sont retournés (multi-tenant)
  const { data: clients, error: errClients } = await supabase
    .rpc('match_clients_par_siren', { sirens })
  if (errClients) throw new Error(errClients.message)

  const rows = (clients ?? []) as ClientRow[]
  console.log(`[bodacc-sync] ${rows.length} clients matchés (toutes orgs)`)

  // 4. Construire et insérer les alertes
  const alertes = construireAlertes(records, rows)
  let nbInsérées = 0
  for (let i = 0; i < alertes.length; i += 500) {
    const { error } = await supabase
      .from('alertes_risque')
      .upsert(alertes.slice(i, i + 500) as never, { onConflict: 'organisation_id,bodacc_id', ignoreDuplicates: true })
    if (!error) nbInsérées += alertes.slice(i, i + 500).length
  }

  // 5. Mise à jour statut_juridique
  const nbStatuts = await mettreAJourStatuts(supabase)

  return { mode: 'quotidien', records_bodacc: records.length, sirens_uniques: sirens.length, clients_matchés: rows.length, alertes_insérées: nbInsérées, statuts_mis_a_jour: nbStatuts }
}

// ─── MODE ONBOARDING : scan historique client-par-client pour un tenant ──────
async function scanOnboarding(supabase: ReturnType<typeof createClient>, orgId: string, dateMinParam: string | null) {
  // date_min = paramètre fourni OU date de la facture la plus ancienne du tenant
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

  // Pagination pour dépasser la limite PostgREST de 1000 lignes
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
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    let orgId: string | null    = null
    let dateMin: string | null  = null
    try {
      const body = await req.json() as Record<string, unknown>
      if (typeof body?.org_id === 'string')   orgId   = body.org_id
      if (typeof body?.date_min === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date_min)) {
        dateMin = body.date_min
      }
    } catch { /* body vide = mode quotidien */ }

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
