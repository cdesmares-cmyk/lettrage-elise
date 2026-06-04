-- Phase 1 : renommage _compte → 411_CLIENTCODE
-- Toutes les pseudo-factures "compte client" adoptent le préfixe 411_ (norme comptable)
-- Migration atomique : factures + lettrages + fonctions SQL

BEGIN;

-- Renommage dans factures
UPDATE factures
SET numero_piece = '411_' || SUBSTRING(numero_piece, 1, LENGTH(numero_piece) - 7)
WHERE numero_piece LIKE '%\_compte';

-- Renommage dans lettrages (colonne numero_facture référence factures.numero_piece)
UPDATE lettrages
SET numero_facture = '411_' || SUBSTRING(numero_facture, 1, LENGTH(numero_facture) - 7)
WHERE numero_facture LIKE '%\_compte';

-- Mise à jour recalculer_ca12_org : exclut désormais les 411_ au lieu des _compte
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
  SELECT TO_CHAR(MAX(date_emission), 'YYYY-MM')
  INTO   v_mois_ref
  FROM   factures
  WHERE  organisation_id = p_org_id
    AND  est_avoir        = false
    AND  numero_piece     NOT LIKE '411\_%'
    AND  date_emission    IS NOT NULL;

  IF v_mois_ref IS NULL THEN RETURN; END IF;

  v_mois_date := (v_mois_ref || '-01')::date;

  SELECT COALESCE(SUM(montant_ttc), 0)
  INTO   v_ca12
  FROM   factures
  WHERE  organisation_id = p_org_id
    AND  est_avoir        = false
    AND  date_emission BETWEEN (v_mois_date - INTERVAL '11 months')
                           AND (v_mois_date + INTERVAL '1 month' - INTERVAL '1 day');

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

-- Mise à jour get_ca_periode : même filtre 411_
CREATE OR REPLACE FUNCTION get_ca_periode(p_debut date, p_fin date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(montant_ttc), 0)
  FROM factures
  WHERE organisation_id = get_my_organisation_id()
    AND date_emission BETWEEN p_debut AND p_fin
    AND est_avoir = false
    AND numero_piece NOT LIKE '411\_%'
$$;

COMMIT;
