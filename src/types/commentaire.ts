// Types pour le système de commentaires internes + notifications (migration 138)

export type ContexteCommentaire = 'client' | 'facture' | 'relance' | 'procedure'
export type TypeNotification    = 'mention' | 'reponse'

// Membre de l'organisation — chargé une fois dans AppDataContext
// Sert à l'autocomplete @mention dans CommentairesFil
export interface MembreOrg {
  id:        string
  nom:       string
  prenom:    string | null
  initiales: string   // calculé au chargement : ex. "MB" pour Morgane Bouillot
  couleur:   string   // couleur d'avatar déterministe basée sur l'id
}

// Commentaire tel que renvoyé par Supabase (auteur dénormalisé)
export interface Commentaire {
  id:          string
  auteur_id:   string
  auteur_nom:  string   // "{prenom} {nom}" calculé au chargement
  corps_texte: string
  mentions:    string[] // UUIDs des membres mentionnés
  contexte:    ContexteCommentaire
  contexte_id: string
  reponse_a:   string | null
  cree_le:     string
  modifie_le:  string
  // Réponses rattachées (chargées en même temps, groupées côté hook)
  reponses?:   Commentaire[]
}

// Notification telle que renvoyée par Supabase (commentaire dénormalisé)
export interface Notification {
  id:              string
  type:            TypeNotification
  contexte:        ContexteCommentaire
  contexte_id:     string
  lu_le:           string | null
  cree_le:         string
  // Champs joints depuis commentaires + utilisateurs
  auteur_nom:      string   // auteur du commentaire source
  corps_extrait:   string   // 120 premiers caractères du commentaire
  commentaire_id:  string
}
