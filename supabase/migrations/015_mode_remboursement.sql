-- Ajoute le mode 'remboursement' dans la contrainte de lettrages
ALTER TABLE lettrages DROP CONSTRAINT IF EXISTS lettrages_mode_check;
ALTER TABLE lettrages ADD CONSTRAINT lettrages_mode_check
  CHECK (mode IN ('auto', 'semi', 'manuel', 'import', 'remboursement'));
