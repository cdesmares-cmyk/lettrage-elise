-- Phase 2 : Compte Attente 471
-- Colonne booléenne sur lignes_bancaires + vue mise à jour

ALTER TABLE lignes_bancaires
  ADD COLUMN IF NOT EXISTS en_attente_471 BOOLEAN NOT NULL DEFAULT false;

-- Drop nécessaire : CREATE OR REPLACE ne peut pas ajouter de colonne en position arbitraire
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
    WHEN lb.credit IS NULL OR lb.credit = 0                                 THEN 'debit'
    WHEN lb.en_attente_471 = true                                           THEN 'en_attente_471'
    WHEN COALESCE(SUM(l.montant), 0) <= 0                                   THEN 'non_lettre'
    WHEN ABS(COALESCE(lb.credit, 0) - COALESCE(SUM(l.montant), 0)) < 0.01 THEN 'lettre'
    ELSE 'partiel'
  END                                                                        AS statut_lettrage,
  MAX(l.date_lettrage)                                                       AS derniere_date_lettrage,
  lb.organisation_id
FROM lignes_bancaires lb
LEFT JOIN lettrages l
  ON  l.id_ligne_bancaire = lb.id_operation
  AND l.organisation_id   = lb.organisation_id
WHERE lb.organisation_id = get_my_organisation_id()
GROUP BY
  lb.id_operation, lb.date_operation, lb.libelle, lb.detail,
  lb.infos_complementaires, lb.debit, lb.credit,
  lb.code_client_propose, lb.import_id, lb.created_at,
  lb.en_attente_471, lb.organisation_id;
