-- Migration 116 : ajout colonne date_rappel sur les relances
-- Utilisée quand on marque une relance "sans réponse" avec une date de suivi planifiée.
-- Le cron d'alerte lira cette colonne pour envoyer un rappel automatique.

ALTER TABLE relances ADD COLUMN IF NOT EXISTS date_rappel timestamptz;
