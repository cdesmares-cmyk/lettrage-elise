// Types pour le module Chèque / LCR (Sprint 4)
import type { InfoFacture } from './lettrage'

export type TypeRemise = 'cheque' | 'lcr'
export type StatutRemise = 'en_attente' | 'encaisse'

/**
 * Nature d'une ligne de remise.
 *
 *   'facture'  une facture client réelle. Le numéro est contrôlé contre
 *              v_factures_avec_reste_du avant toute validation.
 *   'autres'   un encaissement sans facture en face, affecté au compte
 *              d'attente 471. Cas type : un fournisseur nous rembourse un
 *              trop-payé par chèque.
 *
 * On réutilise volontairement la convention « Autres » déjà posée dans le
 * lettrage (code_client 'AUTRES', numero_facture NULL, libellé dans le
 * commentaire) : c'est ce qui fait que les exports savent déjà afficher ces
 * lignes sans modification.
 */
export type ClasseLigneRemise = 'facture' | 'autres'

// Ligne liée à une remise (join lettrages)
export interface RemiseFacture {
  id: string
  // null pour une ligne 471 : il n'y a pas de facture en face.
  numero_facture: string | null
  code_client: string
  montant: number
  // Porte « Remise CHQ n°X — libellé » pour une ligne 471. C'est la seule
  // trace du libellé : il n'a pas de colonne dédiée.
  commentaire: string | null
}

export interface Remise {
  id: string
  type: TypeRemise
  numero: string
  // null pour CHQ (total calculé depuis lignes), renseigné pour LCR
  montant_total: number | null
  statut: StatutRemise
  id_ligne_bancaire: string | null
  date_encaissement: string | null
  cree_par: string | null
  operateur: string | null
  created_at: string
  // Factures liées (chargées par join côté hook)
  lignes: RemiseFacture[]
}

// Ligne dans le formulaire de saisie / modification
export interface LigneFormRemise {
  _key: string
  classe: ClasseLigneRemise
  numero_facture: string
  // Saisi uniquement quand classe === 'autres'. Obligatoire à la validation :
  // sans lui, la ligne est inexploitable dans l'export trois mois plus tard.
  libelle: string
  montant: string
  info_facture: InfoFacture | null
  chargement: boolean
}
