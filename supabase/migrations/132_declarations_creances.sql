-- Migration 132 — Table declarations_creances
-- Suivi des déclarations de créances dans le cadre des procédures collectives.
-- Une déclaration par couple (organisation_id, alerte_id).

CREATE TABLE IF NOT EXISTS declarations_creances (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id     uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  alerte_id           uuid        NOT NULL REFERENCES alertes_risque(id) ON DELETE CASCADE,
  code_client         text        NOT NULL,
  montant_creancier   numeric(12,2),
  date_declaration    date,
  statut              text        NOT NULL DEFAULT 'brouillon'
                                  CHECK (statut IN ('brouillon', 'declaree', 'acceptee', 'rejetee', 'remboursee')),
  reference_dossier   text,
  contact_mandataire  text,
  notes_interne       text,
  cree_le             timestamptz NOT NULL DEFAULT now(),
  mise_a_jour_le      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organisation_id, alerte_id)
);

CREATE INDEX IF NOT EXISTS idx_declarations_org     ON declarations_creances(organisation_id);
CREATE INDEX IF NOT EXISTS idx_declarations_client  ON declarations_creances(code_client);
CREATE INDEX IF NOT EXISTS idx_declarations_statut  ON declarations_creances(statut);

-- Trigger auto-injection organisation_id
CREATE TRIGGER set_organisation_id_declarations
  BEFORE INSERT ON declarations_creances
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

-- RLS — isolation par organisation (même pattern que alertes_risque)
ALTER TABLE declarations_creances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "declarations_org_isolation" ON declarations_creances
  FOR ALL USING (organisation_id = get_my_organisation_id())
  WITH CHECK (organisation_id = get_my_organisation_id());
