-- Migration 019 : Multi-tenant — isolation par organisation_id + RLS strict
-- Organisation initiale : Elise Lyon
--
-- EXÉCUTION :
--   1. Coller ce fichier en entier dans Supabase Studio > SQL Editor
--   2. Cliquer Run
--   3. Noter l'UUID affiché à la fin (SELECT id FROM organisations WHERE slug = 'elise-lyon')
--   4. Vérifier : SELECT count(*), organisation_id FROM clients GROUP BY 2;
--
-- ROLLBACK :
--   Restaurer la branche Git backup/pre-multitenant
--   + Supabase Dashboard > Settings > Backups (restore point-in-time)
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 1 — Table organisations
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organisations (
  id      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nom     text        NOT NULL,
  slug    text        NOT NULL UNIQUE,
  actif   boolean     NOT NULL DEFAULT true,
  cree_le timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

-- Un utilisateur ne voit que son organisation
-- (la policy sur utilisateurs est créée après, car elle dépend de get_my_organisation_id)
CREATE POLICY IF NOT EXISTS "organisations_select_own" ON organisations
  FOR SELECT USING (
    id IN (SELECT organisation_id FROM utilisateurs WHERE id = auth.uid())
  );

-- Insérer Elise Lyon
INSERT INTO organisations (nom, slug)
VALUES ('Elise Lyon', 'elise-lyon')
ON CONFLICT (slug) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 2 — organisation_id dans utilisateurs
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- Rattacher tous les utilisateurs existants à Elise Lyon
UPDATE utilisateurs
SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon')
WHERE organisation_id IS NULL;

ALTER TABLE utilisateurs
  ALTER COLUMN organisation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_utilisateurs_organisation ON utilisateurs(organisation_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 3 — Fonctions helper RLS (security definer = pas de récursion)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_my_organisation_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT organisation_id FROM utilisateurs WHERE id = auth.uid()
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 4 — Trigger auto-injection organisation_id à l'INSERT
-- Évite de modifier chaque appel INSERT dans le code applicatif
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION inject_organisation_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.organisation_id IS NULL THEN
    NEW.organisation_id := get_my_organisation_id();
  END IF;
  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 5 — Ajout organisation_id + RLS sur chaque table
-- Schéma identique pour chaque table :
--   a. Ajout colonne nullable
--   b. Backfill → Elise Lyon
--   c. NOT NULL
--   d. Index
--   e. Trigger inject
--   f. Remplacement policy RLS
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 5a. clients ──────────────────────────────────────────────────────────────

ALTER TABLE clients ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
UPDATE clients SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon') WHERE organisation_id IS NULL;
ALTER TABLE clients ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_organisation ON clients(organisation_id);

DROP TRIGGER IF EXISTS clients_inject_org_id ON clients;
CREATE TRIGGER clients_inject_org_id
  BEFORE INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

DROP POLICY IF EXISTS "acces authentifie clients" ON clients;
CREATE POLICY "clients_org_isolation" ON clients
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- ── 5b. factures ─────────────────────────────────────────────────────────────

ALTER TABLE factures ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
UPDATE factures SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon') WHERE organisation_id IS NULL;
ALTER TABLE factures ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_factures_organisation ON factures(organisation_id);

DROP TRIGGER IF EXISTS factures_inject_org_id ON factures;
CREATE TRIGGER factures_inject_org_id
  BEFORE INSERT ON factures
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

DROP POLICY IF EXISTS "acces authentifie factures" ON factures;
CREATE POLICY "factures_org_isolation" ON factures
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- ── 5c. lignes_bancaires ─────────────────────────────────────────────────────

ALTER TABLE lignes_bancaires ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
UPDATE lignes_bancaires SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon') WHERE organisation_id IS NULL;
ALTER TABLE lignes_bancaires ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lignes_bancaires_organisation ON lignes_bancaires(organisation_id);

DROP TRIGGER IF EXISTS lignes_bancaires_inject_org_id ON lignes_bancaires;
CREATE TRIGGER lignes_bancaires_inject_org_id
  BEFORE INSERT ON lignes_bancaires
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

DROP POLICY IF EXISTS "acces authentifie lignes" ON lignes_bancaires;
CREATE POLICY "lignes_bancaires_org_isolation" ON lignes_bancaires
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- ── 5d. lettrages ────────────────────────────────────────────────────────────

ALTER TABLE lettrages ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
UPDATE lettrages SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon') WHERE organisation_id IS NULL;
ALTER TABLE lettrages ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lettrages_organisation ON lettrages(organisation_id);

DROP TRIGGER IF EXISTS lettrages_inject_org_id ON lettrages;
CREATE TRIGGER lettrages_inject_org_id
  BEFORE INSERT ON lettrages
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

DROP POLICY IF EXISTS "acces authentifie lettrages" ON lettrages;
CREATE POLICY "lettrages_org_isolation" ON lettrages
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- ── 5e. remises ──────────────────────────────────────────────────────────────

ALTER TABLE remises ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
UPDATE remises SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon') WHERE organisation_id IS NULL;
ALTER TABLE remises ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_remises_organisation ON remises(organisation_id);

DROP TRIGGER IF EXISTS remises_inject_org_id ON remises;
CREATE TRIGGER remises_inject_org_id
  BEFORE INSERT ON remises
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

DROP POLICY IF EXISTS "acces authentifie remises" ON remises;
CREATE POLICY "remises_org_isolation" ON remises
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- ── 5f. imports ──────────────────────────────────────────────────────────────

ALTER TABLE imports ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
UPDATE imports SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon') WHERE organisation_id IS NULL;
ALTER TABLE imports ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_imports_organisation ON imports(organisation_id);

DROP TRIGGER IF EXISTS imports_inject_org_id ON imports;
CREATE TRIGGER imports_inject_org_id
  BEFORE INSERT ON imports
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

DROP POLICY IF EXISTS "acces authentifie imports" ON imports;
CREATE POLICY "imports_org_isolation" ON imports
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- Corriger cree_par (uuid sans FK) → FK vers utilisateurs
ALTER TABLE imports
  DROP CONSTRAINT IF EXISTS imports_cree_par_fk;
ALTER TABLE imports
  ADD CONSTRAINT imports_cree_par_fk
  FOREIGN KEY (cree_par) REFERENCES utilisateurs(id) ON DELETE SET NULL;

-- ── 5g. relances ─────────────────────────────────────────────────────────────

ALTER TABLE relances ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
UPDATE relances SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon') WHERE organisation_id IS NULL;
ALTER TABLE relances ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_relances_organisation ON relances(organisation_id);

DROP TRIGGER IF EXISTS relances_inject_org_id ON relances;
CREATE TRIGGER relances_inject_org_id
  BEFORE INSERT ON relances
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

DROP POLICY IF EXISTS "relances_select_own"   ON relances;
DROP POLICY IF EXISTS "relances_select_admin" ON relances;
DROP POLICY IF EXISTS "relances_insert"       ON relances;
DROP POLICY IF EXISTS "relances_update_own"   ON relances;
DROP POLICY IF EXISTS "relances_delete_own"   ON relances;

CREATE POLICY "relances_select" ON relances
  FOR SELECT USING (organisation_id = get_my_organisation_id());

CREATE POLICY "relances_insert" ON relances
  FOR INSERT WITH CHECK (
    organisation_id = get_my_organisation_id()
    AND get_my_role() IN ('admin', 'responsable_poste_client')
    AND operateur_id = auth.uid()
  );

CREATE POLICY "relances_update" ON relances
  FOR UPDATE USING (
    organisation_id = get_my_organisation_id()
    AND operateur_id = auth.uid()
  );

CREATE POLICY "relances_delete" ON relances
  FOR DELETE USING (
    organisation_id = get_my_organisation_id()
    AND operateur_id = auth.uid()
    AND statut = 'brouillon'
  );

-- ── 5h. contacts ─────────────────────────────────────────────────────────────

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
UPDATE contacts SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon') WHERE organisation_id IS NULL;
ALTER TABLE contacts ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_organisation ON contacts(organisation_id);

DROP TRIGGER IF EXISTS contacts_inject_org_id ON contacts;
CREATE TRIGGER contacts_inject_org_id
  BEFORE INSERT ON contacts
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

DROP POLICY IF EXISTS "acces authentifie contacts" ON contacts;
CREATE POLICY "contacts_org_isolation" ON contacts
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- La contrainte UNIQUE(email, code_client) doit être scopée à l'organisation
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_email_code_client_key;
ALTER TABLE contacts ADD CONSTRAINT contacts_org_email_client_uniq
  UNIQUE (organisation_id, email, code_client);

-- ── 5i. libelles_sepa ────────────────────────────────────────────────────────

ALTER TABLE libelles_sepa ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
UPDATE libelles_sepa SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon') WHERE organisation_id IS NULL;
ALTER TABLE libelles_sepa ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_libelles_sepa_organisation ON libelles_sepa(organisation_id);

DROP TRIGGER IF EXISTS libelles_sepa_inject_org_id ON libelles_sepa;
CREATE TRIGGER libelles_sepa_inject_org_id
  BEFORE INSERT ON libelles_sepa
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

DROP POLICY IF EXISTS "acces authentifie sepa" ON libelles_sepa;
CREATE POLICY "libelles_sepa_org_isolation" ON libelles_sepa
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- ── 5j. ref_valeurs ──────────────────────────────────────────────────────────
-- nullable : NULL = valeur globale partagée / non-null = valeur propre à l'org

ALTER TABLE ref_valeurs ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
UPDATE ref_valeurs SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon') WHERE organisation_id IS NULL;

-- La contrainte UNIQUE(categorie, valeur) doit inclure l'organisation
ALTER TABLE ref_valeurs DROP CONSTRAINT IF EXISTS ref_valeurs_categorie_valeur_key;
ALTER TABLE ref_valeurs ADD CONSTRAINT ref_valeurs_org_categorie_valeur_uniq
  UNIQUE (organisation_id, categorie, valeur);

DROP POLICY IF EXISTS "acces authentifie ref_valeurs" ON ref_valeurs;
CREATE POLICY "ref_valeurs_org_isolation" ON ref_valeurs
  FOR ALL USING (
    organisation_id IS NULL
    OR organisation_id = get_my_organisation_id()
  );

-- ── 5k. commentaires_factures ────────────────────────────────────────────────

ALTER TABLE commentaires_factures ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
UPDATE commentaires_factures SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon') WHERE organisation_id IS NULL;
ALTER TABLE commentaires_factures ALTER COLUMN organisation_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commentaires_factures_organisation ON commentaires_factures(organisation_id);

DROP TRIGGER IF EXISTS commentaires_factures_inject_org_id ON commentaires_factures;
CREATE TRIGGER commentaires_factures_inject_org_id
  BEFORE INSERT ON commentaires_factures
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

-- Contrainte upsert scopée à l'organisation
ALTER TABLE commentaires_factures DROP CONSTRAINT IF EXISTS commentaires_factures_numero_piece_key;
ALTER TABLE commentaires_factures ADD CONSTRAINT commentaires_factures_org_piece_uniq
  UNIQUE (organisation_id, numero_piece);

-- Recréer les policies (nom à adapter si différent dans la base)
DROP POLICY IF EXISTS "acces commentaires_factures" ON commentaires_factures;
DROP POLICY IF EXISTS "commentaires_select" ON commentaires_factures;
DROP POLICY IF EXISTS "commentaires_all" ON commentaires_factures;
CREATE POLICY "commentaires_factures_org_isolation" ON commentaires_factures
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- ── 5l. audit_log ────────────────────────────────────────────────────────────

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);
UPDATE audit_log SET organisation_id = (SELECT id FROM organisations WHERE slug = 'elise-lyon') WHERE organisation_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_organisation ON audit_log(organisation_id);

DROP TRIGGER IF EXISTS audit_log_inject_org_id ON audit_log;
CREATE TRIGGER audit_log_inject_org_id
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

DROP POLICY IF EXISTS "lecture audit" ON audit_log;
DROP POLICY IF EXISTS "insertion audit" ON audit_log;
CREATE POLICY "audit_log_org_isolation" ON audit_log
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 6 — Corriger sync_reste_du() pour filtrer par organisation_id
-- Sans ce correctif, sur multi-org une facture FA-001 org A mettrait à jour
-- FA-001 org B si les numéros coïncident.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_reste_du()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE factures
    SET reste_du = reste_du + OLD.montant
    WHERE numero_piece = OLD.numero_facture
      AND organisation_id = OLD.organisation_id;

  ELSIF TG_OP = 'INSERT' THEN
    UPDATE factures
    SET reste_du = reste_du - NEW.montant
    WHERE numero_piece = NEW.numero_facture
      AND organisation_id = NEW.organisation_id;

  ELSE -- UPDATE
    IF OLD.numero_facture IS DISTINCT FROM NEW.numero_facture THEN
      UPDATE factures SET reste_du = reste_du + OLD.montant
        WHERE numero_piece = OLD.numero_facture AND organisation_id = OLD.organisation_id;
      UPDATE factures SET reste_du = reste_du - NEW.montant
        WHERE numero_piece = NEW.numero_facture AND organisation_id = NEW.organisation_id;
    ELSE
      UPDATE factures
      SET reste_du = reste_du + OLD.montant - NEW.montant
      WHERE numero_piece = NEW.numero_facture
        AND organisation_id = NEW.organisation_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 7 — Vues avec security_invoker = true
-- Par défaut les vues tournent en security_definer (contournent le RLS).
-- security_invoker = true force le RLS de l'appelant sur les tables de base.
-- ══════════════════════════════════════════════════════════════════════════════

DROP VIEW IF EXISTS v_comptes_clients CASCADE;
DROP VIEW IF EXISTS v_factures_avec_reste_du CASCADE;

CREATE VIEW v_factures_avec_reste_du
WITH (security_invoker = true)
AS
SELECT
  f.numero_piece,
  f.code_client,
  f.nom_client,
  f.date_emission,
  f.date_echeance,
  f.montant_ht,
  f.montant_ttc,
  f.est_avoir,
  f.est_provisionnee,
  f.statut_facture,
  f.commentaire,
  f.organisation_id,
  f.montant_ttc - f.reste_du AS montant_lettre,
  f.reste_du,
  CASE
    WHEN f.est_avoir                                   THEN 'avoir'
    WHEN (f.montant_ttc - f.reste_du) = 0             THEN 'impaye'
    WHEN (f.montant_ttc - f.reste_du) > f.montant_ttc
         AND f.montant_ttc > 0                         THEN 'sur-lettre'
    WHEN (f.montant_ttc - f.reste_du) >= f.montant_ttc
         AND f.montant_ttc > 0                         THEN 'paye'
    ELSE 'partiel'
  END AS statut_paiement
FROM factures f;

CREATE VIEW v_comptes_clients
WITH (security_invoker = true)
AS
SELECT
  c.code_dso,
  c.nom,
  c.statut_juridique,
  c.commercial,
  c.operateur,
  c.plateforme,
  c.code_groupement,
  c.organisation_id,
  COUNT(f.numero_piece)::int                                                    AS nb_factures_total,
  COUNT(CASE WHEN f.reste_du > 0.005 AND f.est_avoir = false THEN 1 END)::int  AS nb_impayees,
  COALESCE(
    SUM(CASE WHEN f.reste_du > 0.005 AND f.est_avoir = false THEN f.reste_du ELSE 0 END),
    0
  )::numeric(12,2)                                                              AS encours_total,
  MAX(f.date_emission)                                                          AS derniere_emission
FROM clients c
LEFT JOIN factures f ON f.code_client = c.code_dso
                     AND f.organisation_id = c.organisation_id
GROUP BY
  c.code_dso, c.nom, c.statut_juridique, c.commercial, c.operateur,
  c.plateforme, c.code_groupement, c.organisation_id;

-- Recréer scores_relance avec security_invoker
CREATE OR REPLACE VIEW scores_relance
WITH (security_invoker = true)
AS
SELECT
  u.id                                                                            AS operateur_id,
  u.nom_affiche,
  u.role,
  COALESCE(SUM(r.points_attribues) FILTER (
    WHERE r.envoyee_le >= date_trunc('month', now())
  ), 0)                                                                           AS score_mois,
  COUNT(*) FILTER (
    WHERE r.envoyee_le >= date_trunc('month', now())
      AND r.statut != 'brouillon'
  )                                                                               AS nb_relances_mois,
  ROUND(
    COUNT(*) FILTER (
      WHERE r.statut IN ('repondue', 'payee')
        AND r.envoyee_le >= date_trunc('month', now())
    )::numeric
    / NULLIF(COUNT(*) FILTER (
      WHERE r.statut != 'brouillon'
        AND r.envoyee_le >= date_trunc('month', now())
    ), 0) * 100
  , 1)                                                                            AS taux_reponse_pct
FROM utilisateurs u
LEFT JOIN relances r ON r.operateur_id = u.id
WHERE u.role IN ('admin', 'responsable_poste_client')
GROUP BY u.id, u.nom_affiche, u.role;

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 8 — Table integrations (Axonaut et futurs connecteurs)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS integrations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  provider        text        NOT NULL,
  api_key         text,
  config          jsonb,
  actif           boolean     NOT NULL DEFAULT true,
  verifie_le      timestamptz,
  cree_le         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integrations_organisation ON integrations(organisation_id);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_select" ON integrations
  FOR SELECT USING (organisation_id = get_my_organisation_id());

CREATE POLICY "integrations_admin_write" ON integrations
  FOR INSERT WITH CHECK (
    organisation_id = get_my_organisation_id()
    AND get_my_role() = 'admin'
  );

CREATE POLICY "integrations_admin_update" ON integrations
  FOR UPDATE USING (
    organisation_id = get_my_organisation_id()
    AND get_my_role() = 'admin'
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 9 — Trigger : auto-affecter organisation_id aux nouveaux utilisateurs
-- ══════════════════════════════════════════════════════════════════════════════

-- Remplace l'ancien trigger on_auth_user_created pour inclure organisation_id
-- NOTE : pour les nouveaux clients, l'admin devra définir l'organisation_id
-- manuellement après création (ou via une Edge Function dédiée).
CREATE OR REPLACE FUNCTION on_auth_user_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO utilisateurs (id, email, nom_affiche)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATIONS FINALES
-- ══════════════════════════════════════════════════════════════════════════════

-- Afficher l'UUID de l'organisation Elise Lyon (à conserver précieusement)
SELECT id AS "UUID Elise Lyon", nom, slug FROM organisations WHERE slug = 'elise-lyon';

-- Vérifier que toutes les données sont bien rattachées
SELECT 'clients'              AS table_name, count(*) AS total, count(organisation_id) AS avec_org FROM clients
UNION ALL
SELECT 'factures',            count(*), count(organisation_id) FROM factures
UNION ALL
SELECT 'lignes_bancaires',    count(*), count(organisation_id) FROM lignes_bancaires
UNION ALL
SELECT 'lettrages',           count(*), count(organisation_id) FROM lettrages
UNION ALL
SELECT 'remises',             count(*), count(organisation_id) FROM remises
UNION ALL
SELECT 'imports',             count(*), count(organisation_id) FROM imports
UNION ALL
SELECT 'relances',            count(*), count(organisation_id) FROM relances
UNION ALL
SELECT 'contacts',            count(*), count(organisation_id) FROM contacts
UNION ALL
SELECT 'commentaires_factures', count(*), count(organisation_id) FROM commentaires_factures
UNION ALL
SELECT 'utilisateurs',        count(*), count(organisation_id) FROM utilisateurs;

COMMIT;
