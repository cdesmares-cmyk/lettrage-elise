-- Archive manuelle d'une procédure depuis l'interface
-- La ligne reste visible dans la vue Archive (et disparaît de la vue En cours)
ALTER TABLE alertes_risque
  ADD COLUMN IF NOT EXISTS archivee_manuellement boolean NOT NULL DEFAULT false;
