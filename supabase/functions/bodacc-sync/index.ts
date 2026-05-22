// Edge Function — Veille BODACC quotidienne
// Dataset unique : annonces-commerciales (bodacc-datadila.opendatasoft.com)
// Procédures collectives : familleavis="collective"
// Radiations            : publicationavis="C"
// Déclenchée par pg_cron chaque matin à 6h.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BODACC_BASE  = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records'

const TYPES_SURVEILLÉS = ['liquidation', 'redressement', 'sauvegarde', 'radiation', 'cloture']

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

// SIREN avec espaces : "532241874" → "532 241 874" (format stocké dans registre)
function sirenAvecEspaces(siren: string): string {
  return `${siren.slice(0, 3)} ${siren.slice(3, 6)} ${siren.slice(6, 9)}`
}

function dateMin90j(): string {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return d.toISOString().slice(0, 10)
}

type TypeProcedure = 'liquidation' | 'redressement' | 'sauvegarde' | 'radiation' | 'cloture' | 'autre'

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
  jugement: string | null   // JSON string à parser
  [key: string]: unknown
}

function parseJugement(raw: string | null): Jugement | null {
  if (!raw) return null
  try { return JSON.parse(raw) as Jugement } catch { return null }
}

function classifierType(r: BodaccRecord): TypeProcedure {
  if (r.publicationavis === 'C') return 'radiation'

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
  if (r.publicationavis === 'C') return 'Radiation du registre du commerce et des sociétés'
  const jugement = parseJugement(r.jugement)
  return [
    jugement?.nature,
    r.tribunal,
    jugement?.complementJugement,
  ].filter(Boolean).join(' — ').slice(0, 500)
}

async function queryBodacc(
  filtre: string,
  dateMin: string,
): Promise<BodaccRecord[]> {
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

    // date_min optionnel dans le body — ex: {"date_min":"2024-01-01"} pour backfill
    let dateMin = dateMin90j()
    try {
      const body = await req.json() as Record<string, unknown>
      if (typeof body?.date_min === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date_min)) {
        dateMin = body.date_min
      }
    } catch { /* body vide → fenêtre par défaut */ }

    const { data: clients, error: errClients } = await supabase
      .from('clients')
      .select('code_dso, siret, organisation_id')
      .not('siret', 'is', null)
      .neq('siret', '')

    if (errClients) return json({ error: errClients.message }, 500)

    const rows = (clients ?? []) as Array<{
      code_dso: string
      siret: string
      organisation_id: string
    }>

    console.log(`[bodacc-sync] ${rows.length} clients avec SIRET — fenêtre ${dateMin} → aujourd'hui`)

    let nbNouvelles = 0
    const erreursLog: string[] = []

    for (const client of rows) {
      const siren      = siretToSiren(client.siret)
      const sirenSpace = sirenAvecEspaces(siren)
      // Filtre SIREN : les deux formats stockés dans le champ multivalué registre
      const filtreRegistre = `registre="${siren}" OR registre="${sirenSpace}"`

      // Procédures collectives (liquidation, redressement, sauvegarde)
      const recordsCollectives = await queryBodacc(
        `familleavis="collective" AND (${filtreRegistre})`,
        dateMin,
      )
      await sleep(250)

      // Radiations
      const recordsRadiations = await queryBodacc(
        `publicationavis="C" AND (${filtreRegistre})`,
        dateMin,
      )
      await sleep(250)

      const toutes = [...recordsCollectives, ...recordsRadiations]
        .map(r => ({
          organisation_id: client.organisation_id,
          code_client:     client.code_dso,
          siret:           client.siret,
          bodacc_id:       r.id,
          famille:         r.publicationavis === 'C' ? 'BODACC-C' : 'BODACC-A/B',
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

    const résumé = {
      clients_traités:  rows.length,
      alertes_insérées: nbNouvelles,
      erreurs:          erreursLog,
    }
    console.log('[bodacc-sync] terminé :', résumé)
    return json(résumé)

  } catch (err) {
    console.error('[bodacc-sync] erreur critique :', err)
    return json({ error: String(err) }, 500)
  }
})
