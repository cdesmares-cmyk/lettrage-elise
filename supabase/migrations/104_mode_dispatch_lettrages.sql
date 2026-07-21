-- Migration 104 : ajouter 'dispatch' à la contrainte lettrages_mode_check
--
-- La migration 103 introduit mode='dispatch' pour les lettrages créés par
-- dispatch_411 (sur les factures réelles). Ce mode n'était pas référencé
-- dans la contrainte CHECK héritée de la migration 098.

ALTER TABLE lettrages DROP CONSTRAINT IF EXISTS lettrages_mode_check;
ALTER TABLE lettrages ADD CONSTRAINT lettrages_mode_check
  CHECK (mode IN ('auto', 'semi', 'manuel', 'import', 'remboursement', 'compensation', 'correction', 'dispatch'));
