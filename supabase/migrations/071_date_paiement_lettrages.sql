-- Migration 071 : date_lettrage = date d'opération bancaire (et non date d'action opérateur)
--
-- Problème : les lettrages manuels stockaient date_lettrage = aujourd'hui (date de l'action).
-- La vraie date de paiement est date_operation de la ligne bancaire associée.
--
-- Backfill exécuté manuellement le 2026-06-10 :
UPDATE lettrages l
SET date_lettrage = lb.date_operation
FROM lignes_bancaires lb
WHERE l.id_ligne_bancaire = lb.id_operation
  AND l.mode NOT IN ('import', 'remboursement')
  AND l.id_ligne_bancaire IS NOT NULL;
--
-- Code corrigé dans :
--   useLettrageForm.ts   — valider(), affecterEn411(), affecterEn471()
--   useDispatch471.ts    — valider()
--   useRequalification471.ts — corrections + inserts
-- Tous utilisent désormais ligneActive.date_operation au lieu de new Date().
