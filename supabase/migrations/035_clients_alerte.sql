-- Migration 035 : seuil alerte par client (override org) + snooze individuel
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS delai_alerte_jours       INT  NULL,
  ADD COLUMN IF NOT EXISTS alerte_snooze_jusqu_au   DATE NULL;
