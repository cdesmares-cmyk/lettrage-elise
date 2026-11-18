// Dictionnaire unique des statuts de facture.
//
// POURQUOI CE FICHIER. Le couple libellé + couleur + icône était recopié dans
// cinq écrans : liste des factures, panneau latéral, détail de relance, envoi
// auto, tableau de bord. Renommer un statut imposait donc cinq modifications,
// et la sixième aurait été oubliée. Tout passe désormais par ici.
//
// LE LIBELLÉ ET LA VALEUR STOCKÉE SONT DEUX CHOSES DIFFÉRENTES, et c'est le
// point à ne pas perdre. La base stocke 'litige' et 'provisionne', protégés par
// un CHECK posé en migration 006. On ne touche jamais à ces valeurs : ça
// imposerait une migration de données comptables en production pour zéro gain.
// Seule l'étiquette montrée à l'écran et dans l'export change.
//
// « DÉPRÉCIÉE » ET NON « PROVISIONNÉE ». Depuis le règlement CRC 2002-10, le
// Plan comptable général réserve le mot « provision » au passif (compte 15) et
// parle de « dépréciation » pour un actif qui perd de la valeur — pour les
// créances clients, le compte 491. Une créance ne se provisionne donc plus,
// elle se déprécie. Arbitré avec Clément le 2026-11-18.
//
// LE STATUT EST UN DRAPEAU BINAIRE. Il répond à « cette facture porte-t-elle
// une dépréciation ? », pas à « combien ». Les montants et les dépréciations
// partielles viendront avec une table de mouvements, dans un chantier séparé.
import type { ReactElement } from 'react'
import type { StatutFacture } from '../types/client'
import { IcLitige, IcDepreciee } from '../components/Icones'

interface SvgProps { size?: number; className?: string; color?: string }

export interface DefinitionStatut {
  valeur: StatutFacture
  /** Badges, menus, barres d'action. Court par nécessité. */
  libelle: string
  /** Cellule Excel. Peut être plus explicite, la place ne manque pas. */
  libelleExport: string
  /** Classes du badge : fond, texte, bordure. */
  classes: string
  Icone: (p: SvgProps) => ReactElement
}

export const STATUTS_FACTURE: DefinitionStatut[] = [
  {
    valeur: 'litige',
    libelle: 'Litige',
    libelleExport: 'Litige',
    classes: 'bg-red-100 text-red-700 border-red-200',
    Icone: IcLitige,
  },
  {
    valeur: 'provisionne',
    libelle: 'Dépréciée',
    libelleExport: 'Créance dépréciée',
    classes: 'bg-orange-100 text-orange-700 border-orange-200',
    Icone: IcDepreciee,
  },
]

export function definitionStatut(v: StatutFacture | null | undefined): DefinitionStatut | null {
  return STATUTS_FACTURE.find(s => s.valeur === v) ?? null
}

/**
 * Libellé court, chaîne vide si aucun statut. Pour l'affichage.
 *
 * REPLI SUR LA VALEUR BRUTE si le statut n'est pas dans le dictionnaire. La
 * contrainte CHECK de la migration 006 ne laisse en théorie passer que les deux
 * valeurs connues, mais une valeur inattendue doit rester VISIBLE plutôt que
 * disparaître : un trou silencieux est toujours pire qu'une étiquette moche.
 */
export function libelleStatut(v: StatutFacture | null | undefined): string {
  if (!v) return ''
  return definitionStatut(v)?.libelle ?? String(v)
}

/** Libellé long, chaîne vide si aucun statut. Pour l'export. Même repli. */
export function libelleStatutExport(v: StatutFacture | null | undefined): string {
  if (!v) return ''
  return definitionStatut(v)?.libelleExport ?? String(v)
}


// ─── Lecture d'une valeur venue d'un fichier ────────────────────────────────

/**
 * Alias acceptés à l'import, après normalisation.
 *
 * LES DEUX VOCABULAIRES SONT ACCEPTÉS, ancien et nouveau. Quelqu'un réimportera
 * un vieux fichier contenant « Provisionné », ou l'export d'hier. Refuser
 * l'ancien mot transformerait un renommage d'étiquette en rupture de format.
 *
 * Les numéros de compte sont acceptés parce qu'un fichier venu de la
 * comptabilité les porte souvent en clair : 416 pour les clients douteux ou
 * litigieux, 491 pour la dépréciation.
 */
const ALIAS: Record<string, StatutFacture> = {}
for (const [valeur, mots] of Object.entries({
  litige: [
    'litige', 'litiges', 'en litige', 'litigieux', 'litigieuse', 'contesté',
    'contestee', 'contestation',
  ],
  provisionne: [
    'deprecie', 'depreciee', 'depreciation', 'creance depreciee',
    'provisionne', 'provisionnee', 'provision', 'provisionnement',
    'douteux', 'douteuse', 'creance douteuse', 'client douteux',
    '416', '491',
  ],
} as Record<StatutFacture, string[]>)) {
  for (const m of mots) ALIAS[normaliser(m)] = valeur as StatutFacture
}

/** Mots qui demandent explicitement le retrait du statut. */
const MOTS_EFFACER = new Set(['aucun', 'aucune', 'rien', 'neant', 'non', '-', '--', 'ras'])

/**
 * Minuscules, sans accent, espaces repliés.
 *
 * Sans ça, « Provisionné », « PROVISIONNE » et « provisionne  » seraient trois
 * valeurs distinctes, et deux des trois seraient refusées pour rien.
 */
function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export type LectureStatut =
  | { action: 'ignorer' }
  | { action: 'poser'; valeur: StatutFacture }
  | { action: 'effacer' }
  | { action: 'invalide'; brut: string }

/**
 * Traduit une cellule de fichier en intention.
 *
 * UNE CELLULE VIDE NE VEUT PAS DIRE « EFFACE », elle veut dire « je ne me
 * prononce pas ». C'est la règle la plus importante du lot : sans elle,
 * réimporter le fichier mensuel habituel effacerait tous les statuts posés à la
 * main. Le retrait doit être demandé explicitement, avec un mot.
 *
 * UNE VALEUR NON RECONNUE N'EST PAS IGNORÉE, elle est signalée. Si quelqu'un
 * écrit « contentieux », il doit l'apprendre à l'écran, pas découvrir trois
 * semaines plus tard que la ligne n'est jamais passée.
 */
export function lireStatut(brut: unknown): LectureStatut {
  if (brut === null || brut === undefined) return { action: 'ignorer' }
  const texte = String(brut).trim()
  if (!texte) return { action: 'ignorer' }

  const cle = normaliser(texte)
  if (MOTS_EFFACER.has(cle)) return { action: 'effacer' }

  const valeur = ALIAS[cle]
  if (valeur) return { action: 'poser', valeur }

  return { action: 'invalide', brut: texte }
}

/** Les libellés acceptés, pour les afficher dans un message d'erreur. */
export function exemplesValeursAcceptees(): string {
  return STATUTS_FACTURE.map(s => s.libelle).join(', ') + ', ou « aucun » pour retirer le statut'
}
