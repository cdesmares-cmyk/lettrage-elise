-- Migration 161 : RPC activité recouvrement — données journalières sur 2 ans
-- Remplace la version mensuelle (migration 160) par une agrégation journalière,
-- permettant le filtrage dynamique côté client (7j, 12 sem., 12 mois, trimestres, années).
-- Signature modifiée : p_date_debut date (identique à get_encaissements_clients).

DROP FUNCTION IF EXISTS get_activite_relances(int);

CREATE OR REPLACE FUNCTION get_activite_relances(p_date_debut date)
RETURNS TABLE (date_operation date, nb_relances bigint, montant numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    envoyee_le::date             AS date_operation,
    COUNT(*)                     AS nb_relances,
    SUM(solde_snapshot)::numeric AS montant
  FROM relances
  WHERE organisation_id = get_my_organisation_id()
    AND statut          != 'brouillon'
    AND envoyee_le      IS NOT NULL
    AND envoyee_le::date >= p_date_debut
  GROUP BY envoyee_le::date
  ORDER BY date_operation;
$$;
