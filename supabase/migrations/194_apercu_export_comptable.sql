-- Migration 194 : aperçu exact de l'export comptable, calculé en SQL
--
-- POURQUOI. L'aperçu affiché avant le verrouillage était calculé côté
-- navigateur par quatre requêtes SANS pagination. PostgREST tronque à 1000
-- lignes en silence : l'écran annonçait « 1000 lignes 100% lettrées » dès que
-- la période en comptait davantage.
--
-- Et le compteur n'était pas seul en cause. Le montant était la somme des
-- lignes rapatriées :
--
--     montant: lettrees.reduce((s, l) => s + (l.credit ?? 0), 0)
--
-- donc la somme des MILLE PREMIÈRES lignes. Le montant total lettré affiché
-- était systématiquement sous-estimé, et c'est sur ce chiffre que l'opérateur
-- déclenchait un verrouillage comptable irréversible.
--
-- POURQUOI UNE FONCTION PLUTÔT QUE DE PAGINER CÔTÉ CLIENT. Paginer aurait
-- rapatrié des milliers de lignes dans le navigateur pour n'en garder qu'un
-- compte et une somme. Postgres fait ce travail à sa place, en un aller-retour,
-- et sans plafond à contourner.
--
-- SÉCURITÉ : pas de SECURITY DEFINER. La fonction s'exécute avec les droits de
-- l'appelant, donc la vue — qui porte déjà
-- `WHERE lb.organisation_id = get_my_organisation_id()` — et les politiques RLS
-- de `lettrages` s'appliquent normalement. Un SECURITY DEFINER aurait exigé de
-- réécrire ce filtre à la main, avec le risque de fuite inter-organisations que
-- la migration 162 a déjà corrigé une fois.
--
-- LES COMPTEURS REPRENNENT EXACTEMENT LES CRITÈRES DE L'ANCIEN CODE CLIENT, à
-- la troncature près. Notamment : `nb_lignes` compte des LIGNES BANCAIRES
-- 100% lettrées, là où creer_export_comptable compte ensuite des LIGNES DE
-- LETTRAGE verrouillées — une ligne bancaire pouvant en porter plusieurs. Les
-- deux nombres sont donc différents par nature, et c'est voulu : l'aperçu
-- décrit le périmètre du fichier, l'historique décrit ce qui a été verrouillé.

CREATE OR REPLACE FUNCTION apercu_export_comptable(
  p_date_debut date,
  p_date_fin   date
)
RETURNS json
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(

    -- Lignes bancaires intégralement lettrées : le cœur du périmètre.
    'nb_lignes', (
      SELECT COUNT(*)
      FROM   v_lignes_bancaires_avec_statut
      WHERE  statut_lettrage = 'lettre'
        AND  date_operation BETWEEN p_date_debut AND p_date_fin
    ),

    -- Somme des crédits de ces mêmes lignes. ROUND plutôt qu'un cast en
    -- numeric(12,2) : ce dernier déborde au-delà de 99 999 999,99 € et ferait
    -- échouer l'aperçu sur une grosse période, ce qui serait une panne pire
    -- que le chiffre faux qu'on corrige.
    'montant', (
      SELECT ROUND(COALESCE(SUM(credit), 0), 2)
      FROM   v_lignes_bancaires_avec_statut
      WHERE  statut_lettrage = 'lettre'
        AND  date_operation BETWEEN p_date_debut AND p_date_fin
    ),

    -- Lignes qui resteront hors du fichier faute d'être soldées.
    'nb_non_lettrees', (
      SELECT COUNT(*)
      FROM   v_lignes_bancaires_avec_statut
      WHERE  statut_lettrage IN ('non_lettre', 'partiel')
        AND  date_operation BETWEEN p_date_debut AND p_date_fin
    ),

    -- Compensations avoir/facture encore à verrouiller, comptées par groupe.
    'nb_compensations', (
      SELECT COUNT(DISTINCT compensation_id)
      FROM   lettrages
      WHERE  compensation_id   IS NOT NULL
        AND  id_ligne_bancaire IS NULL
        AND  annule            = false
        AND  export_id         IS NULL
        AND  date_lettrage BETWEEN p_date_debut AND p_date_fin
    ),

    -- Corrections de lettrage encore à verrouiller, comptées par groupe.
    'nb_corrections', (
      SELECT COUNT(DISTINCT correction_id)
      FROM   lettrages
      WHERE  correction_id IS NOT NULL
        AND  mode          = 'correction'
        AND  annule        = false
        AND  export_id     IS NULL
        AND  date_lettrage BETWEEN p_date_debut AND p_date_fin
    )
  );
$$;

COMMENT ON FUNCTION apercu_export_comptable(date, date) IS
  'Aperçu exact du périmètre d''un export comptable, calculé en SQL. Remplace '
  'quatre requêtes client non paginées que PostgREST tronquait à 1000 lignes, '
  'faussant à la fois le nombre de lignes et le montant total affichés avant '
  'un verrouillage irréversible.';

GRANT EXECUTE ON FUNCTION apercu_export_comptable(date, date) TO authenticated;
