-- Migration 027 : Ajouter siret à la vue v_comptes_clients

CREATE OR REPLACE VIEW v_comptes_clients AS
SELECT
  c.code_dso,
  c.nom,
  c.statut_juridique,
  c.commercial,
  c.operateur,
  c.plateforme,
  c.code_groupement,
  c.siret,
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
  c.code_dso, c.nom, c.statut_juridique, c.commercial, c.operateur,
  c.plateforme, c.code_groupement, c.siret;
