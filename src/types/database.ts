// Types TypeScript générés depuis le schéma SQL Supabase (section 4 du CDC)

export type StatutClient = 'actif' | 'resilié' | 'defaillant' | 'redressement' | 'liquidation'
export type ModeLettrage = 'auto' | 'semi' | 'manuel'
export type TypeImport = 'csv_bancaire' | 'xlsx_factures' | 'import_lettrage'

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          code_dso: string
          ancien_code: string | null
          nom: string
          statut: StatutClient | null
          est_plateforme: boolean
          est_groupement: boolean
          parent_code_dso: string | null
          mode_paiement: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['clients']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['clients']['Insert']>
      }
      factures: {
        Row: {
          numero_piece: string
          code_client: string
          nom_client: string | null
          date_emission: string
          date_echeance: string | null
          montant_ht: number | null
          montant_ttc: number
          est_provisionnee: boolean
          est_avoir: boolean
          commentaire: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['factures']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['factures']['Insert']>
      }
      lignes_bancaires: {
        Row: {
          id_operation: string
          date_operation: string
          libelle: string
          detail: string | null
          infos_complementaires: string | null
          debit: number | null
          credit: number | null
          code_client_propose: string | null
          score_suggestion: number | null
          import_id: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['lignes_bancaires']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['lignes_bancaires']['Insert']>
      }
      lettrages: {
        Row: {
          id: string
          id_ligne_bancaire: string | null
          numero_facture: string
          code_client: string
          montant: number
          date_lettrage: string
          mode: ModeLettrage
          commentaire: string | null
          cree_par: string | null
          created_at: string
          updated_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['lettrages']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['lettrages']['Insert']>
      }
      libelles_sepa: {
        Row: {
          libelle: string
          code_client: string | null
          nb_utilisations: number
          created_at: string
          updated_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['libelles_sepa']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['libelles_sepa']['Insert']>
      }
      imports: {
        Row: {
          id: string
          type: TypeImport
          nom_fichier: string | null
          hash_fichier: string | null
          nb_lignes_total: number | null
          nb_lignes_inserees: number | null
          nb_lignes_doublons: number | null
          cree_par: string | null
          cree_le: string
          created_at: string
          updated_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['imports']['Row'], 'id' | 'created_at' | 'updated_at' | 'cree_le'>
        Update: Partial<Database['public']['Tables']['imports']['Insert']>
      }
      audit_log: {
        Row: {
          id: string
          table_concernee: string
          action: 'INSERT' | 'UPDATE' | 'DELETE'
          payload_json: Record<string, unknown> | null
          user_id: string | null
          timestamp: string
        }
        Insert: Omit<Database['public']['Tables']['audit_log']['Row'], 'id' | 'timestamp'>
        Update: never
      }
    }
    Views: {
      v_factures_avec_reste_du: {
        Row: {
          numero_piece: string
          code_client: string
          date_emission: string
          date_echeance: string | null
          montant_ttc: number
          est_avoir: boolean
          est_provisionnee: boolean
          montant_lettre: number
          reste_du: number
          statut_paiement: 'impayé' | 'partiel' | 'payé' | 'avoir' | 'sur-lettré'
        }
      }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}
