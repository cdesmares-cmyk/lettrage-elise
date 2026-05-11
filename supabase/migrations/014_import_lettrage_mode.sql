-- Migration 014 : Ajout du mode 'import' pour les lettrages importés en masse
-- Permet de distinguer les lettrages issus d'un import fichier (migration historique)
-- des lettrages manuels, automatiques ou semi-automatiques

ALTER TABLE lettrages DROP CONSTRAINT IF EXISTS lettrages_mode_check;
ALTER TABLE lettrages ADD CONSTRAINT lettrages_mode_check
  CHECK (mode IN ('auto', 'semi', 'manuel', 'import'));
