-- Migration 032 : RPC creer_remise_atomique
-- Encapsule la création d'une remise (remises + lettrages) dans une seule transaction SQL.
-- Plus de risque de remise orpheline en cas d'erreur réseau entre les deux INSERTs.
--
-- Paramètres :
--   p_type          : 'cheque' | 'lcr'
--   p_numero        : numéro de remise
--   p_montant_total : montant total (null pour chèques)
--   p_cree_par      : uuid de l'utilisateur
--   p_operateur     : email court de l'utilisateur
--   p_lignes        : tableau JSON [{ "numero_facture": "...", "code_client": "...", "montant": 0.00 }]
--
-- Retourne : uuid de la remise créée

CREATE OR REPLACE FUNCTION creer_remise_atomique(
  p_type          text,
  p_numero        text,
  p_montant_total numeric,
  p_cree_par      uuid,
  p_operateur     text,
  p_lignes        jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_remise_id  uuid;
  v_commentaire text;
BEGIN
  v_commentaire := 'Remise '
    || CASE WHEN p_type = 'cheque' THEN 'CHQ' ELSE 'LCR' END
    || ' n°' || p_numero;

  INSERT INTO remises (type, numero, montant_total, statut, cree_par, operateur)
  VALUES (p_type, p_numero, p_montant_total, 'en_attente', p_cree_par, p_operateur)
  RETURNING id INTO v_remise_id;

  INSERT INTO lettrages (
    id_ligne_bancaire, remise_id, numero_facture, code_client,
    montant, date_lettrage, mode, commentaire, cree_par, operateur
  )
  SELECT
    null,
    v_remise_id,
    (l->>'numero_facture'),
    (l->>'code_client'),
    (l->>'montant')::numeric,
    current_date,
    'manuel',
    v_commentaire,
    p_cree_par,
    p_operateur
  FROM jsonb_array_elements(p_lignes) AS l;

  RETURN v_remise_id;
END;
$$;
