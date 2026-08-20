-- Migration 125 : Patch solde_snapshot manquant sur les relances existantes
--
-- Contexte : des relances envoyées ont solde_snapshot = 0 car la colonne n'était pas
-- correctement renseignée au moment de l'INSERT (ou ajoutée avec DEFAULT 0 après coup).
-- Sans solde_snapshot, etatVue() ne peut pas détecter un paiement via la condition
-- principale (solde_snapshot > 0 && soldeCourant < solde_snapshot).
--
-- Correction : recalcule solde_snapshot depuis la somme des montant_ttc des factures
-- du snapshot pour toutes les relances envoyées dont solde_snapshot = 0.
-- On utilise montant_ttc (immuable) car reste_du a pu évoluer depuis l'envoi.

UPDATE relances r
SET solde_snapshot = (
  SELECT COALESCE(SUM(f.montant_ttc), 0)
  FROM factures f
  WHERE f.numero_piece = ANY(r.factures_ids)
    AND f.organisation_id = r.organisation_id
)
WHERE r.solde_snapshot = 0
  AND r.statut != 'brouillon'
  AND r.envoyee_le IS NOT NULL
  AND array_length(r.factures_ids, 1) > 0;
