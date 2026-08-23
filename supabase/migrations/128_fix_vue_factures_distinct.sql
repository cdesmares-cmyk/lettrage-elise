-- Migration 128 : déduplication de v_factures_avec_reste_du
-- Problème : plusieurs lignes par numero_piece (import initial + réimport avec reste_du réel)
-- → la Map JS prenait la dernière valeur reçue de manière non-déterministe
-- Solution : DISTINCT ON (numero_piece) ORDER BY reste_du ASC → toujours le solde le plus bas

DROP VIEW IF EXISTS v_factures_avec_reste_du;

CREATE VIEW v_factures_avec_reste_du AS
SELECT DISTINCT ON (f.numero_piece)
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
  f.montant_ttc - f.reste_du                          AS montant_lettre,
  f.reste_du,
  CASE
    WHEN f.est_avoir                                  THEN 'avoir'
    WHEN (f.montant_ttc - f.reste_du) = 0             THEN 'impaye'
    WHEN (f.montant_ttc - f.reste_du) > f.montant_ttc
         AND f.montant_ttc > 0                        THEN 'sur-lettre'
    WHEN (f.montant_ttc - f.reste_du) >= f.montant_ttc
         AND f.montant_ttc > 0                        THEN 'paye'
    ELSE 'partiel'
  END AS statut_paiement
FROM factures f
ORDER BY f.numero_piece, f.reste_du ASC NULLS LAST;
