import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAppData } from '../contexts/AppDataContext'
import { useAuth } from '../contexts/AuthContext'
import { useAlertesScore } from './useAlertesScore'
import type { FactureDetail } from '../types/client'

export type PeriodeEncaissement = 'jour' | 'semaine' | 'mois' | 'trimestre' | 'annee'
export type TopNb = 5 | 10 | 15
export type SeuilAnciennete = 3 | 6 | 12 | 18 | 24

export interface TopClient { code: string; nom: string; montant: number }
/** Un portefeuille = l'ensemble des clients rattaches a un utilisateur.
 *  L'identifiant special 'aucun' porte les clients sans commercial. */
export interface Portefeuille { id: string; label: string; nb: number }
export interface CouvertureRelance {
  enRetard: number      // clients du portefeuille ayant au moins une facture echue
  relances: number      // ... dont une relance date de 30 jours ou moins
  enAttente: number     // ... les autres : c'est la liste de travail
}
export interface JourActiviteRelance { date_operation: string; operateur_id: string | null; nb_relances: number; montant: number }
export interface PointActiviteRelance { label: string; nb_relances: number; montant: number }
export interface TopFacture {
  numero: string; nomClient: string; montant: number
  dateEcheance: string | null; joursRetard: number
}
export interface TrancheAge { label: string; montant: number }
export interface PointEncaissement { label: string; client: number; autres: number }

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

function computeTopFactures(factures: FactureDetail[], nb: number): TopFacture[] {
  return factures
    .filter(f => f.reste_du > 0.005)
    .sort((a, b) => b.reste_du - a.reste_du)
    .slice(0, nb)
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

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function computeEncaissements(
  raw: { date_operation: string; montant: number; montant_autres: number }[],
  periode: PeriodeEncaissement
): PointEncaissement[] {
  type Bucket = { label: string; start: string; end: string }
  const buckets: Bucket[] = []
  const now = TODAY

  if (periode === 'jour') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      buckets.push({ label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }), start: isoDate(d), end: isoDate(d) })
    }
  } else if (periode === 'semaine') {
    for (let i = 11; i >= 0; i--) {
      const end = new Date(now); end.setDate(end.getDate() - i * 7)
      const start = new Date(end); start.setDate(start.getDate() - 6)
      buckets.push({ label: `S ${start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`, start: isoDate(start), end: isoDate(end) })
    }
  } else if (periode === 'mois') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const endD = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
      buckets.push({ label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), start: isoDate(d), end: isoDate(endD) })
    }
  } else if (periode === 'trimestre') {
    const cQ = Math.floor(now.getMonth() / 3)
    for (let i = 3; i >= 0; i--) {
      let qIdx = cQ - i; let yr = now.getFullYear()
      while (qIdx < 0) { qIdx += 4; yr-- }
      const startD = new Date(yr, qIdx * 3, 1)
      const endD = new Date(yr, qIdx * 3 + 3, 0)
      buckets.push({ label: `T${qIdx + 1} ${yr}`, start: isoDate(startD), end: isoDate(endD) })
    }
  } else {
    for (let i = 1; i >= 0; i--) {
      const yr = now.getFullYear() - i
      buckets.push({ label: String(yr), start: `${yr}-01-01`, end: `${yr}-12-31` })
    }
  }

  return buckets.map(b => {
    const slice = raw.filter(l => l.date_operation >= b.start && l.date_operation <= b.end)
    return {
      label:  b.label,
      client: slice.reduce((s, l) => s + l.montant, 0),
      // montant_autres : credits bancaires non rattaches a un client — aides
      // publiques, remboursements. Le ?? 0 protege le cas ou la fonction SQL
      // n'a pas encore ete mise a jour en base.
      autres: slice.reduce((s, l) => s + (l.montant_autres ?? 0), 0),
    }
  })
}

