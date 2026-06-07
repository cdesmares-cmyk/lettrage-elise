-- Migration 063 : Correction de l'index unique lettrages
-- L'index précédent bloquait la re-création d'un lettrage après annulation
-- car les lignes annulées (annule = true) étaient incluses dans la contrainte.

DROP INDEX IF EXISTS idx_lettrages_no_doublon;

CREATE UNIQUE INDEX idx_lettrages_no_doublon
  ON lettrages (id_ligne_bancaire, numero_facture)
  WHERE id_ligne_bancaire IS NOT NULL
    AND numero_facture IS NOT NULL
    AND annule = false;
