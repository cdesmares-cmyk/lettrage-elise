-- Migration 068 : import_id sur clients, contacts_client et lettrages
-- Permet de retrouver et supprimer exactement les lignes d'un import donné

ALTER TABLE clients         ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE contacts_client ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES imports(id) ON DELETE SET NULL;
ALTER TABLE lettrages       ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES imports(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clients_import_id         ON clients(import_id)         WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_client_import_id ON contacts_client(import_id) WHERE import_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lettrages_import_id       ON lettrages(import_id)       WHERE import_id IS NOT NULL;
