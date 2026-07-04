-- Migration 081 : relance_auto_active passe à false par défaut sur clients
-- Correction : la migration 079 avait mis DEFAULT true, ce qui inclut automatiquement
-- tous les clients existants dans les relances auto sans action explicite de l'admin.
-- Nouveau comportement : opt-in explicite requis.

ALTER TABLE clients ALTER COLUMN relance_auto_active SET DEFAULT false;
UPDATE clients SET relance_auto_active = false WHERE relance_auto_active = true;
