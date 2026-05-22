// Edge Function — Veille BODACC quotidienne
// Surveille BODACC-B (procédures collectives) et BODACC-C (radiations)
// pour tous les clients ayant un SIRET renseigné.
// Déclenchée par pg_cron chaque matin à 6h.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const BODACC_BASE   = 'https://bodacc-datadiffu.dila.gouv.fr/api/records/1.0/search'

// Types de procédures à impact financier sur la dette client
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

// SIREN = 9 premiers chiffres du SIRET
function siretToSiren(siret: string): string {
  return siret.replace(/\s/g, '').slice(0, 9)
}

// Fenêtre de recherche : 90 jours en arrière (capture les événements récents + nouveaux SIRETs)
function dateMin90j(): string {
  const d = new Date()
  d.setDate(d.getDate() - 90)
  return d.toISOString().slice(0, 10)
}

type TypeProcedure = 'liquidation' | 'redressement' | 'sauvegarde' | 'radiation' | 'cloture' | 'autre'

function classifierType(fields: Record<string, unknown>, famille: string): TypeProcedure {
  if (famille === 'BODACC-C') return 'radiation'

  const jugement = fields['jugement'] as Record<string, unknown> | undefined
  const texte = [
    fields['familleavis_lib'],
    fields['familleavis'],
    fields['typeavis'],
    jugement?.['nature'],
    jugement?.['complementJugement'],
  ].filter(Boolean).join(' ').toLowerCase()

  if (texte.includes('liquidation'))                        return 'liquidation'
  if (texte.includes('redressement'))                       return 'redressement'
  if (texte.includes('sauvegarde'))                         return 'sauvegarde'
  if (texte.includes('clôture') || texte.includes('cloture')) return 'cloture'
  return 'autre'
}

function buildDescription(fields: Record<string, unknown>, famille: string): string {
  if (famille === 'BODACC-C') return 'Radiation du registre du commerce et des sociétés'

  const jugement = fields['jugement'] as Record<string, unknown> | undefined
  return [
    jugement?.['nature'],
    fields['tribunal'],
    jugement?.['complementJugement'],
  ].filter(Boolean).join(' — ').slice(0, 500) as string
}

interface BodaccRecord {
  recordid: string
  fields: Record<string, unknown>
}

async function queryBodacc(
  dataset: 'bodacc-b' | 'bodacc-c',
  siren: string,
  dateMin: string,
): Promise<BodaccRecord[]> {
  const url = new URL(BODACC_BASE)
  url.searchParams.set('dataset', dataset)
  url.searchParams.set('q', `registre.siren:${siren} AND dateparution>=${dateMin}`)
  url.searchParams.set('rows', '10')
  url.searchParams.set('sort', '-dateparution')

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json() as { records?: BodaccRecord[] }
    return data.records ?? []
  } catch (err) {
    console.warn(`[bodacc-sync] BODACC ${dataset} SIREN ${siren} :`, err)
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
    const dateMin  = dateMin90j()

    // Tous les clients avec SIRET renseigné, toutes organisations confondues
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
      const siren = siretToSiren(client.siret)

      // Requête BODACC-B (procédures collectives)
      const recordsB = await queryBodacc('bodacc-b', siren, dateMin)
      await sleep(250)

      // Requête BODACC-C (radiations)
      const recordsC = await queryBodacc('bodacc-c', siren, dateMin)
      await sleep(250)

      const toutes = [
        ...recordsB.map(r => ({
          organisation_id: client.organisation_id,
          code_client:     client.code_dso,
          siret:           client.siret,
          bodacc_id:       r.recordid,
          famille:         'BODACC-B',
          type_procedure:  classifierType(r.fields, 'BODACC-B'),
          tribunal:        (r.fields['tribunal'] as string | null) ?? null,
          date_jugement:   ((r.fields['jugement'] as Record<string, unknown> | undefined)?.['date'] as string | null) ?? null,
          date_parution:   (r.fields['dateparution'] as string | null) ?? null,
          description:     buildDescription(r.fields, 'BODACC-B'),
        })),
        ...recordsC.map(r => ({
          organisation_id: client.organisation_id,
          code_client:     client.code_dso,
          siret:           client.siret,
          bodacc_id:       r.recordid,
          famille:         'BODACC-C',
          type_procedure:  'radiation' as TypeProcedure,
          tribunal:        null,
          date_jugement:   null,
          date_parution:   (r.fields['dateparution'] as string | null) ?? null,
          description:     buildDescription(r.fields, 'BODACC-C'),
        })),
      ].filter(a => TYPES_SURVEILLÉS.includes(a.type_procedure))

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
      clients_traités: rows.length,
      alertes_insérées: nbNouvelles,
      erreurs: erreursLog,
    }
    console.log('[bodacc-sync] terminé :', résumé)
    return json(résumé)

  } catch (err) {
    console.error('[bodacc-sync] erreur critique :', err)
    return json({ error: String(err) }, 500)
  }
})
