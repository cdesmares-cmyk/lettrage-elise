-- Migration 174 : ajouter les impayes echus aux indicateurs du portail
--
-- Le portail affiche desormais la MEME rangee de tuiles que le tableau de bord
-- d'une structure : DSO roulant, factures impayees echues, clients avec
-- impayes echus, encours total TTC. Il manquait les deux compteurs d'echu.
--
-- Le type de retour change, donc DROP puis CREATE : CREATE OR REPLACE ne sait
-- pas modifier la signature d'une fonction.
--
-- ============================================================================
-- DEFINITIONS, RECOPIEES DE useDashboard.ts
-- ============================================================================
--   impayees echues    : reste_du > 0,005 ET echeance effective < aujourd'hui
--   nb_factures_echues : leur nombre            (tuile « Factures impayees echues »)
--   nb_clients_echus   : leurs clients distincts (tuile « Clients avec impayes echus »)
--
-- Rappel des autres, inchangees :
--   echeance effective : date_echeance, ou date_emission + 15 jours si absente
--   encours_ttc        : somme des reste_du POSITIFS, facture par facture
--   creances           : par client, somme des reste_du ; seuls les clients a
--                        solde positif sont retenus — numerateur du DSO
--   dso                : creances / ca12_mois * 365, nul si ca12_mois vaut 0
--
-- ============================================================================
-- CONTROLE APRES APPLICATION
-- ============================================================================
-- Ouvrir une structure dans l'application, noter les quatre tuiles du haut,
-- puis verifier que le portail affiche les memes quatre chiffres. Un ecart
-- signifie que les definitions ont diverge.
--
-- ============================================================================
-- RETOUR ARRIERE
-- ============================================================================
--   DROP FUNCTION IF EXISTS kpis_mes_organisations();
--   -- puis rejouer la migration 172
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS kpis_mes_organisations();

CREATE FUNCTION kpis_mes_organisations()
RETURNS TABLE (
  id                 uuid,
  nom                text,
  code_org           text,
  est_active         boolean,
  encours_ttc        numeric,
  creances           numeric,
  nb_clients         integer,
  nb_factures        integer,
  nb_factures_echues integer,
  nb_clients_echus   integer,
  ca12               numeric,
  dso                numeric,
  non_echu           numeric,
  retard_1_30        numeric,
  retard_31_60       numeric,
  retard_61_90       numeric,
  retard_90_plus     numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH mes_orgs AS (
    SELECT m.organisation_id AS oid
    FROM membres_organisations m
    WHERE m.utilisateur_id = auth.uid()
  ),
  lignes AS (
    SELECT f.organisation_id AS oid,
           f.code_client,
           f.reste_du,
           COALESCE(f.date_echeance::date,
                    (f.date_emission::date + 15))         AS echeance
    FROM v_factures_avec_reste_du f
    JOIN mes_orgs mo ON mo.oid = f.organisation_id
    WHERE abs(f.reste_du) > 0.005
  ),
  soldes AS (
    SELECT oid, code_client, SUM(reste_du) AS solde
    FROM lignes
    GROUP BY oid, code_client
  ),
  par_client AS (
    SELECT oid,
           SUM(solde)        AS creances,
           COUNT(*)::integer AS nb_clients
    FROM soldes
    WHERE solde > 0.005
    GROUP BY oid
  ),
  par_facture AS (
    SELECT oid,
           COUNT(*)::integer                                                  AS nb_factures,
           COUNT(*) FILTER (WHERE echeance < current_date)::integer           AS nb_factures_echues,
           COUNT(DISTINCT code_client)
             FILTER (WHERE echeance < current_date)::integer                  AS nb_clients_echus,
           SUM(reste_du)                                                      AS encours_ttc,
           SUM(reste_du) FILTER (WHERE echeance >= current_date)              AS non_echu,
           SUM(reste_du) FILTER (WHERE echeance <  current_date
                                   AND current_date - echeance <=  30)        AS r_1_30,
           SUM(reste_du) FILTER (WHERE current_date - echeance >   30
                                   AND current_date - echeance <=  60)        AS r_31_60,
           SUM(reste_du) FILTER (WHERE current_date - echeance >   60
                                   AND current_date - echeance <=  90)        AS r_61_90,
           SUM(reste_du) FILTER (WHERE current_date - echeance >   90)        AS r_90_plus
    FROM lignes
    WHERE reste_du > 0.005
    GROUP BY oid
  )
  SELECT o.id,
         o.nom::text,
         o.code_org::text,
         o.id = COALESCE(u.organisation_active_id, u.organisation_id),
         COALESCE(pf.encours_ttc,        0),
         COALESCE(pc.creances,           0),
         COALESCE(pc.nb_clients,         0),
         COALESCE(pf.nb_factures,        0),
         COALESCE(pf.nb_factures_echues, 0),
         COALESCE(pf.nb_clients_echus,   0),
         COALESCE(o.ca12_mois,           0),
         CASE WHEN COALESCE(o.ca12_mois, 0) > 0
              THEN COALESCE(pc.creances, 0) / o.ca12_mois * 365
              ELSE NULL END,
         COALESCE(pf.non_echu,  0),
         COALESCE(pf.r_1_30,    0),
         COALESCE(pf.r_31_60,   0),
         COALESCE(pf.r_61_90,   0),
         COALESCE(pf.r_90_plus, 0)
  FROM mes_orgs mo
  JOIN organisations o ON o.id = mo.oid
  JOIN utilisateurs  u ON u.id = auth.uid()
  LEFT JOIN par_client  pc ON pc.oid = o.id
  LEFT JOIN par_facture pf ON pf.oid = o.id
  ORDER BY o.nom
$$;

REVOKE ALL     ON FUNCTION kpis_mes_organisations() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION kpis_mes_organisations() TO authenticated;

COMMIT;

-- La signature a change : l'API doit relire son schema pour exposer les
-- nouvelles colonnes.
NOTIFY pgrst, 'reload schema';
