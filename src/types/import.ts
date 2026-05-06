// Types partagés pour le flux d'import (onglet Dépôt, section 5.1 du CDC)

export type TypeFichier = 'csv_bancaire' | 'xlsx_factures'

// Définition d'un champ cible en base de données
export interface ChampCible {
  cle: string
  label: string
  est_pivot: boolean      // clé d'unicité anti-doublon
  requis: boolean
  est_lettrable: boolean  // utilisé dans la logique de lettrage
  aliases: string[]       // noms de colonnes reconnus automatiquement
  hint?: string           // affiché dans l'interface de mapping (ex: format attendu)
}

// Correspondance entre une colonne du fichier et un champ cible
export interface LigneMapping {
  colonne_source: string
  champ_cible: string | null  // null = ignorer cette colonne
  exemple: string
  auto: boolean               // true = détecté automatiquement
}

// Résultat de l'analyse d'un fichier (étape upload → mapping)
export interface ResultatAnalyse {
  colonnes: string[]
  apercu: Record<string, string>[]
  mapping: LigneMapping[]
  hash: string
}

// Une ligne dans l'aperçu de validation
export interface LigneApercu {
  donnees: Record<string, string>
  statut: 'nouveau' | 'doublon'
  cle_pivot: string
}

// Résultat de la préparation (étape mapping → validation)
export interface ResultatValidation {
  lignes_a_inserer: Record<string, unknown>[]
  apercu: LigneApercu[]
  nb_total: number
  nb_nouvelles: number
  nb_doublons: number
  hash: string
  nom_fichier: string
}

// Résultat final après insertion en base
export interface ResultatImport {
  import_id: string
  nb_inserees: number
}
