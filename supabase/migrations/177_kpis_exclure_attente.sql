-- Migration 177 : exclure les ecritures d'attente des indicateurs du portail
--
-- ============================================================================
-- DEUX VERITES, CONSTATEES SUR SAS TBZ
-- ============================================================================
-- Le portail annoncait 2 659 factures echues et 1 193 clients concernes, la
-- ou le tableau de bord de la structure en affichait 2 653 et 1 191.
--
-- L'ecart, exactement six lignes, vient des pieces nommees '411_ATTENTE'. Ce
-- sont des ecritures d'attente comptables — un encaissement non affecte — pas
-- des factures client. L'application les exclut explicitement a son chargement,
-- aux deux endroits ou elle lit les factures :
--
--   .neq('numero_piece', '411_ATTENTE')
--
-- kpis_mes_organisations() ne le faisait pas. Elle comptait donc six lignes que
-- le produit ne compte nulle part ailleurs, et gonflait au passage l'encours et
-- la tranche +90j de quelques centaines d'euros.
--
-- Ces six lignes sont aussi les seules sans date d'echeance de la structure,
-- ce qui confirme leur nature : une ecriture d'attente n'a pas d'echeance.
--
-- ============================================================================
-- CE QUE CA CHANGE
-- ============================================================================
-- Les quatre tuiles du portail et sa balance agee deviennent strictement
-- identiques a celles de la structure ouverte. C'est la seule facon d'eviter
-- deux verites : un portail qui annonce autre chose que la structure finit par
-- ne plus etre cru, et c'est l'ecran qu'on perd.
--
-- Le DSO n'etait PAS affecte : son numerateur passe par les soldes par client,
-- et les lignes d'attente s'y compensaient. Il affichait 115,9 jours des deux
-- cotes avant ce correctif.
--
-- ============================================================================
-- CONTROLE APRES APPLICATION
-- ============================================================================
-- Rouvrir le portail et comparer a la structure. Sur SAS TBZ, attendu :
--   factures impayees echues  2 653   (et non 2 659)
--   clients avec impayes echus 1 191  (et non 1 193)
--
-- ============================================================================
-- RETOUR ARRIERE
-- ============================================================================
--   -- rejouer la migration 174
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION kpis_mes_organisations()
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
      -- Ecriture d'attente comptable, pas une facture client. Exclue par
      -- l'application a son chargement : la garder ici ferait dire au portail
      -- autre chose qu'a la structure.
      AND f.numero_piece <> '411_ATTENTE'
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
