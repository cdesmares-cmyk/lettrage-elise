-- Migration 114 : RPC agrégats KPIs lignes bancaires
--
-- Problème : la requête KPI dans useLignesBancaires chargeait toutes les
-- lignes bancaires côté client (select statut_lettrage, restant) pour calculer
-- nb_non_lettres, montant_restant, nb_en_attente_411, nb_lignes_global.
-- Supabase plafonne silencieusement à 1000 lignes → KPIs faux au-delà.
--
-- Fix : fonction SQL qui retourne les agrégats directement en base.
-- SECURITY INVOKER + vue security_invoker = RLS appliqué par organisation.

CREATE OR REPLACE FUNCTION fn_kpis_lignes_bancaires(
  p_date_debut date DEFAULT NULL,
  p_date_fin   date DEFAULT NULL
)
RETURNS TABLE (
  nb_lignes_global  bigint,
  nb_non_lettres    bigint,
  nb_en_attente_411 bigint,
  montant_restant   numeric
)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT
    COUNT(*)        FILTER (WHERE statut_lettrage <> 'debit')
      AS nb_lignes_global,
    COUNT(*)        FILTER (WHERE statut_lettrage IN ('non_lettre', 'partiel'))
      AS nb_non_lettres,
    COUNT(*)        FILTER (WHERE statut_lettrage = 'en_attente_411')
      AS nb_en_attente_411,
    COALESCE(
      SUM(GREATEST(restant, 0)) FILTER (WHERE statut_lettrage NOT IN ('debit', 'en_attente_411')),
      0
    )               AS montant_restant
  FROM v_lignes_bancaires_avec_statut
  WHERE (p_date_debut IS NULL OR date_operation >= p_date_debut)
    AND (p_date_fin   IS NULL OR date_operation <= p_date_fin);
$$;
