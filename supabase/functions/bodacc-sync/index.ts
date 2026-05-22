// Edge Function — Veille BODACC quotidienne
// Dataset unique : annonces-commerciales (bodacc-datadila.opendatasoft.com)
// Procédures collectives : familleavis="collective"
// Déclenchée par pg_cron chaque matin à 6h.
// Flux : alertes_risque (upsert) → clients.statut_juridique (mise à jour auto)

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

function dateMin90j(): string {
  const d = new Date()
  d.setDate(d.getDate() - 90)
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
  [key: string]: unknown
}

function parseJugement(raw: string | null): Jugement | null {
  if (!raw) return null
  try { return JSON.parse(raw) as Jugement } catch { return null }
}

function classifierType(r: BodaccRecord): TypeProcedure {
  const jugement = parseJugement(r.jugement)
  const texte = [
    r.familleavis_lib,
    r.familleavis,
    r.typeavis,
    jugement?.nature,
    jugement?.complementJugement,
    jugement?.famille,
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

async function queryBodacc(filtre: string, dateMin: string): Promise<BodaccRecord[]> {
  const url = new URL(BODACC_BASE)
  url.searchParams.set('where', `(${filtre}) AND dateparution>="${dateMin}"`)
  url.searchParams.set('order_by', 'dateparution desc')
  url.searchParams.set('limit', '10')

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
    if (!res.ok) {
      console.warn(`[bodacc-sync] HTTP ${res.status} — ${url.toString()}`)
      return []
    }
    const data = await res.json() as { results?: BodaccRecord[] }
    return data.results ?? []
  } catch (err) {
    console.warn(`[bodacc-sync] erreur fetch :`, err)
    return []
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Lit toutes les alertes en base et met à jour statut_juridique pour chaque client concerné.
// Priorité : liquidation > redressement > sauvegarde > cloture
async function mettreAJourStatuts(supabase: ReturnType<typeof createClient>): Promise<number> {
  const { data: alertes } = await supabase
    .from('alertes_risque')
    .select('organisation_id, code_client, type_procedure')

  if (!alertes?.length) return 0

  // Alerte la plus grave par (organisation_id, code_client)
  const parClient: Record<string, { org: string; code: string; type: string }> = {}
  for (const a of alertes as Array<{ organisation_id: string; code_client: string; type_procedure: string }>) {
    const key = `${a.organisation_id}__${a.code_client}`
    const actuel = parClient[key]
    if (!actuel || (PRIORITE[a.type_procedure] ?? 99) < (PRIORITE[actuel.type] ?? 99)) {
      parClient[key] = { org: a.organisation_id, code: a.code_client, type: a.type_procedure }
    }
  }

  // Regrouper par (org, type) pour une update par lot
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // Paramètres optionnels du body :
    //   date_min      : "2020-01-01"     — fenêtre historique (défaut 90j)
    //   code_clients  : ["61538"]        — cibler des clients spécifiques
    //   offset_clients: 0                — pagination (défaut 0)
    //   limit_clients : 200              — taille du lot (défaut 200)
    let dateMin       = dateMin90j()
    let codeCibles:   string[] = []
    let offsetClients = 0
    let limitClients  = 200
    try {
      const body = await req.json() as Record<string, unknown>
      if (typeof body?.date_min === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date_min)) {
        dateMin = body.date_min
      }
      if (Array.isArray(body?.code_clients)) {
        codeCibles = (body.code_clients as unknown[]).map(String)
      }
      if (typeof body?.offset_clients === 'number') offsetClients = body.offset_clients
      if (typeof body?.limit_clients  === 'number') limitClients  = body.limit_clients
    } catch { /* body vide → valeurs par défaut */ }

    let query = supabase
      .from('clients')
      .select('code_dso, siret, organisation_id')
      .not('siret', 'is', null)
      .neq('siret', '')

    if (codeCibles.length > 0) {
      query = query.in('code_dso', codeCibles)
    } else {
      query = query.range(offsetClients, offsetClients + limitClients - 1)
    }

    const { data: clients, error: errClients } = await query
    if (errClients) return json({ error: errClients.message }, 500)

    const rows = (clients ?? []) as Array<{
      code_dso: string
      siret: string
      organisation_id: string
    }>

    console.log(`[bodacc-sync] ${rows.length} clients — fenêtre ${dateMin} → aujourd'hui`)

    let nbNouvelles = 0
    const erreursLog: string[] = []

    for (const client of rows) {
      const siren      = siretToSiren(client.siret)
      const sirenSpace = sirenAvecEspaces(siren)
      const filtreRegistre = `registre="${siren}" OR registre="${sirenSpace}"`

      const records = await queryBodacc(
        `familleavis="collective" AND (${filtreRegistre})`,
        dateMin,
      )
      await sleep(250)

      const toutes = records
        .map(r => ({
          organisation_id: client.organisation_id,
          code_client:     client.code_dso,
          siret:           client.siret,
          bodacc_id:       r.id,
          famille:         'BODACC-A/B',
          type_procedure:  classifierType(r),
          tribunal:        r.tribunal ?? null,
          date_jugement:   parseJugement(r.jugement)?.date ?? null,
          date_parution:   r.dateparution ?? null,
          description:     buildDescription(r),
        }))
        .filter(a => TYPES_SURVEILLÉS.includes(a.type_procedure))

      if (!toutes.length) continue

      const { error: errInsert } = await supabase
        .from('alertes_risque')
        .upsert(toutes, { onConflict: 'organisation_id,bodacc_id', ignoreDuplicates: true })

      if (errInsert) {
        erreursLog.push(`${client.code_dso}: ${errInsert.message}`)
      } else {
        nbNouvelles += toutes.length
      }
    }

    // Mise à jour automatique de statut_juridique depuis toute la table alertes_risque
    const nbStatutsMaj = await mettreAJourStatuts(supabase)

    const résumé = {
      clients_traités:   rows.length,
      alertes_insérées:  nbNouvelles,
      statuts_mis_a_jour: nbStatutsMaj,
      erreurs:           erreursLog,
    }
    console.log('[bodacc-sync] terminé :', résumé)
    return json(résumé)

  } catch (err) {
    console.error('[bodacc-sync] erreur critique :', err)
    return json({ error: String(err) }, 500)
  }
})
