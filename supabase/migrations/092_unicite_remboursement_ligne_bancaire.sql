-- Une ligne bancaire ne peut être affectée qu'à un seul remboursement effectué.
-- L'index est partiel : il ne s'applique que quand statut = 'effectue' et qu'une ligne
-- est renseignée, ce qui laisse libre d'avoir plusieurs remboursements en_attente sans ligne.

CREATE UNIQUE INDEX IF NOT EXISTS idx_remboursements_ligne_bancaire_unique
  ON remboursements (organisation_id, id_ligne_bancaire)
  WHERE statut = 'effectue'
    AND id_ligne_bancaire IS NOT NULL;
