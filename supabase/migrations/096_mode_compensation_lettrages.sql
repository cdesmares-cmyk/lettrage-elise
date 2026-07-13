-- Migration 096 : Ajout du mode 'compensation' pour les lettrages de compensation avoir/facture
-- Sans ce mode, l'insert de compensation viole la contrainte NOT NULL sur mode.

ALTER TABLE lettrages DROP CONSTRAINT IF EXISTS lettrages_mode_check;
ALTER TABLE lettrages ADD CONSTRAINT lettrages_mode_check
  CHECK (mode IN ('auto', 'semi', 'manuel', 'import', 'remboursement', 'compensation'));
