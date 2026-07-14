-- Migration 099 : RPC atomiques modifier_remise_atomique + supprimer_remise_atomique
-- Remplace les séquences client-side DELETE/UPDATE/INSERT non-atomiques dans useRemises.ts.
-- Si l'une des étapes échoue, la transaction est annulée — aucune donnée corrompue.

-- ─── modifier_remise_atomique ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION modifier_remise_atomique(
  p_remise_id     uuid,
  p_type          text,
  p_numero        text,
  p_montant_total numeric,
  p_lignes        jsonb  -- [{ "numero_facture": "...", "code_client": "...", "montant": 0.00 }]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_commentaire text;
  v_statut      text;
BEGIN
  SELECT statut INTO v_statut FROM remises WHERE id = p_remise_id;
  IF v_statut = 'encaisse' THEN
    RAISE EXCEPTION 'Impossible de modifier une remise déjà encaissée';
  END IF;

  v_commentaire := 'Remise '
    || CASE WHEN p_type = 'cheque' THEN 'CHQ' ELSE 'LCR' END
    || ' n°' || p_numero;

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

-- ─── supprimer_remise_atomique ───────────────────────────────────────────────
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

  DELETE FROM lettrages WHERE remise_id = p_remise_id;
  DELETE FROM remises    WHERE id       = p_remise_id;
END;
$$;
