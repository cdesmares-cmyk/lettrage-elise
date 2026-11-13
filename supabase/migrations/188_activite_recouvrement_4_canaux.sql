-- Migration 188 : l'activite de recouvrement, sur ses quatre canaux
--
-- POURQUOI. Le graphique « Activite recouvrement » ne compte que les relances
-- MANUELLES. Ni les envois du robot, ni les appels et mails traces hors Ockham
-- depuis les migrations 182 a 186. Il affiche donc une fraction du travail
-- reellement fourni, et c'est la fraction la moins representative : celle qui
-- passe par un seul des quatre canaux.
--
-- QUATRE CANAUX, UNE LIGNE PAR DATE, OPERATEUR ET CANAL :
--   manuel  relances envoyees depuis Ockham par un operateur
--   auto    envois du robot
--   appel   appels traces hors Ockham
--   mail    mails partis d'une boite personnelle, traces hors Ockham
--
-- POURQUOI UNE NOUVELLE FONCTION plutot qu'une modification de
-- get_activite_relances. Changer la forme de retour de l'existante casserait
-- le graphique actuel entre l'execution de cette migration et le deploiement
-- du front. Avec deux fonctions, il n'y a AUCUNE fenetre de casse, et le
-- retour arriere consiste a ne rien faire. L'ancienne sera supprimee plus
-- tard, une fois celle-ci en service.
--
-- LE PIEGE PRINCIPAL : COMPTER LES ENVOIS AUTO, PAS LES LIGNES.
-- relances_auto_log porte UNE LIGNE PAR FACTURE. Un envoi couvrant douze
-- factures y laisse douze lignes. Les compter gonflerait la barre Auto d'un
-- facteur dix ou plus, et le graphique mentirait de facon spectaculaire. Le
-- regroupement se fait donc sur resend_id, qui identifie l'email, avec un repli
-- sur code_client + date quand il est absent. Meme regle que les migrations
-- 181 et 187.
--
-- ET montant_total EST RECOPIE A L'IDENTIQUE sur chaque ligne de l'envoi :
-- MAX() le lit une fois. Le SOMMER le multiplierait par le nombre de factures.
--
-- LE PERIMETRE DE « manuel » EST STRICTEMENT CELUI DE L'ANCIENNE FONCTION,
-- clause WHERE comprise. La barre Manuel doit afficher exactement ce qu'elle
-- affiche aujourd'hui : si elle bougeait, on ne saurait plus si c'est
-- l'ajout des canaux ou un changement de regle qui a modifie le graphique.
--
-- LE ROBOT N'A PAS D'OPERATEUR, et c'est voulu : relances_auto_log ne porte
-- aucun identifiant d'utilisateur, parce que personne n'a declenche ces envois.
-- operateur_id vaut donc NULL sur ces lignes. Consequence a l'ecran : filtrer
-- sur une personne fait disparaitre la barre Auto. Le front propose une entree
-- « Relance Auto » dans le menu des operateurs pour l'isoler.
--
-- LES MONTANTS. manuel et auto en portent un, appel et mail non : un appel
-- telephonique ne porte aucun perimetre de factures. La courbe de montants
-- superposee aux barres additionne donc manuel + auto, et sa valeur VA MONTER
-- par rapport a aujourd'hui, ou elle ne comptait que le manuel. Arrete avec
-- Clement le 2026-11-13 : une courbe qui annonce « euros relances » en en
-- oubliant la moitie ne vaut pas mieux qu'une courbe absente.
--
-- SECURITY DEFINER avec un filtre explicite sur get_my_organisation_id() dans
-- CHACUNE des trois branches. En DEFINER le RLS ne s'applique pas : c'est le
-- WHERE qui tient l'isolation, et l'oublier sur une seule branche ferait fuir
-- l'activite d'une autre organisation.

DROP FUNCTION IF EXISTS get_activite_recouvrement(date);

