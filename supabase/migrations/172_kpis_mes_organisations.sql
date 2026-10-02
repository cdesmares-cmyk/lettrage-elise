-- Migration 172 : les indicateurs par structure, pour le portail
--
-- Un appel, une ligne par structure dont l'utilisateur est membre.
--
-- ============================================================================
-- POURQUOI UNE FONCTION, ET PAS UN SIMPLE APPEL
-- ============================================================================
-- Contrairement a ce qu'on pourrait croire, ces chiffres ne sont stockes nulle
-- part. Seul `organisations.ca12_mois` l'est. L'encours, les creances, le
-- nombre de clients et la balance agee sont calcules DANS LE NAVIGATEUR, a
-- partir de la liste complete des factures de la structure active.
--
-- Les afficher pour quatre structures aurait donc voulu dire charger les
-- factures des quatre dans le navigateur — exactement ce qu'on s'interdit.
--
-- Cette fonction fait le calcul la ou il doit se faire : dans la base, qui ne
-- renvoie que des TOTAUX. Aucune ligne comptable ne franchit la frontiere entre
-- deux structures.
--
-- Et aucun calcul nocturne n'est necessaire : agreger quelques dizaines de
-- milliers de lignes par organisation est le metier d'une base de donnees. Si
-- un jour le nombre de structures rend l'appel trop lent, on stockera le
-- resultat — pas avant.
--
-- ============================================================================
-- LES DEFINITIONS SONT CELLES DU TABLEAU DE BORD, AU CARACTERE PRES
-- ============================================================================
-- Un portail qui annoncerait un DSO different de celui affiche dans la
-- structure creerait deux verites. Les regles sont donc recopiees de
-- src/hooks/useDashboard.ts :
--
--   echeance effective : date_echeance, ou date_emission + 15 jours si absente
--   echu               : echeance effective < aujourd'hui
--   retard             : aujourd'hui - echeance effective
--   encours_ttc        : somme des reste_du POSITIFS, facture par facture
--                        (la tuile « Encours total TTC »)
--   creances           : par client, somme des reste_du ; on ne garde que les
--                        clients dont le total est positif. Les avoirs se
--                        compensent donc A L'INTERIEUR d'un client.
--   nb_clients         : nombre de clients a solde positif
--   dso                : creances / ca12_mois * 365, nul si ca12_mois vaut 0
--
-- encours_ttc et creances sont volontairement DIFFERENTS : le premier ignore
-- les avoirs, le second les deduit client par client. Chacun correspond a une
-- tuile precise du tableau de bord ; les confondre donnerait un ecart
-- inexplicable entre les deux ecrans.
--
-- Le seuil de 0,005 euro est celui du front : il ecarte les residus d'arrondi.
--
-- ============================================================================
-- CE QUE LA FONCTION NE PEUT PAS RENVOYER
-- ============================================================================
-- SECURITY DEFINER lui permet de lire au-dela de la structure active, mais son
-- perimetre est fixe par membres_organisations : elle ne voit que les
-- structures dont l'appelant est DECLARE membre. Une structure non declaree
-- n'apparait pas, meme en modifiant l'appel.
--
-- ============================================================================
-- CONTROLE APRES APPLICATION
-- ============================================================================
-- Le seul qui compte : ouvrir une structure dans l'application, noter son DSO
-- et son encours, puis verifier que le portail affiche les memes. Un ecart
-- signifie que les definitions ont diverge, et il faut le traiter avant de
-- diffuser l'ecran.
--
-- ============================================================================
-- RETOUR ARRIERE
-- ============================================================================
--   DROP FUNCTION IF EXISTS kpis_mes_organisations();
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION kpis_mes_organisations()
RETURNS TABLE (
  id              uuid,
  nom             text,
  code_org        text,
  est_active      boolean,
  encours_ttc     numeric,
  creances        numeric,
  nb_clients      integer,
  nb_factures     integer,
  ca12            numeric,
  dso             numeric,
  non_echu        numeric,
  retard_1_30     numeric,
  retard_31_60    numeric,
  retard_61_90    numeric,
  retard_90_plus  numeric
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
         COALESCE(pf.encours_ttc, 0),
         COALESCE(pc.creances,    0),
         COALESCE(pc.nb_clients,  0),
         COALESCE(pf.nb_factures, 0),
         COALESCE(o.ca12_mois,    0),
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
