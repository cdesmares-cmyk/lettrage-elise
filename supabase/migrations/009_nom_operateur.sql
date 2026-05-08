-- Migration 009 : Ajout nom_operateur dans lettrages
-- Permet d'identifier qui a réalisé chaque action de lettrage dans l'historique
ALTER TABLE lettrages
  ADD COLUMN IF NOT EXISTS nom_operateur text;
