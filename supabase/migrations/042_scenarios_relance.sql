-- Migration 042 : Scénarios de relance personnalisables par organisation

BEGIN;

CREATE TABLE scenarios_relance (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  nom             text        NOT NULL,
  niveau          int         NOT NULL DEFAULT 1 CHECK (niveau BETWEEN 1 AND 3),
  objet           text        NOT NULL,
  corps_texte     text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz
);

CREATE TRIGGER trg_scenarios_relance_updated_at
  BEFORE UPDATE ON scenarios_relance
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

CREATE TRIGGER scenarios_relance_inject_org
  BEFORE INSERT ON scenarios_relance
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

CREATE INDEX idx_scenarios_relance_org ON scenarios_relance(organisation_id);

ALTER TABLE scenarios_relance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scenarios_relance_org" ON scenarios_relance
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- Scénarios par défaut pour Elise Lyon
INSERT INTO scenarios_relance (organisation_id, nom, niveau, objet, corps_texte)
SELECT id,
  'Relance douce',
  1,
  '[Relance] Factures en attente — [Nom client]',
  'Bonjour,

Nous nous permettons de vous contacter au sujet des factures suivantes en attente de règlement pour votre compte [Code client].

[Tableau Factures]

Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais, ou de nous contacter en cas de question ou de litige.

Cordialement,'
FROM organisations WHERE slug = 'elise-lyon';

INSERT INTO scenarios_relance (organisation_id, nom, niveau, objet, corps_texte)
SELECT id,
  'Relance ferme',
  2,
  '[URGENT] Règlement en attente — [Nom client] ([Montant dû])',
  'Bonjour,

Sauf erreur de notre part, nous constatons que les factures ci-dessous demeurent impayées pour votre compte [Code client]. Le montant total en attente s''élève à [Montant dû].

[Tableau Factures]

Nous vous demandons de bien vouloir régulariser cette situation dans les 48 heures, ou de prendre contact avec nous immédiatement afin de convenir d''un arrangement.

Cordialement,'
FROM organisations WHERE slug = 'elise-lyon';

COMMIT;
