-- Migration 196 : le compte 471 reconnu sous ses DEUX valeurs historiques
--
-- LE PROBLÈME. Un même concept comptable — « le crédit est logé en 471, il
-- n'a pas de client en face » — est stocké sous deux valeurs de code_client
-- différentes selon l'écran de saisie :
--
--     Panneau de lettrage, option « 471 - Autres »   ->  code_client = '471'
--     Modale Remises chèque/LCR, option « Autres »   ->  code_client = 'AUTRES'
--     Panneau Dispatch 411, option « Autres »        ->  code_client = 'AUTRES'
--
-- Ce n'est pas une distinction voulue. Dans useLettrageForm, les deux classes
-- sont traitées à l'identique sur TOUTES les lignes — numero_facture à NULL,
-- montant par défaut, commentaire libre — sauf précisément sur celle qui
-- assigne code_client. 'autres' existait, '471' a été ajouté ensuite, et
-- l'appariement a été oublié au seul endroit qui compte.
--
-- CE QUE ÇA CASSE, dans les deux sens :
--
--   Ici, en SQL, on ne teste que '471'. Les lignes 'AUTRES' issues des remises
--   sont donc comptées comme des ENCAISSEMENTS CLIENTS dans le graphique de
--   trésorerie, et ne lèvent pas est_virement_471.
--
--   Côté export, l'onglet Cadrage ne teste que 'AUTRES'. Les lignes '471' du
--   parcours quotidien n'apparaissent jamais dans la colonne « dont Autres
--   (471) » — et pire, elles tombent dans le total lettré client. Un
--   remboursement fournisseur ressemble alors à un encaissement client soldé,
--   ce que le commentaire du code interdit explicitement.
--
-- CE QUE FAIT CETTE MIGRATION : rendre les LECTURES tolérantes aux deux
-- valeurs. Elle ne touche à aucune donnée.
--
-- POURQUOI PAS DE MIGRATION DE DONNÉES, décidé avec Clément le 2026-11-27.
-- Les lettrages déjà verrouillés portent 'AUTRES' dans des fichiers déjà
-- remis à l'expert-comptable, et le ré-téléchargement régénère le fichier
-- depuis la base : normaliser changerait rétroactivement le contenu d'un
-- document comptable transmis. Le gain — un test au lieu de deux — ne le vaut
-- pas.
--
-- LES ÉCRITURES convergeront vers '471' dans un second temps. Cet ordre n'est
-- pas négociable : converger les écritures d'abord ferait disparaître les
-- remises de l'onglet Cadrage, qui ne reconnaît aujourd'hui que 'AUTRES'. On
-- aggraverait le défaut avant de le corriger.
--
-- RETOUR ARRIÈRE : rejouer 107_credit_attente_411_vue.sql et
-- 167_encaissements_hors_clients.sql.

BEGIN;

-- ── 1. La vue : est_virement_471 reconnaît les deux valeurs ────────────────
CREATE OR REPLACE VIEW v_lignes_bancaires_avec_statut
AS
SELECT
  lb.id_operation,
  lb.date_operation,
  lb.libelle,
  lb.detail,
  lb.infos_complementaires,
  lb.debit,
  lb.credit,
  lb.code_client_propose,
  lb.import_id,
  lb.created_at,
  lb.en_attente_411,
  COALESCE(SUM(l.montant), 0)::numeric(12,2)                              AS montant_lettre,
  (COALESCE(lb.credit, 0) - COALESCE(SUM(l.montant), 0))::numeric(12,2)   AS restant,
  CASE
    WHEN lb.credit IS NULL OR lb.credit = 0                               THEN 'debit'
    WHEN lb.en_attente_411 = true                                         THEN 'en_attente_411'
    WHEN COALESCE(SUM(l.montant), 0) <= 0                                 THEN 'non_lettre'
    WHEN ABS(COALESCE(lb.credit, 0) - COALESCE(SUM(l.montant), 0)) < 0.01 THEN 'lettre'
    ELSE 'partiel'
  END                                                                      AS statut_lettrage,
  MAX(l.date_lettrage)                                                     AS derniere_date_lettrage,
  -- SEULE LIGNE MODIFIÉE : 'AUTRES' rejoint '471'.
  (COALESCE(SUM(CASE WHEN l.code_client IN ('471', 'AUTRES') THEN l.montant ELSE 0 END), 0) > 0.005) AS est_virement_471,
  COALESCE(SUM(CASE WHEN l.numero_facture = '411_ATTENTE' THEN l.montant ELSE 0 END), 0)::numeric(12,2) AS credit_attente_411,
  lb.organisation_id