CREATE FUNCTION get_activite_recouvrement(p_date_debut date)
RETURNS TABLE (
  date_operation date,
  operateur_id   uuid,
  canal          text,
  nb             bigint,
  montant        numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- ── 1. Relances manuelles ────────────────────────────────────────────────
  SELECT
    r.envoyee_le::date                      AS date_operation,
    r.operateur_id,
    'manuel'::text                          AS canal,
    COUNT(*)                                AS nb,
    COALESCE(SUM(r.solde_snapshot), 0)::numeric AS montant
  FROM   relances r
  WHERE  r.organisation_id   = get_my_organisation_id()
    AND  r.statut           <> 'brouillon'
    AND  r.envoyee_le       IS NOT NULL
    AND  r.envoyee_le::date >= p_date_debut
  GROUP  BY 1, 2

  UNION ALL

  -- ── 2. Envois du robot, comptes PAR ENVOI ────────────────────────────────
  SELECT
    envois.jour         AS date_operation,
    NULL::uuid          AS operateur_id,
    'auto'::text        AS canal,
    COUNT(*)            AS nb,
    COALESCE(SUM(envois.montant), 0)::numeric AS montant
  FROM (
    SELECT
      MIN(l.envoye_le::date) AS jour,
      -- MAX et non SUM : montant_total est recopie a l'identique sur chaque
      -- ligne de l'envoi. Le sommer le multiplierait par le nombre de factures.
      MAX(l.montant_total)   AS montant
    FROM   relances_auto_log l
    WHERE  l.organisation_id   = get_my_organisation_id()
      -- statut = 'envoye' seulement : un rebond veut dire que le client n'a
      -- rien recu, ce n'est pas une action de recouvrement aboutie.
      AND  l.statut            = 'envoye'
      AND  l.envoye_le::date  >= p_date_debut
    GROUP  BY COALESCE(l.resend_id, l.code_client || '|' || l.envoye_le::text)
  ) envois
  GROUP  BY envois.jour

  UNION ALL

  -- ── 3. Appels et mails traces hors Ockham ────────────────────────────────
  SELECT
    e.echange_le   AS date_operation,
    e.cree_par     AS operateur_id,
    e.canal,
    COUNT(*)       AS nb,
    -- Un appel ne porte aucun perimetre de factures : pas de montant.
    0::numeric     AS montant
  FROM   echanges_clients e
  WHERE  e.organisation_id = get_my_organisation_id()
    -- Un echange supprime par un operateur ne compte plus, comme partout
    -- ailleurs depuis la migration 186.
    AND  e.archivee        = false
    AND  e.echange_le     >= p_date_debut
  GROUP  BY 1, 2, 3

  ORDER  BY 1, 3, 2;
$$;

REVOKE ALL ON FUNCTION get_activite_recouvrement(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_activite_recouvrement(date) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
--  CONTROLES APRES EXECUTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. LE CONTROLE QUI COMPTE : la barre Manuel ne doit pas bouger d'une unite.
--    Les deux fonctions doivent renvoyer exactement le meme compte.
--
--    WITH ancienne AS (
--      SELECT SUM(nb_relances) AS n FROM get_activite_relances(current_date - 365)
--    ),
--    nouvelle AS (
--      SELECT SUM(nb) AS n FROM get_activite_recouvrement(current_date - 365)
--      WHERE canal = 'manuel'
--    )
--    SELECT a.n AS avant, b.n AS apres, a.n - b.n AS ecart
--    FROM ancienne a, nouvelle b;
--    -- attendu : ecart = 0
--
--
-- 2. LA REPARTITION PAR CANAL, sur douze mois.
--
--    SELECT canal, SUM(nb) AS actions, ROUND(SUM(montant)) AS euros
--    FROM   get_activite_recouvrement(current_date - 365)
--    GROUP  BY canal
--    ORDER  BY actions DESC;
--
--
-- 3. LE PIEGE DU COMPTAGE AUTO. Le nombre d'envois doit etre tres inferieur
--    au nombre de lignes du journal. S'ils sont egaux, le regroupement par
--    resend_id n'a pas fonctionne et la barre Auto est fausse.
--
--    SELECT COUNT(*)                                             AS lignes_journal,
--           COUNT(DISTINCT COALESCE(resend_id, code_client || '|' || envoye_le::text)) AS envois
--    FROM   relances_auto_log
--    WHERE  statut = 'envoye' AND envoye_le::date >= current_date - 365;
--
--
-- 4. L'ISOLATION SE VERIFIE PAR LE TEST, jamais par lecture du SQL. A rejouer
--    avec un compte non-superadmin d'une autre organisation : les totaux
--    doivent differer.
--
-- RETOUR ARRIERE : DROP FUNCTION get_activite_recouvrement(date);
-- get_activite_relances reste en place et le graphique actuel continue de
-- fonctionner tant que le front n'est pas deploye.
