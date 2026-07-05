-- Migration 086 : monitoring cron par organisation
-- 3 colonnes sur organisations pour exposer l'état du dernier run
-- aux admins d'org sans accès superadmin à cron_runs.

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS relance_auto_derniere_exec    TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS relance_auto_dernier_statut   TEXT        NULL
    CHECK (relance_auto_dernier_statut IN ('ok', 'partiel', 'erreur')),
  ADD COLUMN IF NOT EXISTS relance_auto_dernier_message  TEXT        NULL;
