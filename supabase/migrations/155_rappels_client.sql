-- Migration 155 : Table rappels_client
-- Rappels personnels liés à un client. Colonne type extensible (relance_prevue en futur chantier).

CREATE TABLE rappels_client (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code_client       text        NOT NULL,
  type              text        NOT NULL DEFAULT 'rappel_perso'
                                CHECK (type IN ('rappel_perso', 'relance_prevue')),
  prevu_le          date        NOT NULL,
  heure             time,
  note              text,
  calendar_event_id text,
  cree_par          uuid        REFERENCES utilisateurs(id),
  cree_le           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rappels_client_org_client ON rappels_client(organisation_id, code_client);
CREATE INDEX idx_rappels_client_prevu_le   ON rappels_client(prevu_le);

ALTER TABLE rappels_client ENABLE ROW LEVEL SECURITY;

CREATE POLICY rappels_client_all ON rappels_client
  USING     (organisation_id = get_my_organisation_id())
  WITH CHECK (organisation_id = get_my_organisation_id());
