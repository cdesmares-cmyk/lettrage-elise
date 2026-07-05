-- Migration 085 : enrichissement relances_auto_log
-- Ajout contact_email, montant_total, corps_html pour la timeline unifiée.
-- corps_html est lazy-loadé (uniquement au clic sur la capsule).

ALTER TABLE relances_auto_log
  ADD COLUMN IF NOT EXISTS contact_email TEXT NULL,
  ADD COLUMN IF NOT EXISTS montant_total  NUMERIC(12,2) NULL,
  ADD COLUMN IF NOT EXISTS corps_html     TEXT NULL;
