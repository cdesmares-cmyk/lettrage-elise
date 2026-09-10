-- Migration 142 : archive des lettrages remise + garde-fous modifier/supprimer
--
-- Problème : modifier_remise_atomique supprime les lettrages avant de les ré-insérer.
-- Si p_lignes est vide (bug Array.every côté front), les données disparaissent sans trace.
--
-- Solution :
--   1. Table lettrages_archive — copie avant tout DELETE dans le parcours remise
--   2. Garde-fou SQL dans modifier_remise_atomique — bloque si p_lignes = []
--   3. Archive systématique dans modifier et supprimer avant chaque DELETE
--
-- Périmètre : remises uniquement (lettrages avec remise_id non null).
-- Les lettrages bancaires normaux ne sont pas concernés.

-- ─── Table archive ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lettrages_archive (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lettrage_id     uuid        NOT NULL,
  remise_id       uuid,
  numero_facture  text,
  code_client     text,
  montant         numeric(12,2),
  date_lettrage   date,
  mode            text,
  commentaire     text,
  organisation_id uuid,
  cree_par        uuid,
  operateur       text,
  motif           text        NOT NULL CHECK (motif IN ('modification', 'suppression')),
  archive_le      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lettrages_archive_remise_id ON lettrages_archive(remise_id);
CREATE INDEX idx_lettrages_archive_le        ON lettrages_archive(archive_le DESC);

ALTER TABLE lettrages_archive ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lecture authentifiee lettrages_archive" ON lettrages_archive
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- ─── modifier_remise_atomique — avec garde-fou + archive ──────────────────────
CREATE OR REPLACE FUNCTION modifier_remise_atomique(
  p_remise_id     uuid,
  p_type          text,
  p_numero        text,
  p_montant_total numeric,
  p_lignes        jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_commentaire text;
  v_statut      text;
BEGIN
  -- Garde-fou : refuser une modification sans facture
  IF jsonb_array_length(p_lignes) = 0 THEN
    RAISE EXCEPTION 'Impossible de modifier une remise sans facture rattachée';
  END IF;

  SELECT statut INTO v_statut FROM remises WHERE id = p_remise_id;
  IF v_statut = 'encaisse' THEN
    RAISE EXCEPTION 'Impossible de modifier une remise déjà encaissée';
  END IF;

  v_commentaire := 'Remise '
    || CASE WHEN p_type = 'cheque' THEN 'CHQ' ELSE 'LCR' END
    || ' n°' || p_numero;

  -- Archive les lettrages existants avant suppression
  INSERT INTO lettrages_archive (
    lettrage_id, remise_id, numero_facture, code_client,
    montant, date_lettrage, mode, commentaire,
    organisation_id, cree_par, operateur, motif
  )
  SELECT
    id, remise_id, numero_facture, code_client,
    montant, date_lettrage, mode, commentaire,
    organisation_id, cree_par, operateur, 'modification'
  FROM lettrages
  WHERE remise_id = p_remise_id;

  DELETE FROM lettrages WHERE remise_id = p_remise_id;

  UPDATE remises
  SET    type = p_type, numero = p_numero, montant_total = p_montant_total
  WHERE  id = p_remise_id;

  INSERT INTO lettrages (
    id_ligne_bancaire, remise_id, numero_facture, code_client,
    montant, date_lettrage, mode, commentaire
  )
  SELECT
    null,
    p_remise_id,
    (l->>'numero_facture'),
    (l->>'code_client'),
    (l->>'montant')::numeric,
    current_date,
    'manuel',
    v_commentaire
  FROM jsonb_array_elements(p_lignes) AS l;
END;
$$;

-- ─── supprimer_remise_atomique — avec archive ─────────────────────────────────
CREATE OR REPLACE FUNCTION supprimer_remise_atomique(p_remise_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_statut text;
BEGIN
  SELECT statut INTO v_statut FROM remises WHERE id = p_remise_id;
  IF v_statut = 'encaisse' THEN
    RAISE EXCEPTION 'Impossible de supprimer une remise déjà encaissée';
  END IF;

  -- Archive les lettrages avant suppression
  INSERT INTO lettrages_archive (
    lettrage_id, remise_id, numero_facture, code_client,
    montant, date_lettrage, mode, commentaire,
    organisation_id, cree_par, operateur, motif
  )
  SELECT
    id, remise_id, numero_facture, code_client,
    montant, date_lettrage, mode, commentaire,
    organisation_id, cree_par, operateur, 'suppression'
  FROM lettrages
  WHERE remise_id = p_remise_id;

  DELETE FROM lettrages WHERE remise_id = p_remise_id;
  DELETE FROM remises    WHERE id       = p_remise_id;
END;
$$;
