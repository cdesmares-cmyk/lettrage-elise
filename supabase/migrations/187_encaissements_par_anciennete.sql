-- Migration 187 : les encaissements, decomposes par anciennete de la facture
--
-- POURQUOI. Le graphique des encaissements dit COMBIEN on encaisse. Il ne dit
-- pas si on encaisse du recent ou du vieux. Or ce sont deux situations tres
-- differentes : 100 k€ encaisses sur des factures non echues, c'est un
-- portefeuille sain ; les memes 100 k€ sur des creances de plus de 90 jours,
-- c'est du recouvrement qui rattrape du retard accumule.
--
-- CE QUE MESURE CETTE FONCTION. Pour chaque euro encaisse, l'anciennete de la
-- facture AU MOMENT DU PAIEMENT :
--
--     retard = date de l'operation bancaire - echeance de la facture payee
--
-- Et non l'anciennete aujourd'hui. Une facture payee avec 100 jours de retard
-- en janvier reste un encaissement « +90j » de janvier, meme consultee en
-- novembre. C'est ce qui rend le graphique comparable d'un mois sur l'autre.
--
-- MEMES TRANCHES QUE LA BALANCE AGEE deja affichee sur ce tableau de bord
-- (computeBalanceAgee dans useDashboard.ts) : Non echu, 1-30j, 31-60j, 61-90j,
-- +90j. Deux graphiques cote a cote qui decouperaient le temps differemment
-- seraient illisibles.
--
-- MEME REGLE D'ECHEANCE, et c'est le point qu'il ne fallait pas rater. Le front
-- utilise echeanceEff() : date_echeance si elle existe, sinon emission + 15
-- jours. Pas le delai de l'organisation, pas celui du client — 15 jours en dur.
-- Cette fonction reproduit exactement cette regle. Si elle utilisait le delai
-- parametre, les deux graphiques classeraient les memes factures dans des
-- tranches differentes, et personne ne comprendrait pourquoi.
--
-- JOINTURE INTERNE SUR factures, et c'est sans perte : la cle etrangere
-- composite lettrages_facture_fk (organisation_id, numero_facture) garantit
-- depuis la migration 054 que tout lettrage reference une facture reelle.
--
-- LE MEME PERIMETRE QUE get_encaissements_clients : lettrages non annules, hors
-- 471. La somme des cinq tranches doit donc egaler sa colonne montant, au
-- centime. C'est le controle a jouer apres execution, et il ne se discute pas :
-- si les deux ne tombent pas juste, un encaissement a disparu quelque part.
--
-- SECURITY DEFINER avec un filtre explicite sur get_my_organisation_id() dans
-- CHAQUE jointure, comme la fonction d'origine. En DEFINER le RLS ne s'applique
-- pas : c'est le WHERE qui tient l'isolation, et l'oublier sur une seule table
-- ferait fuir les encaissements d'une autre organisation.

DROP FUNCTION IF EXISTS get_encaissements_par_anciennete(date);

CREATE FUNCTION get_encaissements_par_anciennete(p_date_debut date)
RETURNS TABLE (
  date_operation date,
  non_echue      numeric,
  j1_30          numeric,
  j31_60         numeric,
  j61_90         numeric,
  j90_plus       numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lignes AS (
    SELECT
      lb.date_operation::date AS jour,
      l.montant::numeric      AS montant,
      -- Reproduction exacte de echeanceEff() cote front : la date d'echeance,
      -- et a defaut l'emission plus quinze jours.
      (lb.date_operation::date
        - COALESCE(f.date_echeance, f.date_emission + 15))::int AS retard
    FROM   lettrages l
    JOIN   lignes_bancaires lb
      ON   lb.id_operation    = l.id_ligne_bancaire
      AND  lb.organisation_id = get_my_organisation_id()
    JOIN   factures f
      ON   f.numero_piece     = l.numero_facture
      AND  f.organisation_id  = l.organisation_id
    WHERE  l.organisation_id  = get_my_organisation_id()
      AND  l.annule           = false
      AND  l.code_client     <> '471'
      AND  lb.date_operation >= p_date_debut
  )
  SELECT
    jour AS date_operation,
    -- COALESCE obligatoire : un FILTER qui ne retient aucune ligne renvoie
    -- NULL, pas zero, et le graphique afficherait un trou au lieu d'une barre.
    COALESCE(SUM(montant) FILTER (WHERE retard <= 0),                      0) AS non_echue,
    COALESCE(SUM(montant) FILTER (WHERE retard BETWEEN 1  AND 30),         0) AS j1_30,
    COALESCE(SUM(montant) FILTER (WHERE retard BETWEEN 31 AND 60),         0) AS j31_60,
    COALESCE(SUM(montant) FILTER (WHERE retard BETWEEN 61 AND 90),         0) AS j61_90,
    COALESCE(SUM(montant) FILTER (WHERE retard > 90),                      0) AS j90_plus
  FROM   lignes
  GROUP  BY jour
  ORDER  BY jour;
$$;

REVOKE ALL ON FUNCTION get_encaissements_par_anciennete(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_encaissements_par_anciennete(date) TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
--  CONTROLES APRES EXECUTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. LE CONTROLE QUI COMPTE : la somme des cinq tranches doit egaler, au
--    centime, la colonne montant de la fonction existante. Un ecart veut dire
--    qu'un encaissement n'a pas trouve sa facture et a disparu du graphique.
--
--    WITH a AS (
--      SELECT SUM(montant) AS total
--      FROM   get_encaissements_clients(current_date - 365)
--    ),
--    b AS (
--      SELECT SUM(non_echue + j1_30 + j31_60 + j61_90 + j90_plus) AS total
--      FROM   get_encaissements_par_anciennete(current_date - 365)
--    )
--    SELECT a.total AS encaissements, b.total AS par_anciennete,
--           ROUND(a.total - b.total, 2) AS ecart
--    FROM a, b;
--    -- attendu : ecart = 0.00
--
--
-- 2. VOIR LA REPARTITION, sur douze mois.
--
--    SELECT ROUND(SUM(non_echue))  AS non_echu,
--           ROUND(SUM(j1_30))      AS j1_30,
--           ROUND(SUM(j31_60))     AS j31_60,
--           ROUND(SUM(j61_90))     AS j61_90,
--           ROUND(SUM(j90_plus))   AS plus_90j
--    FROM   get_encaissements_par_anciennete(current_date - 365);
--
--
-- 3. L'ISOLATION SE VERIFIE PAR LE TEST, jamais par lecture du SQL — une
--    analyse statique a deja donne un faux feu vert sur ce projet. A rejouer
--    avec un compte non-superadmin d'une autre organisation : les totaux
--    doivent differer de ceux ci-dessus.
--
-- RETOUR ARRIERE : DROP FUNCTION get_encaissements_par_anciennete(date);
-- Le graphique cesse de s'afficher, rien d'autre n'en depend.
