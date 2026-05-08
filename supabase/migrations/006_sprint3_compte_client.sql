-- Migration 006 : Sprint 3 — Compte Client
-- Nouveaux champs clients + statut facture + vue agrégée

-- Colonnes métier sur clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS plateforme        text,
  ADD COLUMN IF NOT EXISTS code_groupement   text,
  ADD COLUMN IF NOT EXISTS statut_juridique  text
    CHECK (statut_juridique IN ('sauvegarde', 'liquidation', 'redressement'));

-- Statut qualificatif par facture (litige / provisionné)
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS statut_facture text
    CHECK (statut_facture IN ('litige', 'provisionne'));

-- Mise à jour de la vue v_factures_avec_reste_du : ajout nom_client, montant_ht, statut_facture
CREATE OR REPLACE VIEW v_factures_avec_reste_du AS
SELECT
  f.numero_piece,
  f.code_client,
  f.nom_client,
  f.date_emission,
  f.date_echeance,
  f.montant_ht,
  f.montant_ttc,
  f.est_avoir,
  f.est_provisionnee,
  f.statut_facture,
  f.commentaire,
  COALESCE(SUM(l.montant), 0)                              AS montant_lettre,
  f.montant_ttc - COALESCE(SUM(l.montant), 0)             AS reste_du,
  CASE
    WHEN f.est_avoir                                     THEN 'avoir'
    WHEN COALESCE(SUM(l.montant), 0) = 0                 THEN 'impaye'
    WHEN COALESCE(SUM(l.montant), 0) > f.montant_ttc
         AND f.montant_ttc > 0                           THEN 'sur-lettre'
    WHEN COALESCE(SUM(l.montant), 0) >= f.montant_ttc
         AND f.montant_ttc > 0                           THEN 'paye'
    ELSE 'partiel'
  END AS statut_paiement
FROM factures f
LEFT JOIN lettrages l ON l.numero_facture = f.numero_piece
GROUP BY
  f.numero_piece, f.code_client, f.nom_client, f.date_emission, f.date_echeance,
  f.montant_ht, f.montant_ttc, f.est_avoir, f.est_provisionnee,
  f.statut_facture, f.commentaire;


-- Vue agrégée par client pour l'onglet Compte Client
CREATE OR REPLACE VIEW v_comptes_clients AS
SELECT
  c.code_dso,
  c.nom,
  c.statut,
  c.statut_juridique,
  c.plateforme,
  c.code_groupement,
  c.parent_code_dso,
  COUNT(vf.numero_piece)::int                                                    AS nb_factures_total,
  COUNT(CASE WHEN vf.reste_du > 0.005 AND vf.est_avoir = false THEN 1 END)::int AS nb_impayees,
  COALESCE(
    SUM(CASE WHEN vf.reste_du > 0.005 AND vf.est_avoir = false THEN vf.reste_du ELSE 0 END),
    0
  )::numeric(12,2)                                                               AS encours_total,
  MAX(vf.date_emission)                                                          AS derniere_emission
FROM clients c
LEFT JOIN v_factures_avec_reste_du vf ON vf.code_client = c.code_dso
GROUP BY
  c.code_dso, c.nom, c.statut, c.statut_juridique,
  c.plateforme, c.code_groupement, c.parent_code_dso;
