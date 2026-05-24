-- Migration 031 : Contrainte anti double-lettrage
-- Index partiel UNIQUE sur (id_ligne_bancaire, numero_facture) quand les deux sont non-null.
-- Garantit qu'une facture ne peut être lettrée qu'une seule fois par ligne bancaire,
-- même en cas de soumission simultanée par deux utilisateurs.

CREATE UNIQUE INDEX IF NOT EXISTS idx_lettrages_no_doublon
  ON lettrages (id_ligne_bancaire, numero_facture)
  WHERE id_ligne_bancaire IS NOT NULL
    AND numero_facture IS NOT NULL;
