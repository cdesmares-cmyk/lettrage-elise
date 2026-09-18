-- Migration 153 : RPC encaissements clients agrégés par jour
-- Remplace la lecture brute de lignes_bancaires (limitée à 20 000 lignes)
-- par une agrégation SQL côté serveur.
-- Périmètre : lettrages non annulés, hors 471, joints à la date bancaire réelle.

CREATE OR REPLACE FUNCTION get_encaissements_clients(p_date_debut date)
RETURNS TABLE (date_operation date, montant numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lb.date_operation::date          AS date_operation,
    SUM(l.montant)::numeric          AS montant
  FROM lettrages l
  JOIN lignes_bancaires lb
    ON lb.id_operation     = l.id_ligne_bancaire
    AND lb.organisation_id = get_my_organisation_id()
  WHERE l.organisation_id = get_my_organisation_id()
    AND l.annule           = false
    AND l.code_client     != '471'
    AND lb.date_operation >= p_date_debut
  GROUP BY lb.date_operation::date
  ORDER BY lb.date_operation::date;
$$;
