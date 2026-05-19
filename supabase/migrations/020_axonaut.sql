-- Migration 020 : Intégration Axonaut — colonne axonaut_pdf_url sur factures
-- Objectif : stocker les liens PDF permanents pour les rendre clicables dans les relances

BEGIN;

-- ── 1. Colonne sur factures ───────────────────────────────────────────────────
ALTER TABLE factures ADD COLUMN IF NOT EXISTS axonaut_pdf_url text;

-- ── 2. Recréer v_factures_avec_reste_du pour exposer la nouvelle colonne ─────
DROP VIEW IF EXISTS v_factures_avec_reste_du CASCADE;

CREATE VIEW v_factures_avec_reste_du
WITH (security_invoker = true)
AS
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
  f.organisation_id,
  f.axonaut_pdf_url,
  f.montant_ttc - f.reste_du AS montant_lettre,
  f.reste_du,
  CASE
    WHEN f.est_avoir                                    THEN 'avoir'
    WHEN (f.montant_ttc - f.reste_du) = 0              THEN 'impaye'
    WHEN (f.montant_ttc - f.reste_du) > f.montant_ttc
         AND f.montant_ttc > 0                          THEN 'sur-lettre'
    WHEN (f.montant_ttc - f.reste_du) >= f.montant_ttc
         AND f.montant_ttc > 0                          THEN 'paye'
    ELSE 'partiel'
  END AS statut_paiement
FROM factures f;

-- ── 3. Recréer v_comptes_clients (CASCADE l'a dropée) ────────────────────────
CREATE VIEW v_comptes_clients
WITH (security_invoker = true)
AS
SELECT
  c.code_dso,
  c.nom,
  c.statut_juridique,
  c.commercial,
  c.operateur,
  c.plateforme,
  c.code_groupement,
  c.organisation_id,
  COUNT(f.numero_piece)::int                                                    AS nb_factures_total,
  COUNT(CASE WHEN f.reste_du > 0.005 AND f.est_avoir = false THEN 1 END)::int  AS nb_impayees,
  COALESCE(
    SUM(CASE WHEN f.reste_du > 0.005 AND f.est_avoir = false THEN f.reste_du ELSE 0 END),
    0
  )::numeric(12,2)                                                              AS encours_total,
  MAX(f.date_emission)                                                          AS derniere_emission
FROM clients c
LEFT JOIN factures f ON f.code_client = c.code_dso
                     AND f.organisation_id = c.organisation_id
GROUP BY
  c.code_dso, c.nom, c.statut_juridique, c.commercial, c.operateur,
  c.plateforme, c.code_groupement, c.organisation_id;

COMMIT;
