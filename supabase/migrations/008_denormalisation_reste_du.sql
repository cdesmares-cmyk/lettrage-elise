-- Migration 008 : Dénormalisation reste_du — correction des performances
-- Problème : v_factures_avec_reste_du calcule reste_du via GROUP BY + JOIN
--            sur 50 000 factures à chaque requête → 10-30 s de latence.
-- Solution  : stocker reste_du dans la table factures + trigger de sync
--             → v_factures_avec_reste_du devient un SELECT simple sans agrégation
--             → v_comptes_clients joint la table directement (pas la vue)

-- ── 1. Supprimer les vues dépendantes (ordre : dépendants en premier) ────────
DROP VIEW IF EXISTS v_comptes_clients;
DROP VIEW IF EXISTS v_stats_clients;
DROP VIEW IF EXISTS v_factures_avec_reste_du;

-- ── 2. Ajouter la colonne reste_du dans factures ──────────────────────────────
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS reste_du numeric(12,2);

-- ── 3. Initialiser reste_du à partir des lettrages existants ─────────────────
UPDATE factures f
SET reste_du = f.montant_ttc - COALESCE(
  (SELECT SUM(l.montant) FROM lettrages l WHERE l.numero_facture = f.numero_piece),
  0
);

-- ── 4. Index pour le filtre rapide WHERE reste_du > 0 ────────────────────────
CREATE INDEX IF NOT EXISTS idx_factures_reste_du ON factures(reste_du);

-- ── 5. Trigger : maintenir reste_du à chaque mutation dans lettrages ──────────
CREATE OR REPLACE FUNCTION sync_reste_du()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE factures SET reste_du = reste_du + OLD.montant
    WHERE numero_piece = OLD.numero_facture;

  ELSIF TG_OP = 'INSERT' THEN
    UPDATE factures SET reste_du = reste_du - NEW.montant
    WHERE numero_piece = NEW.numero_facture;

  ELSE -- UPDATE
    IF OLD.numero_facture != NEW.numero_facture THEN
      -- La facture référencée a changé : rembourser l'ancienne, débiter la nouvelle
      UPDATE factures SET reste_du = reste_du + OLD.montant WHERE numero_piece = OLD.numero_facture;
      UPDATE factures SET reste_du = reste_du - NEW.montant WHERE numero_piece = NEW.numero_facture;
    ELSE
      -- Même facture : ajuster l'écart de montant
      UPDATE factures SET reste_du = reste_du + OLD.montant - NEW.montant
      WHERE numero_piece = NEW.numero_facture;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reste_du ON lettrages;
CREATE TRIGGER trg_sync_reste_du
  AFTER INSERT OR UPDATE OR DELETE ON lettrages
  FOR EACH ROW EXECUTE FUNCTION sync_reste_du();

-- ── 6. Recréer v_factures_avec_reste_du — SELECT direct, zéro agrégation ─────
-- Avant : JOIN factures + lettrages + GROUP BY → O(50k × lettrages) à chaque appel
-- Après : lecture directe de reste_du stocké → O(1) par ligne
CREATE VIEW v_factures_avec_reste_du AS
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
FROM factures f;

-- ── 7. Recréer v_stats_clients — JOIN direct sur factures (pas la vue) ────────
CREATE VIEW v_stats_clients AS
SELECT
  c.code_dso,
  c.nom,
  c.statut,
  c.mode_paiement,
  c.est_plateforme,
  c.est_groupement,
  c.parent_code_dso,
  COALESCE(SUM(CASE WHEN f.reste_du > 0.005 AND f.est_avoir = false THEN f.reste_du ELSE 0 END), 0) AS encours_total,
  COUNT(CASE WHEN f.reste_du > 0.005 AND f.est_avoir = false THEN 1 END)                            AS nb_factures_impayees
FROM clients c
LEFT JOIN factures f ON f.code_client = c.code_dso
GROUP BY
  c.code_dso, c.nom, c.statut, c.mode_paiement,
  c.est_plateforme, c.est_groupement, c.parent_code_dso;

-- ── 8. Recréer v_comptes_clients — JOIN direct sur factures (pas la vue) ──────
CREATE VIEW v_comptes_clients AS
SELECT
  c.code_dso,
  c.nom,
  c.statut,
  c.statut_juridique,
  c.plateforme,
  c.code_groupement,
  c.parent_code_dso,
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
  c.code_dso, c.nom, c.statut, c.statut_juridique,
  c.plateforme, c.code_groupement, c.parent_code_dso;
