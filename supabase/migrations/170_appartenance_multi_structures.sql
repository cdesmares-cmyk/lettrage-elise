-- Migration 170 : socle de l'appartenance multi-structures
--
-- Permet a un utilisateur d'appartenir a plusieurs organisations et de choisir
-- celle dans laquelle il travaille, sans se deconnecter.
--
-- ============================================================================
-- CETTE MIGRATION EST SANS EFFET, PAR CONSTRUCTION
-- ============================================================================
-- get_my_organisation_id() renvoie desormais COALESCE(organisation_active_id,
-- organisation_id). La colonne organisation_active_id est creee vide, et la
-- table d'appartenance est creee vide. Donc pour les 22 comptes existants, la
-- fonction renvoie exactement ce qu'elle renvoyait avant.
--
-- Le comportement ne change QUE pour un compte auquel on a explicitement cree
-- une appartenance. Aucun n'en a a l'issue de cette migration.
--
-- Ne creer aucune appartenance avant d'avoir applique la migration 171, qui
-- corrige les 6 regles qui ne suivraient pas la bascule.
--
-- ============================================================================
-- CE QUI SUIT AUTOMATIQUEMENT
-- ============================================================================
-- 40 regles d'isolation appellent get_my_organisation_id() : elles suivent la
-- bascule sans etre touchees. Les declencheurs inject_organisation_id des
-- tables clients et factures l'appellent aussi : les ecritures sont donc
-- estampillees avec la structure ACTIVE, pas celle d'origine.
--
-- Les 4 vues portent security_invoker=true : elles s'executent avec les droits
-- de l'appelant et heritent des regles des tables. Rien a y faire.
--
-- ============================================================================
-- CONTROLES APRES APPLICATION (a executer)
-- ============================================================================
--   -- 1. La fonction doit renvoyer la meme chose qu'avant pour tout le monde :
--   SELECT u.email,
--          o1.code_org AS origine,
--          u.organisation_active_id IS NULL AS active_vide
--   FROM utilisateurs u LEFT JOIN organisations o1 ON o1.id = u.organisation_id
--   ORDER BY u.email;
--   -- attendu : active_vide = true sur les 22 lignes
--
--   -- 2. Les deux objets sont crees et vides :
--   SELECT (SELECT count(*) FROM membres_organisations) AS appartenances,
--          (SELECT count(*) FROM utilisateurs
--           WHERE organisation_active_id IS NOT NULL)   AS structures_actives;
--   -- attendu : 0 et 0
--
-- ============================================================================
-- RETOUR ARRIERE
-- ============================================================================
--   DROP TRIGGER IF EXISTS trg_utilisateurs_valider_structure_active ON utilisateurs;
--   DROP FUNCTION IF EXISTS valider_structure_active();
--   DROP FUNCTION IF EXISTS basculer_organisation(uuid);
--   DROP FUNCTION IF EXISTS mes_organisations();
--   CREATE OR REPLACE FUNCTION get_my_organisation_id()
--   RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
--     SELECT organisation_id FROM utilisateurs WHERE id = auth.uid()
--   $$;
--   ALTER TABLE utilisateurs DROP COLUMN IF EXISTS organisation_active_id;
--   DROP TABLE IF EXISTS membres_organisations;
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. La table d'appartenance
-- ────────────────────────────────────────────────────────────────────────────
-- Pas de colonne role : en v1, un utilisateur a les memes droits dans toutes
-- les structures qu'il supervise. Le role reste porte par utilisateurs.role et
-- get_my_role() n'est pas touchee — ses 34 points d'appel restent intacts.

CREATE TABLE IF NOT EXISTS membres_organisations (
  utilisateur_id  UUID        NOT NULL REFERENCES utilisateurs(id)  ON DELETE CASCADE,
  organisation_id UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (utilisateur_id, organisation_id)
);

-- La cle primaire couvre les recherches par utilisateur. Celle-ci couvre le
-- sens inverse : « qui est membre de cette structure ».
CREATE INDEX IF NOT EXISTS idx_membres_organisations_org
  ON membres_organisations(organisation_id);

ALTER TABLE membres_organisations ENABLE ROW LEVEL SECURITY;

-- Chacun voit ses propres appartenances : c'est ce qui permet au portail de
-- savoir s'il doit s'afficher. Personne ne voit celles des autres.
DROP POLICY IF EXISTS membres_organisations_select_own ON membres_organisations;
CREATE POLICY membres_organisations_select_own ON membres_organisations
  FOR SELECT USING (utilisateur_id = auth.uid());

-- Le PERIMETRE est accorde par OCKHAM, pas par le client. S'ajouter une
-- structure, c'est acceder a des donnees qu'on ne paye pas : c'est la seule
-- chose qui ne doit jamais pouvoir s'auto-accorder.
DROP POLICY IF EXISTS membres_organisations_superadmin ON membres_organisations;
CREATE POLICY membres_organisations_superadmin ON membres_organisations
  FOR ALL USING (is_superadmin()) WITH CHECK (is_superadmin());

