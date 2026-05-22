-- Migration 025 : Ajout du numéro SIRET sur la table clients
-- Utilisé pour la future intégration BODACC (Phase 2 veille risque).

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS siret text;
