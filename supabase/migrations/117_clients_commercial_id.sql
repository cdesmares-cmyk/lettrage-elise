-- Migration 117 : commercial_id sur clients
-- Stocke l'UUID de l'utilisateur assigné comme commercial (plus fiable que le texte libre)
-- Le champ commercial (texte) est conservé pour l'affichage partout

ALTER TABLE clients ADD COLUMN IF NOT EXISTS commercial_id uuid REFERENCES utilisateurs(id);

-- Backfill : on tente de matcher l'existant (nom seul OU nom+prénom)
UPDATE clients c
SET commercial_id = u.id
FROM utilisateurs u
WHERE c.organisation_id = u.organisation_id
  AND c.commercial IS NOT NULL
  AND (
    c.commercial = CONCAT(u.nom, ' ', u.prenom)
    OR c.commercial = u.nom
  );

-- Mise à jour de v_comptes_clients pour exposer commercial_id
DROP VIEW IF EXISTS v_comptes_clients CASCADE;

CREATE VIEW v_comptes_clients
WITH (security_invoker = true)
AS
SELECT
  c.code_dso,
  c.nom,
  c.statut_juridique,
  c.commercial,
  c.commercial_id,
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
  MAX(f.date_emission)                                                          AS derniere_emission,
  MAX(a.score_risque)::int                                                      AS score_risque
FROM clients c
LEFT JOIN factures f ON f.code_client = c.code_dso
                     AND f.organisation_id = c.organisation_id
LEFT JOIN alertes_score a ON a.organisation_id = c.organisation_id
                          AND a.code_client = c.code_dso
                          AND a.date_calcul = CURRENT_DATE
GROUP BY
  c.code_dso, c.nom, c.statut_juridique, c.commercial, c.commercial_id,
  c.operateur, c.plateforme, c.code_groupement, c.organisation_id, c.siret,
  c.relance_auto_alerte;
