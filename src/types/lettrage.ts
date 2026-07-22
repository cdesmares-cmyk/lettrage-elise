// Types pour le module de lettrage (Sprint 2)

export type StatutLettrage = 'debit' | 'non_lettre' | 'partiel' | 'lettre' | 'en_attente_411'
export type ClasseLettrage = 'facture' | 'autres' | 'cheque' | 'lcr' | 'compte_client' | 'attente_411' | '471'

export interface LigneBancaireAvecStatut {
  id_operation: string
  date_operation: string
  libelle: string
  detail: string | null
  infos_complementaires: string | null
  debit: number | null
  credit: number | null
  montant_lettre: number
  restant: number
  statut_lettrage: StatutLettrage
  derniere_date_lettrage: string | null
  en_attente_411: boolean
  est_virement_471: boolean
  credit_attente_411?: number
}

export interface LettrageExistant {
  id: string
  numero_facture: string | null
  code_client: string
  montant: number
  date_lettrage: string
  commentaire: string | null
  annule: boolean
}

export interface LigneBancaire411 extends LigneBancaireAvecStatut {
  compte_411: string
  reste_du_411: number
  a_dispatch: boolean
}

// Info récupérée depuis v_factures_avec_reste_du lors du remplissage auto
export interface InfoFacture {
  reste_du: number
  montant_ttc: number
  code_client: string
  nom_client: string | null
  statut_paiement: string
}

// Une ligne du formulaire de lettrage (état local)
export interface LigneForme {
  _key: string
  classe: ClasseLettrage
  numero_facture: string
  montant: string
  info_facture: InfoFacture | null
  chargement: boolean
  client_411?: { code_dso: string; nom: string | null }
}
