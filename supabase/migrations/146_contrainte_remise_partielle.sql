-- Migration 146 : autoriser plusieurs lettrages remise sur la même facture
--
-- Cas métier : deux clients paient chacun 50% d'une même facture par chèque.
-- Les deux chèques figurent dans la même remise → même (org, ligne_bancaire, facture)
-- mais c'est légitime (paiement partiel multi-payeurs).
--
-- Fix : exclure les lettrages remise (remise_id IS NOT NULL) de la contrainte unique.
-- Les lettrages normaux (remise_id IS NULL) restent protégés.

DROP INDEX IF EXISTS idx_lettrages_no_doublon;

CREATE UNIQUE INDEX idx_lettrages_no_doublon
  ON lettrages (organisation_id, id_ligne_bancaire, numero_facture)
  WHERE id_ligne_bancaire IS NOT NULL
    AND numero_facture    IS NOT NULL
    AND annule            = false
    AND mode              NOT IN ('correction', 'dispatch')
    AND remise_id         IS NULL;
