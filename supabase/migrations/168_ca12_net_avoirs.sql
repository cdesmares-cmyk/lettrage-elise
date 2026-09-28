-- Migration 168 : le chiffre d'affaires de reference devient net d'avoirs
--
-- POURQUOI. recalculer_ca12_org alimente ca12_mois, le denominateur du DSO.
--   Audit du 2026-09-28, deux defauts :
--
--   1. AVOIRS IGNORES. La somme filtre est_avoir = false. Le chiffre d'affaires
--      reel, c'est factures MOINS avoirs. Les ignorer gonfle le denominateur,
--      donc baisse le DSO. Mesure : +1,8 jour une fois corrige.
--
--   2. PERIMETRE ASYMETRIQUE. Le numerateur du DSO exclut les pseudo-factures
--      411_, le denominateur non — la ligne d'exclusion existe pourtant trois
--      lignes plus haut, pour determiner le mois de reference. Sans effet sur
--      les donnees actuelles, mais deux perimetres differents de part et
--      d'autre d'une division restent une erreur.
--
-- CE QUI CHANGE. Les avoirs sont deduits, les 411_ exclus, sur les deux
--   fenetres. Le mois de reference est inchange.
--
-- CE QUI NE CHANGE PAS. La signature, les colonnes ecrites, le comportement
--   d'appel depuis la page d'import.
--
-- A SAVOIR. Cette fonction n'est appelee qu'a l'import (PageDepot.tsx). Sans
--   rappel explicite, ca12_mois garderait sa valeur d'avant jusqu'au prochain
--   depot de fichier. D'ou le recalcul pour toutes les organisations en fin de
--   fichier.
--
-- RETOUR ARRIERE : rejouer 054_compte_411_471.sql, puis relancer le meme bloc
--   de recalcul.

CREATE OR REPLACE FUNCTION public.recalculer_ca12_org(p_org_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mois_ref  VARCHAR(7);
  v_mois_date DATE;
  v_ca12      NUMERIC;
  v_ca12_prec NUMERIC;
BEGIN
  SELECT TO_CHAR(MAX(date_emission), 'YYYY-MM')
  INTO   v_mois_ref
  FROM   factures
  WHERE  organisation_id = p_org_id
    AND  est_avoir        = false
    AND  numero_piece     NOT LIKE '411\_%'
    AND  date_emission    IS NOT NULL;

  IF v_mois_ref IS NULL THEN RETURN; END IF;

  v_mois_date := (v_mois_ref || '-01')::date;

  -- Chiffre d'affaires net : les avoirs viennent en deduction, quel que soit
  -- le signe stocke sur montant_ttc. Les 411_ sont exclus, comme au numerateur.
  SELECT COALESCE(SUM(CASE WHEN est_avoir THEN -ABS(montant_ttc)
                           ELSE montant_ttc END), 0)
  INTO   v_ca12
  FROM   factures
  WHERE  organisation_id = p_org_id
    AND  numero_piece     NOT LIKE '411\_%'
    AND  date_emission BETWEEN (v_mois_date - INTERVAL '11 months')
                           AND (v_mois_date + INTERVAL '1 month' - INTERVAL '1 day');

  SELECT COALESCE(SUM(CASE WHEN est_avoir THEN -ABS(montant_ttc)
                           ELSE montant_ttc END), 0)
  INTO   v_ca12_prec
  FROM   factures
  WHERE  organisation_id = p_org_id
    AND  numero_piece     NOT LIKE '411\_%'
    AND  date_emission BETWEEN (v_mois_date - INTERVAL '12 months')
                           AND (v_mois_date - INTERVAL '1 day');

  UPDATE organisations
  SET    ca12_mois      = v_ca12,
         ca12_mois_prec = v_ca12_prec,
         mois_ref       = v_mois_ref
  WHERE  id = p_org_id;
END;
$function$;

-- Recalcul immediat : sans lui, les valeurs stockees resteraient celles
-- d'avant jusqu'au prochain import.
DO $$
DECLARE o RECORD;
BEGIN
  FOR o IN SELECT id FROM organisations LOOP
    PERFORM recalculer_ca12_org(o.id);
  END LOOP;
END
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  CONTROLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Le ca12_mois de SAS MELEZE doit BAISSER (les avoirs sont maintenant deduits).
--
-- SELECT nom, mois_ref,
--        to_char(ca12_mois, 'FM999G999G999D00')      AS ca12_net,
--        to_char(ca12_mois_prec, 'FM999G999G999D00') AS ca12_net_prec
-- FROM organisations
-- ORDER BY ca12_mois DESC;
