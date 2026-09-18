-- Migration 154 : Intégration Odoo
-- Ajoute les colonnes nécessaires sans modifier l'existant Axonaut/Gmail.

-- Colonne config JSONB sur integrations (données non-secrètes par provider)
-- Utilisée par Odoo : { "url": "...", "db": "...", "username": "..." }
ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS config jsonb;

-- Colonne odoo_move_id sur factures (tracabilité + write-back futur)
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS odoo_move_id integer;

CREATE INDEX IF NOT EXISTS idx_factures_odoo_move_id ON factures(odoo_move_id)
  WHERE odoo_move_id IS NOT NULL;

-- Colonne source sur factures (excel | odoo — pour filtrage et audit)
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'excel'
  CHECK (source IN ('excel', 'odoo'));
