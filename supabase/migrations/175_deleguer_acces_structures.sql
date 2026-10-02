-- Migration 175 : deleguer l'ouverture d'une structure a un admin client
--
-- ============================================================================
-- C'EST LE POINT D'ESCALADE DE PRIVILEGES DE TOUT LE CHANTIER
-- ============================================================================
-- Jusqu'ici, seul le superadmin OCKHAM pouvait creer une appartenance. Cette
-- migration ouvre ce droit a un admin client, et toute erreur ici permet a un
-- client d'acceder a une structure qui ne lui appartient pas.
--
-- A lire ligne par ligne avant application.
--
-- ============================================================================
-- LE PARTAGE, INCHANGE
-- ============================================================================
-- OCKHAM accorde le PERIMETRE : quelles structures une personne supervise.
-- C'est un acte commercial — une structure se facture — et c'est la seule
-- chose qui ne doit jamais pouvoir s'auto-accorder.
--
-- Le client repartit A L'INTERIEUR de son perimetre : ouvrir Bordeaux a Sarah,
-- le retirer a Marc. Jamais atteindre une cinquieme structure.
--
-- ============================================================================
-- POURQUOI DES FONCTIONS ET PAS DES REGLES D'ECRITURE
-- ============================================================================
-- Trois raisons.
--
-- 1. Le declencheur trg_utilisateurs_valider_structure_active impose qu'un
--    utilisateur ayant des appartenances compte sa structure D'ORIGINE parmi
--    elles. Donner sa premiere appartenance a quelqu'un suppose donc d'en
--    creer DEUX : son origine, puis la nouvelle. Une regle d'ecriture ne sait
--    pas faire ca — elle autorise ou refuse une ligne, elle n'en ajoute pas.
--    Oublier l'origine laisserait un compte dont toute modification ulterieure
--    serait refusee, sans que personne comprenne pourquoi.
--
-- 2. Les controles sont au meme endroit, lisibles d'un bloc, et ils ne peuvent
--    pas etre contournes en fabriquant une requete : l'ecriture directe reste
--    reservee au superadmin.
--
-- 3. Un refus porte un message explicite au lieu d'une ligne qui disparait
--    silencieusement.
--
-- ============================================================================
-- LES QUATRE VERROUS DE ouvrir_structure()
-- ============================================================================
-- 1. L'appelant est admin.
--      Un commercial ou un externe ne delegue rien.
--
-- 2. L'appelant est MEMBRE DECLARE de la structure qu'il ouvre.
--      C'est le verrou central : il ne peut donner que ce qu'il a. Un admin
--      d'une seule structure n'a aucune appartenance declaree, donc il ne peut
--      rien ouvrir du tout — les 22 comptes actuels sont dans ce cas.
--
-- 3. La structure D'ORIGINE de la personne visee fait partie du perimetre de
--    l'appelant.
--      Sans ce verrou, un admin connaissant un identifiant pourrait faire
--      entrer n'importe qui, y compris un utilisateur d'un autre client
--      OCKHAM, dans sa propre structure.
--
-- 4. La personne visee n'est ni superadmin ni externe.
--      On ne touche pas aux comptes OCKHAM, et un externe reste hors du
--      multi-structures.
--
-- Et fermer_structure() refuse deux cas qui mettraient quelqu'un en panne :
-- retirer la structure d'ORIGINE de quelqu'un, et se retirer soi-meme.
-- Les deux ne se rattrapent que par une intervention OCKHAM.
--
-- ============================================================================
-- CONTROLES APRES APPLICATION
-- ============================================================================
-- Depuis le compte de test, qui est membre de C-000002 et C-000006 :
--
--   -- doit ECHOUER : structure hors perimetre
--   SELECT ouvrir_structure('<un utilisateur>', '<id de SAS MELEZE>');
--
--   -- doit ECHOUER : personne hors perimetre
--   SELECT ouvrir_structure('<un utilisateur de MELEZE>', '<id de C-000002>');
--
-- Un echec silencieux n'existe pas ici : chaque refus leve une exception
-- nommee.
--
-- ============================================================================
-- RETOUR ARRIERE
-- ============================================================================
--   DROP FUNCTION IF EXISTS ouvrir_structure(uuid, uuid);
--   DROP FUNCTION IF EXISTS fermer_structure(uuid, uuid);
--   DROP FUNCTION IF EXISTS equipes_mes_organisations();
--   DROP POLICY IF EXISTS membres_organisations_select_perimetre ON membres_organisations;
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Voir les appartenances de son perimetre
-- ────────────────────────────────────────────────────────────────────────────
-- S'ajoute a membres_organisations_select_own, qui laisse chacun voir les
-- siennes. Celle-ci laisse un admin voir celles des structures dont il est
-- lui-meme membre — pas une de plus.

