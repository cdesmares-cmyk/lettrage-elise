-- Migration 049 : colonne masquee sur alertes_risque + cloture dans statut_juridique
--
-- 1. Permet de masquer manuellement un faux positif BODACC
-- 2. Corrige le CHECK constraint de clients.statut_juridique qui manquait 'cloture'

ALTER TABLE alertes_risque ADD COLUMN IF NOT EXISTS masquee boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_alertes_actives
  ON alertes_risque(organisation_id, code_client)
  WHERE masquee = false;

-- Supprime l'ancien CHECK et le remplace en ajoutant 'cloture'
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_statut_juridique_check;
ALTER TABLE clients ADD CONSTRAINT clients_statut_juridique_check
  CHECK (statut_juridique IN ('sauvegarde', 'liquidation', 'redressement', 'cloture'));
