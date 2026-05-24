-- Migration 033 : opt-in digest alertes pour les utilisateurs de rôle commercial
ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS recoit_digest_alertes BOOLEAN DEFAULT false;
