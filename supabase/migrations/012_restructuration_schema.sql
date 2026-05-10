-- Migration 012 : Restructuration schéma — Mai 2026
-- Nettoyage table clients, renommage opérateur, ref_valeurs, contacts, truncate data

-- ── 0. DROP vues dépendantes des colonnes à supprimer ───────────────────────
-- v_stats_clients référence est_plateforme / est_groupement — on la supprime
-- (elle n'est plus utilisée depuis la restructuration)

DROP VIEW IF EXISTS v_stats_clients CASCADE;
DROP VIEW IF EXISTS v_comptes_clients CASCADE;

-- ── 1. TABLE CLIENTS : suppression anciens champs, ajout nouveaux ──────────

ALTER TABLE clients
  DROP COLUMN IF EXISTS ancien_code,
  DROP COLUMN IF EXISTS est_plateforme,
  DROP COLUMN IF EXISTS est_groupement,
  DROP COLUMN IF EXISTS parent_code_dso,
  DROP COLUMN IF EXISTS mode_paiement,
  DROP COLUMN IF EXISTS statut;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS commercial text,
  ADD COLUMN IF NOT EXISTS operateur  text;

-- ── 2. LETTRAGES : nom_operateur → operateur ────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'lettrages' AND column_name = 'nom_operateur'
  ) THEN
    ALTER TABLE lettrages RENAME COLUMN nom_operateur TO operateur;
  ELSE
    ALTER TABLE lettrages ADD COLUMN IF NOT EXISTS operateur text;
  END IF;
END$$;

-- ── 3. REMISES : nom_operateur → operateur ──────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'remises' AND column_name = 'nom_operateur'
  ) THEN
    ALTER TABLE remises RENAME COLUMN nom_operateur TO operateur;
  ELSE
    ALTER TABLE remises ADD COLUMN IF NOT EXISTS operateur text;
  END IF;
END$$;

-- ── 4. TABLE REF_VALEURS : listes de référence gérées par l'admin ───────────

CREATE TABLE IF NOT EXISTS ref_valeurs (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  categorie text    NOT NULL CHECK (categorie IN ('commercial', 'operateur', 'plateforme')),
  valeur    text    NOT NULL,
  actif     boolean NOT NULL DEFAULT true,
  ordre     int     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(categorie, valeur)
);

CREATE INDEX IF NOT EXISTS idx_ref_valeurs_categorie ON ref_valeurs(categorie, actif);

ALTER TABLE ref_valeurs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acces authentifie ref_valeurs" ON ref_valeurs
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 5. TABLE CONTACTS ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contacts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  code_client text NOT NULL REFERENCES clients(code_dso) ON DELETE CASCADE,
  nom         text,
  prenom      text,
  telephone   text,
  commentaire text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz,
  UNIQUE(email, code_client)
);

CREATE INDEX IF NOT EXISTS idx_contacts_code_client ON contacts(code_client);
CREATE INDEX IF NOT EXISTS idx_contacts_email       ON contacts(email);

CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acces authentifie contacts" ON contacts
  FOR ALL USING (auth.uid() IS NOT NULL);

-- ── 6. VUE v_comptes_clients : ajout commercial + operateur ─────────────────

CREATE OR REPLACE VIEW v_comptes_clients AS
SELECT
  c.code_dso,
  c.nom,
  c.statut_juridique,
  c.commercial,
  c.operateur,
  c.plateforme,
  c.code_groupement,
  COUNT(vf.numero_piece)::int                                                    AS nb_factures_total,
  COUNT(CASE WHEN vf.reste_du > 0.005 AND vf.est_avoir = false THEN 1 END)::int AS nb_impayees,
  COALESCE(
    SUM(CASE WHEN vf.reste_du > 0.005 AND vf.est_avoir = false THEN vf.reste_du ELSE 0 END),
    0
  )::numeric(12,2)                                                               AS encours_total,
  MAX(vf.date_emission)                                                          AS derniere_emission
FROM clients c
LEFT JOIN v_factures_avec_reste_du vf ON vf.code_client = c.code_dso
GROUP BY
  c.code_dso, c.nom, c.statut_juridique, c.commercial, c.operateur,
  c.plateforme, c.code_groupement;

-- ── 7. TABLE IMPORTS : extension de la contrainte type ──────────────────────

ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_type_check;
ALTER TABLE imports ADD CONSTRAINT imports_type_check
  CHECK (type IN (
    'csv_bancaire', 'xlsx_factures', 'import_lettrage',
    'import_groupements', 'import_clients', 'import_contacts'
  ));

-- ── 8. PURGE DONNÉES (ordre respectant les FK) ──────────────────────────────
-- Vider toutes les données métier pour repartir sur une base propre

TRUNCATE TABLE
  lettrages,
  remises,
  libelles_sepa,
  lignes_bancaires,
  imports,
  factures,
  clients
RESTART IDENTITY CASCADE;
