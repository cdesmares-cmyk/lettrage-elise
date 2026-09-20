-- Migration 160 : RPC activité recouvrement agrégée par mois
-- Agrège les relances envoyées sur les N derniers mois glissants.
-- Utilise solde_snapshot (colonne numérique) — aucune jointure, aucun parsing JSONB.

CREATE OR REPLACE FUNCTION get_activite_relances(p_nb_mois int DEFAULT 6)
RETURNS TABLE (
  mois        date,
  nb_relances bigint,
  nb_clients  bigint,
  montant     numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    date_trunc('month', envoyee_le)::date  AS mois,
    COUNT(*)                               AS nb_relances,
    COUNT(DISTINCT code_client)            AS nb_clients,
    SUM(solde_snapshot)::numeric           AS montant
  FROM relances
  WHERE organisation_id = get_my_organisation_id()
    AND statut          != 'brouillon'
    AND envoyee_le      IS NOT NULL
    AND envoyee_le      >= date_trunc('month', now())
                          - ((p_nb_mois - 1) || ' months')::interval
  GROUP BY date_trunc('month', envoyee_le)::date
  ORDER BY mois;
$$;
