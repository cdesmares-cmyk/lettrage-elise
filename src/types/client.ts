// Types pour le module Compte Client (Sprint 3)

export type StatutJuridique = 'sauvegarde' | 'liquidation' | 'redressement' | 'cloture'
export type StatutFacture = 'litige' | 'provisionne'
export type VueMode = 'clients' | 'nebuleuse' | 'factures'

export interface CompteClient {
  code_dso: string
  nom: string
  statut_juridique: StatutJuridique | null
  commercial: string | null
  operateur: string | null
  plateforme: string | null
  code_groupement: string | null
  nb_factures_total: number
  nb_impayees: number
  encours_total: number
  derniere_emission: string | null
  note_risque: number
  siret: string | null
}

export interface RefValeur {
  id: string
  categorie: 'commercial' | 'operateur' | 'plateforme'
  valeur: string
  actif: boolean
  ordre: number
}

export interface FactureDetail {
  numero_piece: string
  code_client: string
  nom_client: string | null
  date_emission: string
  date_echeance: string | null
  montant_ht: number | null
  montant_ttc: number
  reste_du: number
  statut_paiement: string
  statut_facture: StatutFacture | null
  est_avoir: boolean
  axonaut_pdf_url?: string | null
}

export interface CommentaireFacture {
  id: string
  numero_piece: string
  contact: string | null
  date_contact: string | null
  commentaire: string | null
  operateur: string | null
  updated_at: string
  ne_pas_relancer?: boolean
}

export interface HistoriqueLettrage {
  id: string
  id_ligne_bancaire: string | null
  montant: number
  date_lettrage: string
  mode: string
  commentaire: string | null
}

export interface GroupeNebuleuse {
  groupe_key: string
  nom_groupe: string
  codes_clients: string[]
  nb_clients: number
  nb_factures: number
  nb_impayees: number
  encours_total: number
  note_risque: number
  clients: CompteClient[]
}

export interface KpisCompteClient {
  nbClientsActifs: number
  encoursTotalTtc: number
  encoursTotalAvoirs: number
  nbFacturesAttente: number
  encours411: number
}
