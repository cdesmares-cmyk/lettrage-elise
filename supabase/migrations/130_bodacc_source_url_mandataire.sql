-- Migration 130 — Enrichissement alertes BODACC
-- Ajout source_url (lien vers l'annonce officielle) et mandataire (données JSON du mandataire)
-- Purement additif : IF NOT EXISTS, aucun risque de régression

ALTER TABLE alertes_risque
  ADD COLUMN IF NOT EXISTS source_url  text,
  ADD COLUMN IF NOT EXISTS mandataire  jsonb;
