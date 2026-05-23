-- Migration 029 : Tracking du scan historique BODACC par organisation
-- Permet de désactiver le bouton après le premier scan (usage unique)

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS bodacc_onboarding_done_at TIMESTAMPTZ;
