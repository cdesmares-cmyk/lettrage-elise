-- Migration 044 : PK composites multi-tenant
-- Garantit qu'un nombre illimité d'organisations peut coexister avec des données
-- identiques (même code client, même numéro facture, même libellé SEPA) sans collision.
--
-- Principe : (organisation_id + identifiant_métier) devient la clé primaire.
-- Le RLS garantissait déjà l'isolation en lecture.
-- Cette migration garantit l'isolation en écriture au niveau du schéma.
--
-- Périmètre :
--   clients        — PK (organisation_id, code_dso)
--   factures       — PK (organisation_id, numero_piece)
--   libelles_sepa  — PK (organisation_id, libelle)
--   imports        — UNIQUE (organisation_id, hash_fichier)
--   contacts_client — UNIQUE (organisation_id, email, code_client)
--   lettrages      — index anti-doublon scopé par organisation
--   fn_upsert_libelle_sepa — ON CONFLICT mis à jour
--
-- Prérequis vérifiés : zéro doublon (code_dso, numero_piece, libelle) dans la base.
-- Transaction atomique : tout réussit ou rien n'est appliqué.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 1 — Suppression de toutes les FK référençant les PKs à modifier
-- Doit être fait avant de toucher aux PKs (Postgres refuse sinon)
-- ══════════════════════════════════════════════════════════════════════════════

-- FK vers clients(code_dso)
ALTER TABLE factures         DROP CONSTRAINT IF EXISTS factures_code_client_fkey;
ALTER TABLE lignes_bancaires DROP CONSTRAINT IF EXISTS lignes_bancaires_code_client_propose_fkey;
ALTER TABLE libelles_sepa    DROP CONSTRAINT IF EXISTS libelles_sepa_code_client_fkey;
ALTER TABLE contacts         DROP CONSTRAINT IF EXISTS contacts_code_client_fkey;

-- FK vers factures(numero_piece)
ALTER TABLE lettrages        DROP CONSTRAINT IF EXISTS lettrages_numero_facture_fkey;

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 2 — CLIENTS : PK composite (organisation_id, code_dso)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE clients DROP CONSTRAINT clients_pkey;
ALTER TABLE clients ADD PRIMARY KEY (organisation_id, code_dso);

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 3 — FACTURES : PK composite (organisation_id, numero_piece)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE factures DROP CONSTRAINT factures_pkey;
ALTER TABLE factures ADD PRIMARY KEY (organisation_id, numero_piece);

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 4 — LIBELLES_SEPA : PK composite (organisation_id, libelle)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE libelles_sepa DROP CONSTRAINT libelles_sepa_pkey;
ALTER TABLE libelles_sepa ADD PRIMARY KEY (organisation_id, libelle);

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 5 — Recréation des FK en FK composites
-- Même sémantique qu'avant, mais l'intégrité est maintenant garantie par org
-- ══════════════════════════════════════════════════════════════════════════════

-- factures.code_client → clients (composite)
ALTER TABLE factures
  ADD CONSTRAINT factures_client_fk
  FOREIGN KEY (organisation_id, code_client)
  REFERENCES clients(organisation_id, code_dso);

-- lignes_bancaires.code_client_propose → clients (composite, nullable — FK non vérifiée si NULL)
ALTER TABLE lignes_bancaires
  ADD CONSTRAINT lignes_bancaires_client_fk
  FOREIGN KEY (organisation_id, code_client_propose)
  REFERENCES clients(organisation_id, code_dso);

-- libelles_sepa.code_client → clients (composite)
ALTER TABLE libelles_sepa
  ADD CONSTRAINT libelles_sepa_client_fk
  FOREIGN KEY (organisation_id, code_client)
  REFERENCES clients(organisation_id, code_dso);

-- contacts.code_client → clients (composite, ON DELETE CASCADE conservé)
ALTER TABLE contacts
  ADD CONSTRAINT contacts_client_fk
  FOREIGN KEY (organisation_id, code_client)
  REFERENCES clients(organisation_id, code_dso)
  ON DELETE CASCADE;

-- lettrages.numero_facture → factures (composite)
ALTER TABLE lettrages
  ADD CONSTRAINT lettrages_facture_fk
  FOREIGN KEY (organisation_id, numero_facture)
  REFERENCES factures(organisation_id, numero_piece);

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 6 — IMPORTS : contrainte UNIQUE scopée par organisation
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_hash_fichier_key;
ALTER TABLE imports ADD CONSTRAINT imports_org_hash_uniq
  UNIQUE (organisation_id, hash_fichier);

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 7 — CONTACTS_CLIENT : contrainte UNIQUE scopée par organisation
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE contacts_client DROP CONSTRAINT IF EXISTS contacts_client_email_code_unique;
ALTER TABLE contacts_client ADD CONSTRAINT contacts_client_org_email_code_uniq
  UNIQUE (organisation_id, email, code_client);

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 8 — LETTRAGES : index anti-doublon scopé par organisation
-- Garantit qu'une facture ne peut être lettrée qu'une fois par ligne bancaire ET par org
-- ══════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_lettrages_no_doublon;
CREATE UNIQUE INDEX idx_lettrages_no_doublon
  ON lettrages (organisation_id, id_ligne_bancaire, numero_facture)
  WHERE id_ligne_bancaire IS NOT NULL
    AND numero_facture IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- ÉTAPE 9 — fn_upsert_libelle_sepa : ON CONFLICT mis à jour
-- Le PK de libelles_sepa est désormais (organisation_id, libelle)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_upsert_libelle_sepa(
  p_libelle     text,
  p_code_client text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE libelles_sepa
  SET code_client     = p_code_client,
      nb_utilisations = nb_utilisations + 1
  WHERE libelle = p_libelle;

  IF NOT FOUND THEN
    INSERT INTO libelles_sepa (libelle, code_client, nb_utilisations)
    VALUES (p_libelle, p_code_client, 1)
    ON CONFLICT (organisation_id, libelle) DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_upsert_libelle_sepa(text, text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATION FINALE
-- ══════════════════════════════════════════════════════════════════════════════

SELECT
  'clients'       AS table_name, count(*) AS lignes FROM clients
UNION ALL SELECT
  'factures',       count(*)               FROM factures
UNION ALL SELECT
  'libelles_sepa',  count(*)               FROM libelles_sepa;

COMMIT;
