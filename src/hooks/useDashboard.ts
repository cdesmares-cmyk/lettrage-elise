import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAppData } from '../contexts/AppDataContext'
import type { FactureDetail } from '../types/client'

export type PeriodeEncaissement = 'semaine' | 'mois' | 'trimestre' | 'annee'
export type TopNb = 5 | 10 | 15
export type SeuilAnciennete = 3 | 6 | 12 | 18 | 24

export interface TopClient { code: string; nom: string; montant: number }
export interface TopFacture {
  numero: string; nomClient: string; montant: number
  dateEcheance: string | null; joursRetard: number
}
export interface TrancheAge { label: string; montant: number }
export interface PointEncaissement { label: string; courant: number; precedent: number }

const _ref = new Date()
_ref.setHours(0, 0, 0, 0)
const TODAY = _ref

function echeanceEff(f: FactureDetail): Date {
  if (f.date_echeance) return new Date(f.date_echeance)
  return new Date(new Date(f.date_emission).getTime() + 15 * 86400000)
}
function nbJoursRetard(f: FactureDetail): number {
  const e = echeanceEff(f)
  return e < TODAY ? Math.floor((TODAY.getTime() - e.getTime()) / 86400000) : 0
}
function estEchu(f: FactureDetail): boolean { return echeanceEff(f) < TODAY }
// Heure locale — évite le décalage UTC qui décale les mois en France (UTC+1/+2)
function isoMois(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function computeTopClients(factures: FactureDetail[], n: number): TopClient[] {
  const map = new Map<string, TopClient>()
  factures.forEach(f => {
    if (f.reste_du <= 0.005) return
    const e = map.get(f.code_client)
    if (e) e.montant += f.reste_du
    else map.set(f.code_client, { code: f.code_client, nom: f.nom_client ?? f.code_client, montant: f.reste_du })
  })
  return [...map.values()].sort((a, b) => b.montant - a.montant).slice(0, n)
}

function computeTopFactures(factures: FactureDetail[]): TopFacture[] {
  return factures
    .filter(f => f.reste_du > 0.005)
    .sort((a, b) => b.reste_du - a.reste_du)
    .slice(0, 10)
    .map(f => ({
      numero: f.numero_piece,
      nomClient: f.nom_client ?? f.code_client,
      montant: f.reste_du,
      dateEcheance: f.date_echeance,
      joursRetard: nbJoursRetard(f),
    }))
}

function computeBalanceAgee(factures: FactureDetail[]): TrancheAge[] {
  const sums = [0, 0, 0, 0, 0]
  factures.forEach(f => {
    if (f.reste_du <= 0.005) return
    if (!estEchu(f)) { sums[0] += f.reste_du; return }
    const jr = nbJoursRetard(f)
    if (jr <= 30) sums[1] += f.reste_du
    else if (jr <= 60) sums[2] += f.reste_du
    else if (jr <= 90) sums[3] += f.reste_du
    else sums[4] += f.reste_du
  })
  return [
    { label: 'Non échu', montant: sums[0] },
    { label: '1 – 30j', montant: sums[1] },
    { label: '31 – 60j', montant: sums[2] },
    { label: '61 – 90j', montant: sums[3] },
    { label: '+90j', montant: sums[4] },
  ]
}

function computeEncaissements(
  raw: { date_lettrage: string; montant: number }[],
  periode: PeriodeEncaissement
): PointEncaissement[] {
  type Bucket = { label: string; start: string; end: string; startP: string; endP: string }
  const buckets: Bucket[] = []
  const now = TODAY

  function shiftAnIso(iso: string): string {
    const d = new Date(iso); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10)
  }
  function shiftSemIso(iso: string): string {
    const d = new Date(iso); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10)
  }

  if (periode === 'semaine') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      const iso = d.toISOString().slice(0, 10)
      buckets.push({ label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }), start: iso, end: iso, startP: shiftSemIso(iso), endP: shiftSemIso(iso) })
    }
  } else if (periode === 'mois') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const endD = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
      const s = d.toISOString().slice(0, 10), e = endD.toISOString().slice(0, 10)
      buckets.push({ label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), start: s, end: e, startP: shiftAnIso(s), endP: shiftAnIso(e) })
    }
  } else if (periode === 'trimestre') {
    const cQ = Math.floor(now.getMonth() / 3)
    for (let i = 3; i >= 0; i--) {
      let qIdx = cQ - i; let yr = now.getFullYear()
      while (qIdx < 0) { qIdx += 4; yr-- }
      const startD = new Date(yr, qIdx * 3, 1)
      const endD = new Date(yr, qIdx * 3 + 3, 0)
      const s = startD.toISOString().slice(0, 10), e = endD.toISOString().slice(0, 10)
      buckets.push({ label: `T${qIdx + 1} ${yr}`, start: s, end: e, startP: shiftAnIso(s), endP: shiftAnIso(e) })
    }
  } else {
    for (let i = 1; i >= 0; i--) {
      const yr = now.getFullYear() - i
      buckets.push({ label: String(yr), start: `${yr}-01-01`, end: `${yr}-12-31`, startP: `${yr - 1}-01-01`, endP: `${yr - 1}-12-31` })
    }
  }

  return buckets.map(b => ({
    label: b.label,
    courant: raw.filter(l => l.date_lettrage >= b.start && l.date_lettrage <= b.end).reduce((s, l) => s + l.montant, 0),
    precedent: raw.filter(l => l.date_lettrage >= b.startP && l.date_lettrage <= b.endP).reduce((s, l) => s + l.montant, 0),
  }))
}

