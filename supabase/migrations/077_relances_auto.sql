-- Migration 077 : Paramètres relances automatiques
-- Colonnes org : délai paiement défaut, délai déclenchement, toggle auto
-- Colonne clients : délai paiement personnalisé (override org)
-- Table relances_auto_log : déduplication et traçabilité des envois auto

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS delai_echeance_jours               INT  NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS delai_declenchement_relance_jours  INT  NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS relance_auto_active                BOOL NOT NULL DEFAULT false;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS delai_echeance_jours INT NULL;

CREATE TABLE IF NOT EXISTS relances_auto_log (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id  UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code_client      TEXT        NOT NULL,
  numero_facture   TEXT        NOT NULL,
  scenario_id      UUID        NULL REFERENCES scenarios_relance(id) ON DELETE SET NULL,
  envoye_le        TIMESTAMPTZ NOT NULL DEFAULT now(),
  statut           TEXT        NOT NULL DEFAULT 'envoye' CHECK (statut IN ('envoye', 'bounce', 'erreur')),
  resend_id        TEXT        NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relances_auto_log_org_facture
  ON relances_auto_log(organisation_id, code_client, numero_facture);

ALTER TABLE relances_auto_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relances_auto_log_select" ON relances_auto_log FOR SELECT
  USING (organisation_id = (SELECT organisation_id FROM utilisateurs WHERE id = auth.uid()));

CREATE POLICY "relances_auto_log_insert" ON relances_auto_log FOR INSERT
  WITH CHECK (organisation_id = (SELECT organisation_id FROM utilisateurs WHERE id = auth.uid()));