FROM lignes_bancaires lb
LEFT JOIN lettrages l
  ON  l.id_ligne_bancaire = lb.id_operation
  AND l.organisation_id   = lb.organisation_id
  AND l.annule            = false
WHERE lb.organisation_id = get_my_organisation_id()
GROUP BY
  lb.id_operation, lb.date_operation, lb.libelle, lb.detail,
  lb.infos_complementaires, lb.debit, lb.credit,
  lb.code_client_propose, lb.import_id, lb.created_at,
  lb.en_attente_411, lb.organisation_id;

-- CREATE OR REPLACE VIEW ne reconduit pas les options : on la repose.
ALTER VIEW v_lignes_bancaires_avec_statut SET (security_invoker = true);

-- ── 2. Le graphique des encaissements ──────────────────────────────────────
-- Corps identique à la migration 167, aux deux tests de code_client près.
CREATE OR REPLACE FUNCTION get_encaissements_clients(p_date_debut date)
RETURNS TABLE (date_operation date, montant numeric, montant_autres numeric)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH clients AS (
    SELECT
      lb.date_operation::date AS jour,
      SUM(l.montant)::numeric AS montant
    FROM lettrages l
    JOIN lignes_bancaires lb
      ON lb.id_operation     = l.id_ligne_bancaire
      AND lb.organisation_id = get_my_organisation_id()
    WHERE l.organisation_id = get_my_organisation_id()
      AND l.annule           = false
      AND l.code_client NOT IN ('471', 'AUTRES')
      AND lb.date_operation >= p_date_debut
    GROUP BY lb.date_operation::date
  ),
  hors_clients AS (
    SELECT
      jour,
      SUM(GREATEST(credit - lettre_client, 0))::numeric AS montant
    FROM (
      SELECT
        lb.date_operation::date AS jour,
        COALESCE(lb.credit, 0)  AS credit,
        COALESCE(SUM(l.montant) FILTER (WHERE l.code_client NOT IN ('471', 'AUTRES')), 0) AS lettre_client
      FROM lignes_bancaires lb
      LEFT JOIN lettrages l
        ON  l.id_ligne_bancaire = lb.id_operation
        AND l.organisation_id   = lb.organisation_id
        AND l.annule            = false
      WHERE lb.organisation_id = get_my_organisation_id()
        AND lb.date_operation >= p_date_debut
        AND COALESCE(lb.credit, 0) > 0
      GROUP BY lb.id_operation, lb.date_operation, lb.credit
    ) par_ligne
    GROUP BY jour
  )
  SELECT
    COALESCE(c.jour, h.jour)   AS date_operation,
    COALESCE(c.montant, 0)     AS montant,
    COALESCE(h.montant, 0)     AS montant_autres
  FROM clients c
  FULL OUTER JOIN hors_clients h ON h.jour = c.jour
  ORDER BY 1;
$$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
--  CONTRÔLE
-- ═══════════════════════════════════════════════════════════════════════════
-- Combien de lignes portent chaque valeur ? Si la seconde est à zéro, cette
-- migration n'a aucun effet observable et c'est une bonne nouvelle.
--
--   SELECT code_client, COUNT(*), SUM(montant)
--   FROM   lettrages
--   WHERE  code_client IN ('471', 'AUTRES') AND annule = false
--   GROUP  BY code_client;
--
-- Dans le graphique de trésorerie, le montant « clients » doit BAISSER du
-- total des lignes 'AUTRES', et « hors clients » augmenter d'autant. Si les
-- deux ne se compensent pas au centime, quelque chose a échappé.
