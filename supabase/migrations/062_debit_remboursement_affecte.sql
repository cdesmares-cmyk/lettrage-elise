-- Migration 062 : Débit affecté à un remboursement → statut lettre dans la vue
-- 1. Correction de la détection débit (colonne debit explicite OU credit absent/négatif)
-- 2. Un débit lié à un remboursement effectué prend le statut 'lettre'
--    → visible dans le filtre Lettrées, absent du filtre Toutes (non_lettre/partiel)

DROP VIEW IF EXISTS v_lignes_bancaires_avec_statut;

CREATE VIEW v_lignes_bancaires_avec_statut
WITH (security_invoker = true)
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
  lb.en_attente_471,
  COALESCE(SUM(l.montant), 0)::numeric(12,2)                                AS montant_lettre,
  (COALESCE(lb.credit, 0) - COALESCE(SUM(l.montant), 0))::numeric(12,2)   AS restant,
  CASE
    WHEN ((lb.debit IS NOT NULL AND lb.debit > 0) OR (lb.credit IS NULL OR lb.credit <= 0))
      AND COUNT(remb.id) > 0                                                THEN 'lettre'
    WHEN (lb.debit IS NOT NULL AND lb.debit > 0) OR (lb.credit IS NULL OR lb.credit <= 0)
                                                                            THEN 'debit'
    WHEN lb.en_attente_471 = true                                           THEN 'en_attente_471'
    WHEN COALESCE(SUM(l.montant), 0) <= 0                                   THEN 'non_lettre'
    WHEN ABS(COALESCE(lb.credit, 0) - COALESCE(SUM(l.montant), 0)) < 0.01 THEN 'lettre'
    ELSE 'partiel'
  END                                                                        AS statut_lettrage,
  MAX(l.date_lettrage)                                                       AS derniere_date_lettrage,
  (COALESCE(SUM(CASE WHEN l.code_client = '471' THEN l.montant ELSE 0 END), 0) > 0.005) AS est_virement_471,
  lb.organisation_id
FROM lignes_bancaires lb
LEFT JOIN lettrages l
  ON  l.id_ligne_bancaire = lb.id_operation
  AND l.organisation_id   = lb.organisation_id
  AND l.annule            = false
LEFT JOIN remboursements remb
  ON  remb.id_ligne_bancaire = lb.id_operation
  AND remb.organisation_id   = lb.organisation_id
  AND remb.statut            = 'effectue'
WHERE lb.organisation_id = get_my_organisation_id()
GROUP BY
  lb.id_operation, lb.date_operation, lb.libelle, lb.detail,
  lb.infos_complementaires, lb.debit, lb.credit,
  lb.code_client_propose, lb.import_id, lb.created_at,
  lb.en_attente_471, lb.organisation_id;