function computeActiviteRelances(
  raw: JourActiviteRelance[],
  periode: PeriodeEncaissement,
  // Chaine vide = tous les operateurs. Le filtrage se fait ici, sur des donnees
  // deja chargees : changer d'operateur ne declenche aucune requete.
  operateurId: string
): PointActiviteRelance[] {
  type Bucket = { label: string; start: string; end: string }
  const buckets: Bucket[] = []
  const now = TODAY

  if (periode === 'jour') {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      buckets.push({ label: d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' }), start: isoDate(d), end: isoDate(d) })
    }
  } else if (periode === 'semaine') {
    for (let i = 11; i >= 0; i--) {
      const end = new Date(now); end.setDate(end.getDate() - i * 7)
      const start = new Date(end); start.setDate(start.getDate() - 6)
      buckets.push({ label: `S ${start.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}`, start: isoDate(start), end: isoDate(end) })
    }
  } else if (periode === 'mois') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const endD = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
      buckets.push({ label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), start: isoDate(d), end: isoDate(endD) })
    }
  } else if (periode === 'trimestre') {
    const cQ = Math.floor(now.getMonth() / 3)
    for (let i = 3; i >= 0; i--) {
      let qIdx = cQ - i; let yr = now.getFullYear()
      while (qIdx < 0) { qIdx += 4; yr-- }
      const startD = new Date(yr, qIdx * 3, 1)
      const endD = new Date(yr, qIdx * 3 + 3, 0)
      buckets.push({ label: `T${qIdx + 1} ${yr}`, start: isoDate(startD), end: isoDate(endD) })
    }
  } else {
    for (let i = 1; i >= 0; i--) {
      const yr = now.getFullYear() - i
      buckets.push({ label: String(yr), start: `${yr}-01-01`, end: `${yr}-12-31` })
    }
  }

  const lignes = operateurId ? raw.filter(l => l.operateur_id === operateurId) : raw

  return buckets.map(b => {
    const slice = lignes.filter(l => l.date_operation >= b.start && l.date_operation <= b.end)
    return {
      label:       b.label,
      nb_relances: slice.reduce((s, l) => s + Number(l.nb_relances), 0),
      montant:     slice.reduce((s, l) => s + Number(l.montant), 0),
    }
  })
}

