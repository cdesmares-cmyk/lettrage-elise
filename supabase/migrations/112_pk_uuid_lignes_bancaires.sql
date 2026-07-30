-- Migration 112 : PK UUID multi-tenant pour lignes_bancaires
--
-- Contexte (audit chantier multi-tenant) :
--   Migration 044 a rendu composites les PKs de clients, factures, libelles_sepa —
--   mais a omis lignes_bancaires. Sa PK id_operation TEXT était globale (non scopée
--   par organisation_id), bloquant l'import du même fichier CSV pour une deuxième
--   organisation : "duplicate key value violates unique constraint lignes_bancaires_pkey".
--
-- Option B retenue : nouveau UUID PK + contrainte unique (organisation_id, id_operation)
--   - Cohérent avec le pattern UUID de : lettrages, remises, remboursements
--   - id_operation reste TEXT exposé dans toutes les vues → zéro impact frontend
--   - Les vues ont security_invoker = true → RLS isole les jointures par org
--   - Les triggers sont SECURITY INVOKER → RLS s'applique dans les fonctions
--   - FKs remises + remboursements supprimées : même décision que migration 043
--     pour lettrages (intégrité garantie au niveau applicatif)

BEGIN;

-- ── 1. Supprimer les FK qui référencent lignes_bancaires(id_operation) ──────────
--    IF EXISTS évite l'échec si les noms auto-générés diffèrent légèrement.

ALTER TABLE remises        DROP CONSTRAINT IF EXISTS remises_id_ligne_bancaire_fkey;
ALTER TABLE remboursements DROP CONSTRAINT IF EXISTS remboursements_id_ligne_bancaire_fkey;

-- ── 2. Nouveau PK UUID ──────────────────────────────────────────────────────────
--    DEFAULT gen_random_uuid() remplit automatiquement les lignes existantes
--    avec un UUID unique par ligne (évaluation volatile = un appel par ligne).

ALTER TABLE lignes_bancaires
  ADD COLUMN id UUID NOT NULL DEFAULT gen_random_uuid();

-- ── 3. Basculer la clé primaire ─────────────────────────────────────────────────

ALTER TABLE lignes_bancaires DROP CONSTRAINT lignes_bancaires_pkey;
ALTER TABLE lignes_bancaires ADD PRIMARY KEY (id);

-- ── 4. Contrainte unique multi-tenant ──────────────────────────────────────────
--    Chaque organisation peut avoir ses propres valeurs d'id_operation.
--    Remplace l'ancienne PK globale par un scope organisation + identifiant banque.

ALTER TABLE lignes_bancaires
  ADD CONSTRAINT lignes_bancaires_org_id_operation_uniq
  UNIQUE (organisation_id, id_operation);

-- ── 5. Vérification post-migration ─────────────────────────────────────────────

SELECT
  COUNT(*)                                         AS total_lignes,
  COUNT(id)                                        AS avec_uuid,
  COUNT(id) FILTER (WHERE id IS NOT NULL)          AS uuid_non_null,
  COUNT(*) FILTER (WHERE organisation_id IS NULL)  AS sans_org
FROM lignes_bancaires;

COMMIT;
