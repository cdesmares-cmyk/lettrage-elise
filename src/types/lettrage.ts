// Types pour le module de lettrage (Sprint 2)

export type StatutLettrage = 'debit' | 'non_lettre' | 'partiel' | 'lettre'
export type ClasseLettrage = 'facture' | 'autres'

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
}

export interface LettrageExistant {
  id: string
  numero_facture: string
  code_client: string
  montant: number
  date_lettrage: string
  commentaire: string | null
}

// Info récupérée depuis v_factures_avec_reste_du lors du remplissage auto
export interface InfoFacture {
  reste_du: number
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
}
