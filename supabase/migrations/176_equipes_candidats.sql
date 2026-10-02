-- Migration 176 : l'ecran Equipes doit aussi voir ceux qui n'ont RIEN
--
-- ============================================================================
-- LE DEFAUT DE LA 175
-- ============================================================================
-- equipes_mes_organisations() partait de membres_organisations. Elle ne
-- renvoyait donc que les personnes ayant DEJA une appartenance declaree.
--
-- Or l'ecran sert justement a en donner une. Sarah, operatrice de Lyon sans
-- appartenance, n'y apparaissait pas — et c'est precisement a elle qu'on veut
-- ouvrir Bordeaux. L'ecran n'aurait montre que les gens qu'on n'a plus besoin
-- de rattacher.
--
-- ============================================================================
-- QUI EST CANDIDAT
-- ============================================================================
-- Deux origines, reunies :
--   - les personnes dont la structure D'ORIGINE est dans le perimetre, qu'elles
--     aient ou non une appartenance ;
--   - celles qui ont deja une appartenance dans le perimetre, meme si leur
--     origine est ailleurs.
--
-- Ce sont exactement les personnes que ouvrir_structure() accepte : l'ecran ne
-- propose donc jamais une action que la base refusera. Les superadmin et les
-- externes sont ecartes, comme dans les fonctions d'ecriture.
--
-- ============================================================================
-- CHANGEMENT DE FORME
-- ============================================================================
-- Une ligne PAR PERSONNE, avec ses structures dans un tableau, au lieu d'une
-- ligne par couple personne-structure. Une personne sans appartenance a un
-- tableau vide — elle existe a l'ecran, ce qui etait tout le probleme.
--
-- Le perimetre reste celui de l'appelant : un admin ne voit que les structures
-- dont il est lui-meme membre, et les personnes qui y sont rattachees.
--
-- Aucune donnee comptable : des identites, rien d'autre.
--
-- ============================================================================
-- RETOUR ARRIERE
-- ============================================================================
--   DROP FUNCTION IF EXISTS equipes_mes_organisations();
--   -- puis rejouer la section 3 de la migration 175
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS equipes_mes_organisations();

CREATE FUNCTION equipes_mes_organisations()
RETURNS TABLE (
  utilisateur_id uuid,
  prenom         text,
  nom            text,
  email          text,
  role           text,
  origine_id     uuid,
  structures     uuid[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH perimetre AS (
    SELECT m.organisation_id AS oid
    FROM membres_organisations m
    WHERE m.utilisateur_id = auth.uid()
      AND get_my_role() = 'admin'
  ),
  candidats AS (
    SELECT u.id
    FROM utilisateurs u
    JOIN perimetre p ON p.oid = u.organisation_id
    UNION
    SELECT mo.utilisateur_id
    FROM membres_organisations mo
    JOIN perimetre p ON p.oid = mo.organisation_id
  )
  SELECT u.id,
         u.prenom::text,
         u.nom::text,
         u.email::text,
         u.role::text,
         u.organisation_id,
         COALESCE(
           ARRAY(
             SELECT mo.organisation_id
             FROM membres_organisations mo
             JOIN perimetre p ON p.oid = mo.organisation_id
             WHERE mo.utilisateur_id = u.id
             ORDER BY mo.organisation_id
           ),
           '{}'::uuid[]
         )
  FROM candidats c
  JOIN utilisateurs u ON u.id = c.id
  WHERE u.role NOT IN ('superadmin', 'externe')
  ORDER BY u.nom, u.prenom
$$;

REVOKE ALL     ON FUNCTION equipes_mes_organisations() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION equipes_mes_organisations() TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