DROP POLICY IF EXISTS membres_organisations_select_perimetre ON membres_organisations;
CREATE POLICY membres_organisations_select_perimetre ON membres_organisations
  FOR SELECT USING (
    get_my_role() = 'admin'
    AND organisation_id IN (
      SELECT m.organisation_id FROM membres_organisations m
      WHERE m.utilisateur_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Ouvrir une structure a quelqu'un
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ouvrir_structure(p_utilisateur_id uuid, p_organisation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origine_cible uuid;
  v_role_cible    text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Aucun utilisateur connecte';
  END IF;

  -- Verrou 1 : l'appelant est admin.
  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Reserve aux administrateurs';
  END IF;

  -- Verrou 2 : il ne peut donner que ce qu'il a.
  IF NOT EXISTS (
    SELECT 1 FROM membres_organisations
    WHERE utilisateur_id = auth.uid() AND organisation_id = p_organisation_id
  ) THEN
    RAISE EXCEPTION 'Structure hors de votre perimetre';
  END IF;

  SELECT organisation_id, role INTO v_origine_cible, v_role_cible
  FROM utilisateurs WHERE id = p_utilisateur_id;

  IF v_origine_cible IS NULL THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  -- Verrou 4 : on ne touche ni aux comptes OCKHAM ni aux externes.
  IF v_role_cible IN ('superadmin', 'externe') THEN
    RAISE EXCEPTION 'Ce compte ne peut pas etre rattache a plusieurs structures';
  END IF;

  -- Verrou 3 : la personne doit deja appartenir au perimetre de l'appelant,
  -- par sa structure d'origine ou par une appartenance deja declaree. Sinon un
  -- admin pourrait faire entrer chez lui l'utilisateur d'un autre client.
  IF NOT EXISTS (
    SELECT 1 FROM membres_organisations
    WHERE utilisateur_id = auth.uid() AND organisation_id = v_origine_cible
  ) AND NOT EXISTS (
    SELECT 1 FROM membres_organisations mc
    JOIN membres_organisations ma ON ma.organisation_id = mc.organisation_id
    WHERE mc.utilisateur_id = p_utilisateur_id AND ma.utilisateur_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Cette personne n''appartient pas a votre perimetre';
  END IF;

  -- La structure d'origine d'abord : le declencheur de la migration 170 exige
  -- qu'elle figure parmi les appartenances des qu'il en existe au moins une.
  -- L'omettre rendrait toute modification ulterieure du compte impossible.
  INSERT INTO membres_organisations (utilisateur_id, organisation_id)
  VALUES (p_utilisateur_id, v_origine_cible)
  ON CONFLICT DO NOTHING;

  INSERT INTO membres_organisations (utilisateur_id, organisation_id)
  VALUES (p_utilisateur_id, p_organisation_id)
  ON CONFLICT DO NOTHING;
END
$$;

REVOKE ALL     ON FUNCTION ouvrir_structure(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION ouvrir_structure(uuid, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. Retirer une structure a quelqu'un
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fermer_structure(p_utilisateur_id uuid, p_organisation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_origine_cible uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Aucun utilisateur connecte';
  END IF;

  IF get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Reserve aux administrateurs';
  END IF;

  IF p_utilisateur_id = auth.uid() THEN
    RAISE EXCEPTION 'On ne retire pas sa propre structure';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM membres_organisations
    WHERE utilisateur_id = auth.uid() AND organisation_id = p_organisation_id
  ) THEN
    RAISE EXCEPTION 'Structure hors de votre perimetre';
  END IF;

  SELECT organisation_id INTO v_origine_cible
  FROM utilisateurs WHERE id = p_utilisateur_id;

  -- Retirer l'origine casserait l'invariant du declencheur : le compte
  -- deviendrait immodifiable. Seul OCKHAM peut deplacer quelqu'un.
  IF v_origine_cible = p_organisation_id THEN
    RAISE EXCEPTION 'On ne retire pas la structure d''origine d''un compte';
  END IF;

  DELETE FROM membres_organisations
  WHERE utilisateur_id = p_utilisateur_id AND organisation_id = p_organisation_id;

  -- Si la structure retiree etait la structure active, on y laisserait
  -- l'utilisateur sans appartenance : on le ramene sur son origine.
  UPDATE utilisateurs
  SET organisation_active_id = NULL
  WHERE id = p_utilisateur_id AND organisation_active_id = p_organisation_id;
END
$$;

REVOKE ALL     ON FUNCTION fermer_structure(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION fermer_structure(uuid, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. L'onglet Equipes
-- ────────────────────────────────────────────────────────────────────────────
-- Une ligne par personne du perimetre, avec les structures auxquelles elle a
-- acces. Ne renvoie que des identites : nom, email, role. Aucune donnee
-- comptable.

CREATE OR REPLACE FUNCTION equipes_mes_organisations()
RETURNS TABLE (
  utilisateur_id  uuid,
  prenom          text,
  nom             text,
  email           text,
  role            text,
  organisation_id uuid,
  est_origine     boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH mon_perimetre AS (
    SELECT m.organisation_id AS oid
    FROM membres_organisations m
    WHERE m.utilisateur_id = auth.uid()
      AND get_my_role() = 'admin'
  )
  SELECT u.id,
         u.prenom::text,
         u.nom::text,
         u.email::text,
         u.role::text,
         mo.organisation_id,
         mo.organisation_id = u.organisation_id
  FROM membres_organisations mo
  JOIN mon_perimetre mp ON mp.oid = mo.organisation_id
  JOIN utilisateurs  u  ON u.id = mo.utilisateur_id
  WHERE u.role <> 'superadmin'
  ORDER BY u.nom, u.prenom
$$;

REVOKE ALL     ON FUNCTION equipes_mes_organisations() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION equipes_mes_organisations() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
