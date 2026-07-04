-- Migration 084 : ajout relance_auto_alerte à v_comptes_clients

DROP VIEW IF EXISTS v_comptes_clients CASCADE;

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
  c.siret,
  c.relance_auto_alerte,
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
  c.plateforme, c.code_groupement, c.organisation_id, c.siret,
  c.relance_auto_alerte;