-- ────────────────────────────────────────────────────────────────────────────
-- 2. La structure active
-- ────────────────────────────────────────────────────────────────────────────
-- Elle vit cote serveur. Le navigateur demande une bascule, il ne la decide
-- pas : s'il pouvait envoyer l'organisation dans ses requetes, il pourrait en
-- envoyer n'importe laquelle.

ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS organisation_active_id UUID NULL REFERENCES organisations(id);

COMMENT ON COLUMN utilisateurs.organisation_active_id IS
  'Structure dans laquelle l''utilisateur travaille. NULL = sa structure d''origine. '
  'Ne peut valoir qu''une organisation declaree dans membres_organisations '
  '(garanti par trg_utilisateurs_valider_structure_active).';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. L'invariant, garanti par la base
-- ────────────────────────────────────────────────────────────────────────────
-- La regle utilisateurs_update_admin autorise un admin a modifier les comptes
-- de son organisation. Sans ce garde-fou, un admin pourrait poser n'importe
-- quelle organisation dans organisation_active_id et lire la base entiere.
--
-- Le controle est ici, et pas dans get_my_organisation_id(), parce que cette
-- fonction est appelee par 40 regles a chaque requete : elle doit rester aussi
-- rapide qu'aujourd'hui. Une mise a jour de compte est rare, une lecture ne
-- l'est pas.

CREATE OR REPLACE FUNCTION valider_structure_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.organisation_active_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM membres_organisations m
       WHERE m.utilisateur_id  = NEW.id
         AND m.organisation_id = NEW.organisation_active_id
     )
  THEN
    RAISE EXCEPTION
      'Structure active refusee : % n''est pas une appartenance declaree de cet utilisateur',
      NEW.organisation_active_id;
  END IF;

  -- La structure d'origine doit rester l'une des appartenances, sinon le repli
  -- de get_my_organisation_id() renverrait une structure dont l'utilisateur
  -- n'est plus membre. Ne s'applique qu'aux comptes qui ont des appartenances :
  -- les 22 comptes actuels n'en ont aucune et ne sont donc pas concernes.
  IF EXISTS (SELECT 1 FROM membres_organisations m WHERE m.utilisateur_id = NEW.id)
     AND NOT EXISTS (
       SELECT 1 FROM membres_organisations m
       WHERE m.utilisateur_id  = NEW.id
         AND m.organisation_id = NEW.organisation_id
     )
  THEN
    RAISE EXCEPTION
      'Structure d''origine refusee : elle doit figurer parmi les appartenances declarees';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_utilisateurs_valider_structure_active ON utilisateurs;
CREATE TRIGGER trg_utilisateurs_valider_structure_active
  BEFORE INSERT OR UPDATE ON utilisateurs
  FOR EACH ROW EXECUTE FUNCTION valider_structure_active();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. La fonction d'isolation
-- ────────────────────────────────────────────────────────────────────────────
-- Le seul point modifie du cloisonnement. 40 regles en dependent et basculeront
-- ensemble. Signature, langage et volatilite identiques a l'original.

CREATE OR REPLACE FUNCTION get_my_organisation_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(organisation_active_id, organisation_id)
  FROM utilisateurs
  WHERE id = auth.uid()
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. La bascule
-- ────────────────────────────────────────────────────────────────────────────
-- L'appartenance est verifiee ici, avant l'ecriture. Le declencheur de l'etape
-- 3 la verifie une seconde fois : deux controles independants, parce qu'une
-- fonction peut etre reecrite un jour sans qu'on y repense.

CREATE OR REPLACE FUNCTION basculer_organisation(p_organisation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Aucun utilisateur connecte';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM membres_organisations
    WHERE utilisateur_id  = auth.uid()
      AND organisation_id = p_organisation_id
  )
  THEN
    RAISE EXCEPTION 'Structure non autorisee';
  END IF;

  UPDATE utilisateurs
  SET organisation_active_id = p_organisation_id
  WHERE id = auth.uid();
END
$$;

REVOKE ALL     ON FUNCTION basculer_organisation(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION basculer_organisation(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. La liste des structures, pour le portail
-- ────────────────────────────────────────────────────────────────────────────
-- La regle organisations_select_own ne laisse voir que la structure ACTIVE.
-- Sans cette fonction, le portail n'aurait aucun nom a afficher sur ses tuiles.
--
-- SECURITY DEFINER pour contourner cette regle, mais le perimetre reste celui
-- des appartenances declarees : elle ne peut rien renvoyer d'autre. Elle ne
-- donne que le nom et le code — aucune donnee comptable.

CREATE OR REPLACE FUNCTION mes_organisations()
RETURNS TABLE (id uuid, nom text, code_org text, est_active boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT o.id,
         o.nom::text,
         o.code_org::text,
         o.id = COALESCE(u.organisation_active_id, u.organisation_id)
  FROM membres_organisations m
  JOIN organisations o ON o.id = m.organisation_id
  JOIN utilisateurs  u ON u.id = m.utilisateur_id
  WHERE m.utilisateur_id = auth.uid()
  ORDER BY o.nom
$$;

REVOKE ALL     ON FUNCTION mes_organisations() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION mes_organisations() TO authenticated;

COMMIT;
