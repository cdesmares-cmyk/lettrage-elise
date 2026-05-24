-- Migration 034 : paramètres alertes scoring au niveau organisation
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS delai_alerte_jours    INT DEFAULT 25,
  ADD COLUMN IF NOT EXISTS alerte_snooze_jours   INT DEFAULT 20;
