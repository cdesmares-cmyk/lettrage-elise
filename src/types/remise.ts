// Types pour le module Chèque / LCR (Sprint 4)
import type { InfoFacture } from './lettrage'

export type TypeRemise = 'cheque' | 'lcr'
export type StatutRemise = 'en_attente' | 'encaisse'

// Facture liée à une remise (join lettrages)
export interface RemiseFacture {
  id: string
  numero_facture: string
  code_client: string
  montant: number
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
  nom_operateur: string | null
  created_at: string
  // Factures liées (chargées par join côté hook)
  lignes: RemiseFacture[]
}

// Ligne dans le formulaire de saisie / modification
export interface LigneFormRemise {
  _key: string
  numero_facture: string
  montant: string
  info_facture: InfoFacture | null
  chargement: boolean
}
