-- Migration 079 : Paramètres relances auto — opt-out client + config org
-- clients.relance_auto_active  : inclure/exclure un client des relances auto
-- organisations.delai_rerelance_jours : fenêtre anti-doublon (jours entre 2 relances auto)
-- organisations.signature_auto : signature email insérée dans les relances auto

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS relance_auto_active BOOL NOT NULL DEFAULT true;

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS delai_rerelance_jours INT  NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS signature_auto        TEXT NULL;
