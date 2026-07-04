-- Migration 083 : colonne relance_auto_alerte sur clients
-- Un bounce ou complaint Resend met ce flag à true.
-- Le cron relance-auto skip les clients avec ce flag.
-- L'opérateur le remet à false après correction du contact.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS relance_auto_alerte BOOL NOT NULL DEFAULT false;