export function useDashboard() {
  const { facturesActives, clients, moisMaxFactures, ca12Mois } = useAppData()
  const [exclureDernierMois, setExclureDernierMois] = useState(false)
  const [topNbClients, setTopNbClients] = useState<TopNb>(10)
  const [periodeEncaissement, setPeriodeEncaissement] = useState<PeriodeEncaissement>('mois')
  const [afficherNm1, setAfficherNm1] = useState(false)
  const [seuilAnciennete, setSeuilAnciennete] = useState<SeuilAnciennete>(18)
  const [lettragesRaw, setLettragesRaw] = useState<{ date_lettrage: string; montant: number }[]>([])
  const [chargement, setChargement] = useState(true)

  // Encaissements 24 mois — indépendant de moisMax
  useEffect(() => {
    const il24Mois = new Date(TODAY); il24Mois.setFullYear(il24Mois.getFullYear() - 2)
    supabase.from('lettrages').select('date_lettrage, montant')
      .gte('date_lettrage', il24Mois.toISOString().slice(0, 10))
      .gt('montant', 0).order('date_lettrage').limit(20000)
      .then(({ data }) => {
        if (data) setLettragesRaw(data as { date_lettrage: string; montant: number }[])
        setChargement(false)
      })
  }, [])

  const factures = useMemo(
    () => facturesActives.filter(f => !f.numero_piece.endsWith('_compte') && !f.est_avoir),
    [facturesActives]
  )

  // moisMax = moisMaxFactures depuis AppDataContext (déjà M-1 corrigé, issu du vrai max BDD)
  // On n'utilise plus le max des impayées en mémoire qui peut être en retard si tous les
  // derniers mois sont soldés, et qui causerait un DSO incohérent avec le toggle exclureDernierMois
  const moisMax = moisMaxFactures

  // M-1 et N-1 calculés par rapport à moisMax, pas au calendrier
  const moisRefYear = moisMax ? parseInt(moisMax.slice(0, 4)) : TODAY.getFullYear()
  const moisRefMonth = moisMax ? parseInt(moisMax.slice(5, 7)) : TODAY.getMonth() + 1  // 1-indexed
  const moisPrecDate = new Date(moisRefYear, moisRefMonth - 2, 1)   // mois avant moisMax
  const moisAnPrecDate = new Date(moisRefYear - 1, moisRefMonth - 1, 1)  // même mois, an-1
  const moisPrecStr = isoMois(moisPrecDate)
  const moisAnPrecStr = isoMois(moisAnPrecDate)

  const facsFiltrees = useMemo(
    () => exclureDernierMois ? factures.filter(f => (f.date_emission?.slice(0, 7) ?? '') < moisMax) : factures,
    [factures, exclureDernierMois, moisMax]
  )

  const impayeesEchues = useMemo(() => facsFiltrees.filter(f => f.reste_du > 0.005 && estEchu(f)), [facsFiltrees])
  const nbImpayeesEchues = impayeesEchues.length
  const nbClientsEchus = useMemo(() => new Set(impayeesEchues.map(f => f.code_client)).size, [impayeesEchues])

  // Encours et DSO réactifs au toggle — calculés sur facsFiltrees
  const encoursCourant = useMemo(
    () => facsFiltrees.filter(f => f.reste_du > 0.005).reduce((s, f) => s + f.reste_du, 0),
    [facsFiltrees]
  )
  const encours12Mois = useMemo(() => {
    if (!moisMaxFactures) return 0
    const yr = parseInt(moisMaxFactures.slice(0, 4)), mo = parseInt(moisMaxFactures.slice(5, 7))
    let startMo = mo - 11; let startYr = yr
    if (startMo <= 0) { startMo += 12; startYr -= 1 }
    const il12MoisStr = `${startYr}-${String(startMo).padStart(2, '0')}-01`
    const lastDay = new Date(yr, mo, 0).getDate()
    const moisMaxEndStr = `${yr}-${String(mo).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return facsFiltrees
      .filter(f => f.reste_du > 0.005
        && (f.date_emission ?? '') >= il12MoisStr
        && (f.date_emission ?? '') <= moisMaxEndStr)
      .reduce((s, f) => s + f.reste_du, 0)
  }, [facsFiltrees, moisMaxFactures])
  const dsoRoulant = ca12Mois > 0 ? encours12Mois / ca12Mois * 365 : null
  console.log('[DSO-DB] moisMaxFactures:', moisMaxFactures, '| ca12Mois:', ca12Mois, '| encours12Mois:', encours12Mois, '| dso:', dsoRoulant)

  const montantMoisPrec = useMemo(
    () => factures.filter(f => f.reste_du > 0.005 && f.date_emission?.slice(0, 7) === moisPrecStr).reduce((s, f) => s + f.reste_du, 0),
    [factures, moisPrecStr]
  )
  const montantAnPrec = useMemo(
    () => factures.filter(f => f.reste_du > 0.005 && f.date_emission?.slice(0, 7) === moisAnPrecStr).reduce((s, f) => s + f.reste_du, 0),
    [factures, moisAnPrecStr]
  )
  const montantSeuilMois = useMemo(() => {
    const dateRef = new Date(TODAY.getFullYear(), TODAY.getMonth() - seuilAnciennete, 1)
    return factures.filter(f => f.reste_du > 0.005 && f.date_emission && new Date(f.date_emission) < dateRef).reduce((s, f) => s + f.reste_du, 0)
  }, [factures, seuilAnciennete])

  const topClients = useMemo(() => computeTopClients(facsFiltrees, topNbClients), [facsFiltrees, topNbClients])
  const topFactures = useMemo(() => computeTopFactures(facsFiltrees), [facsFiltrees])
  const balanceAgee = useMemo(() => computeBalanceAgee(facsFiltrees), [facsFiltrees])
  const pointsEncaissement = useMemo(() => computeEncaissements(lettragesRaw, periodeEncaissement), [lettragesRaw, periodeEncaissement])

  const moisExclusLabel = moisMax
    ? new Date(moisMax + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    : ''

  return {
    nbImpayeesEchues, nbClientsEchus, dsoRoulant,
    exclureDernierMois, setExclureDernierMois, moisExclusLabel,
    montantMoisPrec, montantAnPrec,
    montantSeuilMois, seuilAnciennete, setSeuilAnciennete,
    libelleMoisPrec: moisPrecDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    libelleMoisAnPrec: moisAnPrecDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    topClients, topNbClients, setTopNbClients,
    topFactures, balanceAgee,
    pointsEncaissement, periodeEncaissement, setPeriodeEncaissement,
    afficherNm1, setAfficherNm1,
    labelPeriodePrec: ({ semaine: 'S-1', mois: 'M-1', trimestre: 'T-1', annee: 'N-1' } as const)[periodeEncaissement],
    encoursCourant, chargement,
    factures, clients,
  }
}
