-- Migration 051 : préférences notifications email par utilisateur
-- notif_bodacc  : alertes BODACC (procédures collectives)
-- notif_import  : confirmations de sync ERP (Axonaut, futurs providers) — réservé, non utilisé pour l'instant
ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS notif_bodacc  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_import  BOOLEAN DEFAULT false;
