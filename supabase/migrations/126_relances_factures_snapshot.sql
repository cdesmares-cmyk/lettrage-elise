-- Snapshot par facture au moment de l'envoi de la relance.
-- Permet de détecter un paiement sans faux positif si une facture est absente de la Map.
ALTER TABLE relances ADD COLUMN IF NOT EXISTS factures_snapshot JSONB;
