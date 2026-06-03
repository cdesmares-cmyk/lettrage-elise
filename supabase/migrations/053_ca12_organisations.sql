-- CA12 persisté sur la table organisations
-- Mis à jour à chaque import de factures via recalculer_ca12_org()
-- Le frontend lit ces valeurs au chargement — aucun calcul JS ni RPC coûteux

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS ca12_mois      NUMERIC    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ca12_mois_prec NUMERIC    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mois_ref       VARCHAR(7) NOT NULL DEFAULT '';

-- Fonction de recalcul : appelée à la fin de chaque import de factures
CREATE OR REPLACE FUNCTION recalculer_ca12_org(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mois_ref  VARCHAR(7);
  v_mois_date DATE;
  v_ca12      NUMERIC;
  v_ca12_prec NUMERIC;
BEGIN
  -- moisMax = mois de la facture non-avoir non-compte la plus récente
  SELECT TO_CHAR(MAX(date_emission), 'YYYY-MM')
  INTO   v_mois_ref
  FROM   factures
  WHERE  organisation_id = p_org_id
    AND  est_avoir        = false
    AND  numero_piece     NOT LIKE '%\_compte'
    AND  date_emission    IS NOT NULL;

  IF v_mois_ref IS NULL THEN RETURN; END IF;

  v_mois_date := (v_mois_ref || '-01')::date;

  -- CA 12 mois courants : fenêtre se terminant fin de moisMax
  SELECT COALESCE(SUM(montant_ttc), 0)
  INTO   v_ca12
  FROM   factures
  WHERE  organisation_id = p_org_id
    AND  est_avoir        = false
    AND  date_emission BETWEEN (v_mois_date - INTERVAL '11 months')
                           AND (v_mois_date + INTERVAL '1 month' - INTERVAL '1 day');

  -- CA 12 mois précédents : fenêtre décalée d'un mois
  SELECT COALESCE(SUM(montant_ttc), 0)
  INTO   v_ca12_prec
  FROM   factures
  WHERE  organisation_id = p_org_id
    AND  est_avoir        = false
    AND  date_emission BETWEEN (v_mois_date - INTERVAL '12 months')
                           AND (v_mois_date - INTERVAL '1 day');

  UPDATE organisations
  SET    ca12_mois      = v_ca12,
         ca12_mois_prec = v_ca12_prec,
         mois_ref       = v_mois_ref
  WHERE  id = p_org_id;
END;
$$;

-- Backfill initial pour les organisations existantes
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM organisations LOOP
    PERFORM recalculer_ca12_org(r.id);
  END LOOP;
END;
$$;
