-- Migration 048 : Fonctions RPC pour les agrégats superadmin (sans limite de 1000 lignes)

-- Agrégat clients par organisation : nb de comptes + encours total
CREATE OR REPLACE FUNCTION superadmin_stats_clients()
RETURNS TABLE (
  organisation_id uuid,
  nb_clients      bigint,
  encours_total   numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    organisation_id,
    COUNT(*)                    AS nb_clients,
    COALESCE(SUM(encours_total), 0) AS encours_total
  FROM v_comptes_clients
  GROUP BY organisation_id
$$;

-- Agrégat relances actives (non brouillon, non archivées) par organisation
CREATE OR REPLACE FUNCTION superadmin_stats_relances()
RETURNS TABLE (
  organisation_id uuid,
  nb_relances     bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    organisation_id,
    COUNT(*) AS nb_relances
  FROM relances
  WHERE archivee = false
    AND statut <> 'brouillon'
  GROUP BY organisation_id
$$;
