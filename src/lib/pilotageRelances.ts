// Filtre de pilotage des relances : le type, la lecture, et le predicat.
//
// POURQUOI UN FICHIER A PART. ancienneteRelance() etait defini dans
// TableComptesClients.tsx et sert a afficher la colonne Niveau. Le filtre doit
// appliquer EXACTEMENT la meme regle : si chacun recalculait de son cote, le
// filtre finirait par contredire la colonne qu'il filtre, et c'est le genre
// d'ecart que personne ne remarque avant d'avoir pris une mauvaise decision.
// La fonction est donc partagee, pas recopiee.
//
// Tout ici est pur : aucun appel reseau, aucun acces au DOM. Les donnees sont
// deja en memoire (AppDataContext), donc filtrer coute une traversee de tableau
// sur quelques milliers de clients, soit bien moins d'une milliseconde.
import type { CompteClient, FactureDetail } from '../types/client'

export function joursDepuis(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

/**
 * Ancienneté de la dernière relance, en jours.
 *
 * Deux sources, on garde la plus récente. alertes_score.jours_derniere_relance
 * est recalculé une fois par nuit et ne compte que les relances MANUELLES
 * portant sur les factures encore ouvertes. dernieresRelances est en direct et
 * fusionne manuel, automatique et échanges hors Ockham.
 *
 * Résultat observé avant ce correctif : un client relancé par le robot le matin
 * même affichait 88 jours. Prendre le minimum ne peut pas se tromper dans ce
 * sens — une relance qui a eu lieu a eu lieu — et la colonne cesse d'attendre
 * le cron de la nuit pour dire la vérité.
 */
export function ancienneteRelance(
  joursCalcules: number | null,
  derniereConnue: string | undefined,
): number | null {
  const joursVivants = derniereConnue ? joursDepuis(derniereConnue) : null
  if (joursCalcules === null) return joursVivants
  if (joursVivants === null) return joursCalcules
  return Math.min(joursCalcules, joursVivants)
}


// ── Le filtre ───────────────────────────────────────────────────────────────

/**
 * Les seuils sont des chaînes et non des nombres, volontairement : un champ de
 * saisie vide doit se distinguer d'un zéro. « Encours minimum : 0 » et
 * « pas de filtre sur l'encours » ne veulent pas dire la même chose.
 */
export interface FiltrePilotage {
  /** Niveaux de relance retenus : 0, 1, 2, 3. Vide = pas de filtre. */
  niveaux: number[]
  /** Clients jamais contactés. S'ajoute aux niveaux, ne les remplace pas. */
  jamaisRelance: boolean
  /** Dernière relance remontant à au moins N jours. */
  joursDerniereRelanceMin: string
  nbFacturesMin: string
  encoursMin: string
  /** Porte sur date_emission, comme le filtre déjà présent en vue Factures. */
  dateEmissionDebut: string
  dateEmissionFin: string
  exclureGelesEtAttente: boolean
}

export const FILTRE_VIDE: FiltrePilotage = {
  niveaux: [],
  jamaisRelance: false,
  joursDerniereRelanceMin: '',
  nbFacturesMin: '',
  encoursMin: '',
  dateEmissionDebut: '',
  dateEmissionFin: '',
  exclureGelesEtAttente: false,
}

function nombreOuNull(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Nombre de critères actifs. Sert au badge du bouton Filtres. */
export function nbCriteresActifs(f: FiltrePilotage): number {
  let n = 0
  if (f.niveaux.length > 0) n++
  if (f.jamaisRelance) n++
  if (nombreOuNull(f.joursDerniereRelanceMin) !== null) n++
  if (nombreOuNull(f.nbFacturesMin) !== null) n++
  if (nombreOuNull(f.encoursMin) !== null) n++
  if (f.dateEmissionDebut || f.dateEmissionFin) n++
  if (f.exclureGelesEtAttente) n++
  return n
}

export interface AlerteFiltre {
  niveau_relance: number
  jours_derniere_relance: number | null
  est_gele: boolean
}

export interface ContexteFiltre {
  alertes: Map<string, AlerteFiltre>
  /** Date de dernier contact client, tous canaux confondus. */
  dernieresRelances: Map<string, string>
  clientsEnAttente: Set<string>
  /** Clients ayant au moins une facture ouverte dans la plage. null = pas de filtre de date. */
  codesDansPlage: Set<string> | null
}

/**
 * Les clients ayant au moins une facture ouverte émise dans la plage.
 *
 * Calculé une fois par changement de plage, jamais à chaque frappe : une
 * traversée des 47 000 factures coûte quelques millisecondes, mais la refaire
 * à chaque caractère tapé se verrait.
 */
export function codesAvecFactureDansPlage(
  factures: FactureDetail[],
  debut: string,
  fin: string,
): Set<string> | null {
  if (!debut && !fin) return null
  const codes = new Set<string>()
  for (const f of factures) {
    const d = f.date_emission ?? ''
    if (!d) continue
    if (debut && d < debut) continue
    if (fin && d > fin) continue
    codes.add(f.code_client)
  }
  return codes
}

export function clientCorrespond(
  c: CompteClient,
  f: FiltrePilotage,
  ctx: ContexteFiltre,
): boolean {
  const alerte = ctx.alertes.get(c.code_dso)

  if (f.exclureGelesEtAttente) {
    if (alerte?.est_gele) return false
    if (ctx.clientsEnAttente.has(c.code_dso)) return false
  }

  // Niveau et « jamais relancé » forment UN SEUL critère, en OU.
  //
  // Un client jamais contacté n'a pas de ligne dans alertes_score, ou en a une
  // avec un niveau 0 : cocher N0 ne suffit donc pas à le trouver. Les deux
  // cases doivent pouvoir se combiner, sinon « N1 à N3 plus les jamais
  // relancés » serait impossible à exprimer — et c'est justement la liste de
  // travail la plus utile.
  if (f.niveaux.length > 0 || f.jamaisRelance) {
    const jamais = !ctx.dernieresRelances.has(c.code_dso)
    const niveauOk = alerte ? f.niveaux.includes(alerte.niveau_relance) : false
    if (!niveauOk && !(f.jamaisRelance && jamais)) return false
  }

  const seuilJours = nombreOuNull(f.joursDerniereRelanceMin)
  if (seuilJours !== null) {
    const jours = ancienneteRelance(
      alerte?.jours_derniere_relance ?? null,
      ctx.dernieresRelances.get(c.code_dso),
    )
    // jours === null veut dire « jamais relancé ». Un client jamais contacté
    // satisfait « plus de X jours » quel que soit X : il passe, il n'est pas
    // exclu faute de date.
    if (jours !== null && jours < seuilJours) return false
  }

  const nbMin = nombreOuNull(f.nbFacturesMin)
  if (nbMin !== null && c.nb_impayees < nbMin) return false

  const encoursMin = nombreOuNull(f.encoursMin)
  if (encoursMin !== null && c.encours_total < encoursMin) return false

  if (ctx.codesDansPlage && !ctx.codesDansPlage.has(c.code_dso)) return false

  return true
}


// ── Lecture et ecriture dans l'URL ──────────────────────────────────────────
//
// Mettre le filtre dans l'adresse le rend PARTAGEABLE : un lien envoye a un
// collegue ouvre la meme liste de travail. C'est un gain de pilotage qu'un
// filtre garde en memoire n'apporte pas.

const CLES = ['niv', 'jam', 'jrel', 'nbf', 'enc', 'de', 'df', 'exg'] as const

/** Les cles du filtre, pour les preserver quand un autre code vide l'URL. */
export const CLES_FILTRE: readonly string[] = CLES

export function filtreVersParams(f: FiltrePilotage): Record<string, string> {
  const p: Record<string, string> = {}
  if (f.niveaux.length) p.niv = [...f.niveaux].sort().join(',')
  if (f.jamaisRelance) p.jam = '1'
  if (f.joursDerniereRelanceMin.trim()) p.jrel = f.joursDerniereRelanceMin.trim()
  if (f.nbFacturesMin.trim()) p.nbf = f.nbFacturesMin.trim()
  if (f.encoursMin.trim()) p.enc = f.encoursMin.trim()
  if (f.dateEmissionDebut) p.de = f.dateEmissionDebut
  if (f.dateEmissionFin) p.df = f.dateEmissionFin
  if (f.exclureGelesEtAttente) p.exg = '1'
  return p
}

/** null si l'URL ne porte aucun critere : on ne doit pas ecraser le filtre garde. */
export function filtreDepuisParams(get: (k: string) => string | null): FiltrePilotage | null {
  if (!CLES.some(k => get(k) !== null)) return null
  const niv = (get('niv') ?? '')
    .split(',')
    .map(s => Number(s))
    .filter(n => Number.isInteger(n) && n >= 0 && n <= 3)
  return {
    niveaux:                 niv,
    jamaisRelance:           get('jam') === '1',
    joursDerniereRelanceMin: get('jrel') ?? '',
    nbFacturesMin:           get('nbf') ?? '',
    encoursMin:              get('enc') ?? '',
    dateEmissionDebut:       get('de') ?? '',
    dateEmissionFin:         get('df') ?? '',
    exclureGelesEtAttente:   get('exg') === '1',
  }
}
