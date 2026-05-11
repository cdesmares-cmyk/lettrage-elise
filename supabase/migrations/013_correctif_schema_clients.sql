-- Migration 013 : Correctif schéma clients et vues — Mai 2026
-- Garantit l'état correct même si la migration 012 a été appliquée partiellement

-- ── 1. S'assurer que les vues dépendantes sont supprimées avant tout ALTER ────
DROP VIEW IF EXISTS v_stats_clients CASCADE;
DROP VIEW IF EXISTS v_comptes_clients CASCADE;

-- ── 2. Supprimer les anciennes colonnes clients si elles existent encore ──────
ALTER TABLE clients
  DROP COLUMN IF EXISTS ancien_code,
  DROP COLUMN IF EXISTS est_plateforme,
  DROP COLUMN IF EXISTS est_groupement,
  DROP COLUMN IF EXISTS parent_code_dso,
  DROP COLUMN IF EXISTS mode_paiement,
  DROP COLUMN IF EXISTS statut;

-- ── 3. Ajouter les nouvelles colonnes si elles n'existent pas encore ──────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS commercial text,
  ADD COLUMN IF NOT EXISTS operateur  text;

-- ── 4. Recréer v_comptes_clients avec le bon schéma ──────────────────────────
CREATE OR REPLACE VIEW v_comptes_clients AS
SELECT
  c.code_dso,
  c.nom,
  c.statut_juridique,
  c.commercial,
  c.operateur,
  c.plateforme,
  c.code_groupement,
  COUNT(f.numero_piece)::int                                                          AS nb_factures_total,
  COUNT(CASE WHEN f.reste_du > 0.005 AND f.est_avoir = false THEN 1 END)::int        AS nb_impayees,
  COALESCE(
    SUM(CASE WHEN f.reste_du > 0.005 AND f.est_avoir = false THEN f.reste_du ELSE 0 END),
    0
  )::numeric(12,2)                                                                    AS encours_total,
  MAX(f.date_emission)                                                                AS derniere_emission
FROM clients c
LEFT JOIN factures f ON f.code_client = c.code_dso
GROUP BY
  c.code_dso, c.nom, c.statut_juridique, c.commercial, c.operateur,
  c.plateforme, c.code_groupement;

-- ── 5. Contrainte type imports (idempotente) ─────────────────────────────────
ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_type_check;
ALTER TABLE imports ADD CONSTRAINT imports_type_check
  CHECK (type IN (
    'csv_bancaire', 'xlsx_factures', 'import_lettrage',
    'import_groupements', 'import_clients', 'import_contacts'
  ));
