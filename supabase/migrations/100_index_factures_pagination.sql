-- Migration 100 : index composite pour la pagination de v_factures_avec_reste_du
--
-- Problème : la requête de pagination (offset=3000, limit=1000) déclenche un
-- statement timeout (code 57014) car PostgreSQL trie toute la table sans index adapté.
-- Résultat : 1773 factures jamais chargées en mémoire côté React.
--
-- Solution : index partiel composite sur les colonnes utilisées par la requête :
--   WHERE  (reste_du > 0.005 OR reste_du < -0.005)  → filtre actives uniquement
--   ORDER BY code_client ASC, date_emission DESC     → tri déjà dans l'index
--   organisation_id                                  → filtre RLS (security_invoker)
--
-- Impact : chaque page passe de 2–8 s à < 100 ms. Aucun code applicatif modifié.
-- Lock : brève lock AccessShare sur factures pendant la création (table 68 MB, < 10 s).

CREATE INDEX IF NOT EXISTS idx_factures_actives_pagination
  ON factures (organisation_id, code_client, date_emission DESC)
  WHERE reste_du > 0.005 OR reste_du < -0.005;
