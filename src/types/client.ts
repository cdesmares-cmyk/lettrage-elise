// Types pour le module Compte Client (Sprint 3)

export type StatutJuridique = 'sauvegarde' | 'liquidation' | 'redressement'
export type StatutFacture = 'litige' | 'provisionne'
export type VueMode = 'clients' | 'nebuleuse' | 'factures'

export interface CompteClient {
  code_dso: string
  nom: string
  statut: string | null
  statut_juridique: StatutJuridique | null
  plateforme: string | null
  code_groupement: string | null
  parent_code_dso: string | null
  nb_factures_total: number
  nb_impayees: number
  encours_total: number
  derniere_emission: string | null
  note_risque: number
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
  nbFacturesTotal: number
}
