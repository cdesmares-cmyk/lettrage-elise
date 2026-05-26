-- Migration 040 : rôle contact en texte libre + contrainte unique email/code_client pour l'upsert
-- La contrainte CHECK limitait à 5 valeurs prédéfinies — on la retire pour permettre
-- des rôles personnalisés saisis manuellement ou importés.
-- La contrainte UNIQUE (email, code_client) est nécessaire pour le ON CONFLICT de l'import.

ALTER TABLE contacts_client
  DROP CONSTRAINT IF EXISTS contacts_client_role_contact_check;

ALTER TABLE contacts_client
  ADD CONSTRAINT contacts_client_email_code_unique UNIQUE (email, code_client);
