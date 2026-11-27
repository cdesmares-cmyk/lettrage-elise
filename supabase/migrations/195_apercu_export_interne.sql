-- Migration 195 : aperçu du périmètre de l'export interne (3 onglets)
--
-- POURQUOI. L'onglet Interne partait sans rien annoncer : on cliquait, et on
-- découvrait le contenu en ouvrant le fichier. L'onglet Comptable, lui, montre
-- son périmètre avant d'agir. Avant une bascule et des remises régulières à un
-- expert-comptable, il faut pouvoir recompter le fichier reçu contre ce que
-- l'outil annonçait.
--
-- CES COMPTEURS REPRODUISENT EXACTEMENT CE QUE CONSTRUIT exportLettrageXls, y
-- compris ses bizarreries. Un aperçu qui « corrigerait » en silence la logique
-- du fichier créerait l'incohérence qu'il est censé supprimer.
--
--   nb_lignes_bancaires  la feuille « Lignes bancaires » : toutes les lignes
--                        de la période, débits compris.
--
--   nb_affectations      la feuille « Affectation », qui empile quatre
--                        sources :
--                          1. les lettrages des lignes NON DÉBIT de la période
--                          2. les compensations internes
--                          3. les imports historiques
--                          4. les corrections de lettrage
--
-- SUR LE RECOUVREMENT ENTRE LA SOURCE 1 ET LA SOURCE 4. La source 1 ne filtre
-- pas sur `mode`, donc elle attraperait les corrections si celles-ci portaient
-- l'identifiant d'une vraie ligne. Elles ne le portent pas : une correction
-- liée à une ligne reçoit `id_ligne_bancaire = <id_operation> || '-C'`, un
-- identifiant qui n'existe pas dans lignes_bancaires (c'est d'ailleurs la
-- raison pour laquelle la clé étrangère a disparu). Les deux ensembles sont
-- donc disjoints, et la somme ne double compte pas. Vérifié avant d'écrire
-- cette fonction, parce qu'un double comptage dans un fichier comptable ne se
-- voit qu'une fois chez l'expert-comptable.
--
-- SÉCURITÉ : pas de SECURITY DEFINER, comme la migration 194. La vue porte son
-- propre filtre d'organisation et les politiques RLS de `lettrages`
-- s'appliquent aux droits de l'appelant.

CREATE OR REPLACE FUNCTION apercu_export_interne(
  p_date_debut date,
  p_date_fin   date
)
RETURNS json
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH lignes AS (
    SELECT id_operation, credit, montant_lettre, statut_lettrage
    FROM   v_lignes_bancaires_avec_statut
    WHERE  date_operation BETWEEN p_date_debut AND p_date_fin
  ),
  -- Les lignes susceptibles de porter des lettrages : exactement le filtre
  -- `statut_lettrage !== 'debit'` appliqué côté client.
  lignes_credit AS (
    SELECT id_operation FROM lignes WHERE statut_lettrage <> 'debit'
  )
  SELECT json_build_object(

    -- Feuille « Lignes bancaires ».
    'nb_lignes_bancaires', (SELECT COUNT(*) FROM lignes),

    'nb_lettrees',     (SELECT COUNT(*) FROM lignes WHERE statut_lettrage = 'lettre'),
    'nb_non_lettrees', (SELECT COUNT(*) FROM lignes WHERE statut_lettrage IN ('non_lettre', 'partiel')),

    'montant_credit', (SELECT ROUND(COALESCE(SUM(credit), 0), 2) FROM lignes),
    'montant_lettre', (SELECT ROUND(COALESCE(SUM(montant_lettre), 0), 2) FROM lignes),

    -- Feuille « Affectation », les quatre sources additionnées.
    'nb_affectations', (
        (SELECT COUNT(*) FROM lettrages
          WHERE annule = false
            AND id_ligne_bancaire IN (SELECT id_operation FROM lignes_credit))
      + (SELECT COUNT(*) FROM lettrages
          WHERE id_ligne_bancaire IS NULL
            AND compensation_id IS NOT NULL
            AND annule = false
            AND date_lettrage BETWEEN p_date_debut AND p_date_fin)
      + (SELECT COUNT(*) FROM lettrages
          WHERE id_ligne_bancaire IS NULL
            AND mode = 'import'
            AND annule = false
            AND date_lettrage BETWEEN p_date_debut AND p_date_fin)
      + (SELECT COUNT(*) FROM lettrages
          WHERE mode = 'correction'
            AND annule = false
            AND date_lettrage BETWEEN p_date_debut AND p_date_fin)
    )
  );
$$;

COMMENT ON FUNCTION apercu_export_interne(date, date) IS
  'Périmètre de l''export interne 3 onglets, calculé en SQL. Les compteurs '
  'reproduisent exactement ce que construit exportLettrageXls, de façon à ce '
  'que le fichier remis puisse être recompté contre ce que l''écran annonçait.';

GRANT EXECUTE ON FUNCTION apercu_export_interne(date, date) TO authenticated;
