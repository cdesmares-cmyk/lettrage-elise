-- Migration 113 : Restaurer organisation_id dans l'index anti-doublon lettrages
--
-- Régression introduite en migration 063 : en corrigeant le bug d'annulation
-- (ajout du filtre annule = false), organisation_id a été retiré de l'index.
-- Résultat : deux organisations partageant le même id_ligne_bancaire + même
-- numero_facture déclenchent une violation de contrainte unique (code 23505),
-- même si c'est le premier lettrage de chaque organisation sur cette ligne.
--
-- Fix : recréer l'index avec organisation_id, en conservant toutes les
-- exclusions accumulées depuis (annule = false, mode NOT IN correction/dispatch).

DROP INDEX IF EXISTS idx_lettrages_no_doublon;

CREATE UNIQUE INDEX idx_lettrages_no_doublon
  ON lettrages (organisation_id, id_ligne_bancaire, numero_facture)
  WHERE id_ligne_bancaire IS NOT NULL
    AND numero_facture    IS NOT NULL
    AND annule            = false
    AND mode              NOT IN ('correction', 'dispatch');
