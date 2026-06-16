-- Migration 075 : Colonne compensation_id sur lettrages
-- Lie les deux (ou plus) lignes créées lors d'une compensation avoir/facture.
-- Nullable : les lettrages classiques n'ont pas de compensation_id.

ALTER TABLE lettrages ADD COLUMN IF NOT EXISTS compensation_id UUID;

CREATE INDEX IF NOT EXISTS idx_lettrages_compensation_id
  ON lettrages(compensation_id)
  WHERE compensation_id IS NOT NULL;
