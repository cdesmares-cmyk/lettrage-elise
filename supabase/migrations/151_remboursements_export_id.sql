-- Migration 151 : export_id sur remboursements
-- Permet de bloquer l'annulation / désaffectation si le remboursement a été inclus dans un export.
-- La colonne est NULL pour tous les remboursements existants — aucune restriction immédiate.

ALTER TABLE remboursements
  ADD COLUMN IF NOT EXISTS export_id uuid REFERENCES exports_comptables(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_remboursements_export_id ON remboursements(export_id);
