-- Migration 024 : Ajout d'une note libre sur chaque relance
-- La note est éditable tant que la relance n'est pas archivée.
-- À l'archivage, elle est figée et affichée dans l'onglet Relance du compte client.

ALTER TABLE relances
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS note_operateur text,
  ADD COLUMN IF NOT EXISTS note_archivee_le timestamptz;
