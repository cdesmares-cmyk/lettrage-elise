-- Adresse organisation (CERFA créancier + "Fait à")
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS adresse     text,
  ADD COLUMN IF NOT EXISTS ville       text,
  ADD COLUMN IF NOT EXISTS code_postal text;

-- Historique des éditions de déclarations de créances
CREATE TABLE IF NOT EXISTS declarations_versions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  declaration_id  uuid        NOT NULL REFERENCES declarations_creances(id) ON DELETE CASCADE,
  version_number  int         NOT NULL,
  date_edition    timestamptz NOT NULL DEFAULT now(),
  snapshot        jsonb       NOT NULL,
  UNIQUE (declaration_id, version_number)
);

ALTER TABLE declarations_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY declarations_versions_org_isolation ON declarations_versions
  FOR ALL USING (organisation_id = get_my_organisation_id());

CREATE TRIGGER inject_organisation_id_declarations_versions
  BEFORE INSERT ON declarations_versions
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();