export function useDashboard() {
  const { facturesActives, clients, moisMaxBrut, ca12Mois, ca12MoisPrec, membresOrg } = useAppData()
  // utilisateur.id est l identifiant Supabase, egal a utilisateurs.id
  // (regle d acces : auth.uid() = id). profil ne le porte pas.
  const { utilisateur } = useAuth()
  const { alertes } = useAlertesScore()
  void ca12MoisPrec // conserve pour le bandeau "hors dernier mois" des autres KPI
  const [exclureDernierMois, setExclureDernierMois] = useState(false)
  const [topNbClients, setTopNbClients] = useState<TopNb>(10)
  const [topNbFactures, setTopNbFactures] = useState<TopNb>(10)
  const [periodeEncaissement, setPeriodeEncaissement] = useState<PeriodeEncaissement>('semaine')
  const [seuilAnciennete, setSeuilAnciennete] = useState<SeuilAnciennete>(18)
  const [encaissementsRaw, setEncaissementsRaw] = useState<{ date_operation: string; montant: number; montant_autres: number }[]>([])
  const [activiteRelancesRaw, setActiviteRelancesRaw] = useState<JourActiviteRelance[]>([])
  const [periodeActiviteRelances, setPeriodeActiviteRelances] = useState<PeriodeEncaissement>('mois')
  const [filtreOperateur, setFiltreOperateur] = useState<string>('')
  const [chargement, setChargement] = useState(true)

  // Encaissements clients agrégés par jour sur 24 mois via RPC
  // Source : lettrages (annule=false, hors 471) joints à la date bancaire réelle
  useEffect(() => {
    const il24Mois = new Date(TODAY); il24Mois.setFullYear(il24Mois.getFullYear() - 2)
    supabase.rpc('get_encaissements_clients' as never, { p_date_debut: il24Mois.toISOString().slice(0, 10) } as never)
      .then(({ data }) => {
        if (data) setEncaissementsRaw(data as { date_operation: string; montant: number; montant_autres: number }[])
        setChargement(false)
      })
  }, [])

  // Activité recouvrement : données journalières sur 2 ans — agrégation période côté client
  useEffect(() => {
    const il24Mois = new Date(TODAY); il24Mois.setFullYear(il24Mois.getFullYear() - 2)
    supabase.rpc('get_activite_relances' as never, { p_date_debut: il24Mois.toISOString().slice(0, 10) } as never)
      .then(({ data }) => { if (data) setActiviteRelancesRaw(data as JourActiviteRelance[]) })
  }, [])

  const factures = useMemo(
    () => facturesActives.filter(f => !f.numero_piece.startsWith('411_') && !f.est_avoir),
    [facturesActives]
  )

  // moisMax = vrai mois le plus récent en BDD, mis à jour à chaque import
  const moisMax = moisMaxBrut

  // M-1 et N-1 par rapport à moisMax
  const moisRefYear = moisMax ? parseInt(moisMax.slice(0, 4)) : TODAY.getFullYear()
  const moisRefMonth = moisMax ? parseInt(moisMax.slice(5, 7)) : TODAY.getMonth() + 1
  const moisPrecDate = new Date(moisRefYear, moisRefMonth - 2, 1)
  const moisAnPrecDate = new Date(moisRefYear - 1, moisRefMonth - 1, 1)
  const moisPrecStr = isoMois(moisPrecDate)
  const moisAnPrecStr = isoMois(moisAnPrecDate)

  // Toggle ON → exclut moisMax des données (mois potentiellement incomplet)
  const facsFiltrees = useMemo(
    () => exclureDernierMois ? factures.filter(f => (f.date_emission?.slice(0, 7) ?? '') < moisMax) : factures,
    [factures, exclureDernierMois, moisMax]
  )

  const impayeesEchues = useMemo(() => facsFiltrees.filter(f => f.reste_du > 0.005 && estEchu(f)), [facsFiltrees])
  const nbImpayeesEchues = impayeesEchues.length
  const nbClientsEchus = useMemo(() => new Set(impayeesEchues.map(f => f.code_client)).size, [impayeesEchues])

  const encoursCourant = useMemo(
    () => facsFiltrees.filter(f => f.reste_du > 0.005).reduce((s, f) => s + f.reste_du, 0),
    [facsFiltrees]
  )

  // L'ancien encours12Mois a ete retire : il ne retenait que les factures
  // emises dans les 12 derniers mois, laissant hors du DSO toutes les creances
  // plus anciennes — jusqu'a quatre ans dans les donnees reelles. C'etait
  // l'inverse de ce qu'on attend d'un indicateur de recouvrement, et cela
  // sous-estimait le DSO de pres de 20 %.

  // ── DSO, lecture comptable ──────────────────────────────────────────────
  // Solde par client, puis somme des seuls soldes DEBITEURS.
  //
  // Un bilan ne compense jamais un client debiteur avec un client crediteur :
  // les creances vont a l'actif, les avances recues au passif. En revanche un
  // avoir chez Dupont s'impute bien sur les factures de Dupont. On compense
  // donc DANS chaque client, jamais ENTRE clients.
  //
  // On part de facturesActives et non de factures : il faut les avoirs et les
  // pseudo-pieces 411 pour que la compensation ait un sens.
  //
  // Aucun filtre d'age : une creance de quatre ans pese autant qu'une creance
  // du mois. C'est tout l'interet de l'indicateur. L'ancienne version ne
  // retenait que 12 mois d'emission et sous-estimait le DSO de 20 %.
  const soldesParClient = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of facturesActives) {
      if (Math.abs(f.reste_du) <= 0.005) continue
      m.set(f.code_client, (m.get(f.code_client) ?? 0) + f.reste_du)
    }
    return m
  }, [facturesActives])

  const creancesClients = useMemo(() => {
    let s = 0
    for (const v of soldesParClient.values()) if (v > 0) s += v
    return s
  }, [soldesParClient])

  const nbClientsDebiteurs = useMemo(() => {
    let n = 0
    for (const v of soldesParClient.values()) if (v > 0) n++
    return n
  }, [soldesParClient])

  // Periode du denominateur, pour l'encart d'audit. Fenetre de 12 mois se
  // terminant au mois de reference inclus.
  const dsoPeriode = useMemo(() => {
    if (!moisMax) return ''
    const yr = parseInt(moisMax.slice(0, 4)), mo = parseInt(moisMax.slice(5, 7))
    const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
    return fmt(new Date(yr, mo - 12, 1)) + ' → ' + fmt(new Date(yr, mo - 1, 1))
  }, [moisMax])

  // Le bouton "exclure le dernier mois" ne s'applique plus au DSO : il decalait
  // la fenetre d'un mois, ce qui retirait du numerateur le mois le plus recent
  // — presque entierement impaye — et y ajoutait celui d'il y a un an, presque
  // entierement regle. Le DSO baissait mecaniquement. Le bouton garde ses
  // autres effets, sur les factures echues et l'encours.
  const dsoRoulant = ca12Mois > 0 ? creancesClients / ca12Mois * 365 : null

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

  // ── Portefeuilles commerciaux ──────────────────────────────────────────────
  //
  // Le cadrage s'applique au SEUL bloc d'analyse, pas a la page. Les tuiles du
  // haut restent globales — le DSO notamment, dont le denominateur (le chiffre
  // d'affaires sur 12 mois) n'existe qu'une fois par organisation. Un selecteur
  // en haut de page laisserait croire que tout suit, et un chiffre global pose
  // au milieu de chiffres cadres finit toujours par etre lu de travers.
  const PF_AUCUN = 'aucun'

  const portefeuilles = useMemo<Portefeuille[]>(() => {
    const parId = new Map<string, number>()
    let sansCommercial = 0
    for (const c of clients) {
      if (c.commercial_id) parId.set(c.commercial_id, (parId.get(c.commercial_id) ?? 0) + 1)
      else sansCommercial++
    }
    const liste: Portefeuille[] = membresOrg
      .filter(m => parId.has(m.id))
      .map(m => ({
        id: m.id,
        label: m.prenom ? `${m.prenom} ${m.nom}` : m.nom,
        nb: parId.get(m.id) ?? 0,
      }))
      .sort((a, b) => b.nb - a.nb)
    // « Non attribues » se place apres les vrais portefeuilles : c'est un sujet
    // de travail, pas un residu qu'on releguerait en fin de liste.
    if (sansCommercial > 0) liste.push({ id: PF_AUCUN, label: 'Non attribués', nb: sansCommercial })
    return liste
  }, [clients, membresOrg])

  // Par defaut, chacun ouvre sur SON portefeuille. Sans ce reglage, la
  // fonctionnalite reste un filtre qu'on pense a utiliser ; avec lui, elle
  // devient le tableau de bord de la personne.
  //
  // Le defaut est DEDUIT, pas pose par un effet : null = « je n'ai pas encore
  // choisi », et la chaine vide = « j'ai choisi tout le portefeuille ». Les deux
  // se distinguent, donc un clic sur « Tout le portefeuille » tient, meme si les
  // clients arrivent apres. Un useEffect qui appelle setState ici reglerait le
  // filtre pendant le rendu suivant : deuxieme passe, et le choix de
  // l'utilisateur ecrase au prochain chargement.
  const [choixPortefeuille, setFiltrePortefeuille] = useState<string | null>(null)
  const filtrePortefeuille =
    choixPortefeuille ??
    (utilisateur?.id && portefeuilles.some(p => p.id === utilisateur.id) ? utilisateur.id : '')

  const codesPortefeuille = useMemo(() => {
    if (!filtrePortefeuille) return null
    const codes = new Set<string>()
    for (const c of clients) {
      const proprietaire = c.commercial_id ?? PF_AUCUN
      if (proprietaire === filtrePortefeuille) codes.add(c.code_dso)
    }
    return codes
  }, [clients, filtrePortefeuille])

  const facsAnalyse = useMemo(
    () => codesPortefeuille ? facsFiltrees.filter(f => codesPortefeuille.has(f.code_client)) : facsFiltrees,
    [facsFiltrees, codesPortefeuille]
  )

  const resumePortefeuille = useMemo(() => {
    const ouvertes = facsAnalyse.filter(f => f.reste_du > 0.005)
    return {
      encours:  ouvertes.reduce((s, f) => s + f.reste_du, 0),
      clients:  codesPortefeuille ? codesPortefeuille.size : new Set(clients.map(c => c.code_dso)).size,
      factures: ouvertes.length,
    }
  }, [facsAnalyse, codesPortefeuille, clients])

  // Couverture de relance. Denominateur volontaire : les clients EN RETARD.
  // Relancer un client qui n'est pas echu n'a aucun sens, et l'inclure
  // fabriquerait un taux decourageant et faux.
  const couvertureRelance = useMemo<CouvertureRelance>(() => {
    const concernes = alertes.filter(a => !codesPortefeuille || codesPortefeuille.has(a.code_client))
    const relances = concernes.filter(
      a => a.jours_derniere_relance !== null && a.jours_derniere_relance <= 30
    ).length
    return { enRetard: concernes.length, relances, enAttente: concernes.length - relances }
  }, [alertes, codesPortefeuille])

  const topClients = useMemo(() => computeTopClients(facsAnalyse, topNbClients), [facsAnalyse, topNbClients])
  const topFactures = useMemo(() => computeTopFactures(facsAnalyse, topNbFactures), [facsAnalyse, topNbFactures])
  const balanceAgee = useMemo(() => computeBalanceAgee(facsAnalyse), [facsAnalyse])
  const pointsEncaissement   = useMemo(() => computeEncaissements(encaissementsRaw, periodeEncaissement), [encaissementsRaw, periodeEncaissement])
  // On ne propose que les operateurs qui ont REELLEMENT relance : une liste de
  // tous les membres afficherait des noms sans aucune donnee derriere.
  // Un operateur parti de l'organisation disparait de la liste, mais ses
  // relances restent comptees dans "Tous les operateurs".
  const operateursActivite = useMemo(() => {
    const ids = new Set(activiteRelancesRaw.map(l => l.operateur_id).filter(Boolean))
    return membresOrg
      .filter(m => ids.has(m.id))
      .map(m => ({ id: m.id, label: m.prenom ? `${m.prenom} ${m.nom}` : m.nom }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
  }, [activiteRelancesRaw, membresOrg])

  const pointsActiviteRelances = useMemo(
    () => computeActiviteRelances(activiteRelancesRaw, periodeActiviteRelances, filtreOperateur),
    [activiteRelancesRaw, periodeActiviteRelances, filtreOperateur]
  )

  // Y a-t-il de l'activite, toutes periodes et tous operateurs confondus ?
  // Sert a decider de l'affichage du bloc. Il ne faut surtout pas se baser sur
  // pointsActiviteRelances : un filtre operateur qui ne renvoie rien ferait
  // disparaitre le bloc, donc le selecteur, donc le moyen de revenir en
  // arriere. Un controle ne doit jamais dependre de ce qu'il controle.
  const aDesRelances = activiteRelancesRaw.length > 0

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
    topFactures, topNbFactures, setTopNbFactures, balanceAgee,
    portefeuilles, filtrePortefeuille, setFiltrePortefeuille,
    resumePortefeuille, couvertureRelance,
    pointsEncaissement, periodeEncaissement, setPeriodeEncaissement,
    pointsActiviteRelances, periodeActiviteRelances, setPeriodeActiviteRelances,
    operateursActivite, filtreOperateur, setFiltreOperateur, aDesRelances,
    encoursCourant, chargement,
    creancesClients, nbClientsDebiteurs, dsoPeriode, ca12Mois,
    factures, clients,
  }
}
