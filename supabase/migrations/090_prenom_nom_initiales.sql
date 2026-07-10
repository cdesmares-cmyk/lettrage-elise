-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 090 — Remplacement nom_affiche par prenom + nom + initiales
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Renommer l'ancienne colonne
ALTER TABLE utilisateurs RENAME COLUMN nom_affiche TO nom;

-- 2. Ajouter prenom et initiales
ALTER TABLE utilisateurs ADD COLUMN prenom    text NOT NULL DEFAULT '';
ALTER TABLE utilisateurs ADD COLUMN initiales text NOT NULL DEFAULT '';

-- 3. Seed initiales depuis les données existantes (prenom vide à ce stade)
--    Formule : 3 premiers chars du nom (à corriger manuellement via le modal)
UPDATE utilisateurs SET initiales = UPPER(LEFT(nom, 3)) WHERE nom != '';

-- 4. Recréer la vue scores_relance (référençait nom_affiche)
CREATE OR REPLACE VIEW scores_relance
WITH (security_invoker = true)
AS
SELECT
  u.id                                                                              AS operateur_id,
  u.initiales,
  u.role,
  COALESCE(SUM(r.points_attribues) FILTER (
    WHERE r.envoyee_le >= date_trunc('month', now())
  ), 0)                                                                             AS score_mois,
  COUNT(*) FILTER (
    WHERE r.envoyee_le >= date_trunc('month', now())
      AND r.statut != 'brouillon'
  )                                                                                 AS nb_relances_mois,
  ROUND(
    COUNT(*) FILTER (
      WHERE r.statut IN ('repondue', 'payee')
        AND r.envoyee_le >= date_trunc('month', now())
    )::numeric
    / NULLIF(COUNT(*) FILTER (
      WHERE r.statut != 'brouillon'
        AND r.envoyee_le >= date_trunc('month', now())
    ), 0) * 100
  , 1)                                                                              AS taux_reponse_pct
FROM utilisateurs u
LEFT JOIN relances r ON r.operateur_id = u.id
WHERE u.role IN ('admin', 'responsable_poste_client')
GROUP BY u.id, u.initiales, u.role;
