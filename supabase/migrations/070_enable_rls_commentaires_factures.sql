-- Migration 070 : activation RLS sur commentaires_factures
-- La table avait une policy d'isolation par organisation_id mais RLS n'était pas activé
-- → tous les utilisateurs voyaient les commentaires de toutes les organisations

ALTER TABLE commentaires_factures ENABLE ROW LEVEL SECURITY;
