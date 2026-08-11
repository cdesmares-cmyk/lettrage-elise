-- Migration 123 : rôle "externe" — accès lecture seule Compte Client + Export
-- Destiné aux experts-comptables, consultants externes, factors
-- Accès : compte-client (lecture) + import-export (export uniquement)
-- Aucun droit d'écriture

ALTER TABLE utilisateurs
  DROP CONSTRAINT IF EXISTS utilisateurs_role_check;

ALTER TABLE utilisateurs
  ADD CONSTRAINT utilisateurs_role_check
  CHECK (role IN ('admin', 'responsable_poste_client', 'commercial', 'externe', 'superadmin'));
