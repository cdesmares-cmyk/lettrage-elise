-- Migration 148 : RPC creer_compensation_atomique
--
-- Transfère le crédit d'une facture surpayée vers une autre facture du même client.
-- Insère deux lettrages liés par compensation_id : une ligne négative sur la source
-- (réduit le crédit) et une ligne positive sur la destination (réduit le solde dû).
-- Impact net = 0€. Visible dans l'export (section 2b de exportLettrageXls).
--
-- Gardes-fous :
--   1. Montant > 0
--   2. Source ≠ destination
--   3. Même client
--   4. Source doit avoir reste_du < 0 (facture en crédit)
--   5. Destination doit avoir reste_du > 0 (facture impayée ou partielle)
--   6. Montant ≤ |reste_du source| (ne pas dépasser le crédit disponible)
--   7. Montant ≤ reste_du destination (ne pas sur-payer la destination)

CREATE OR REPLACE FUNCTION creer_compensation_atomique(
  p_numero_source text,
  p_numero_dest   text,
  p_montant       numeric(12,2),
  p_commentaire   text DEFAULT NULL,
  p_cree_par      uuid DEFAULT NULL,
  p_operateur     text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_org_id          uuid           := get_my_organisation_id();
  v_compensation_id uuid           := gen_random_uuid();
  v_reste_source    numeric(12,2);
  v_reste_dest      numeric(12,2);
  v_code_client_src text;
  v_code_client_dst text;
BEGIN
  -- 1. Gardes-fous de base
  IF p_montant <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être positif';
  END IF;
  IF p_numero_source = p_numero_dest THEN
    RAISE EXCEPTION 'La facture source et la destination doivent être différentes';
  END IF;

  -- 2. Lecture des soldes (RLS sur factures filtre sur l'organisation)
  SELECT reste_du, code_client
  INTO   v_reste_source, v_code_client_src
  FROM   v_factures_avec_reste_du
  WHERE  numero_piece = p_numero_source;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture source introuvable : %', p_numero_source;
  END IF;

  SELECT reste_du, code_client
  INTO   v_reste_dest, v_code_client_dst
  FROM   v_factures_avec_reste_du
  WHERE  numero_piece = p_numero_dest;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture destination introuvable : %', p_numero_dest;
  END IF;

  -- 3. Gardes-fous métier
  IF v_code_client_src <> v_code_client_dst THEN
    RAISE EXCEPTION 'Les deux factures doivent appartenir au même client';
  END IF;

  IF v_reste_source > -0.005 THEN
    RAISE EXCEPTION 'La facture source n''a pas de crédit disponible (reste_du = %€)', ROUND(v_reste_source, 2);
  END IF;

  IF v_reste_dest < 0.005 THEN
    RAISE EXCEPTION 'La facture destination est déjà soldée (reste_du = %€)', ROUND(v_reste_dest, 2);
  END IF;

  IF p_montant > ABS(v_reste_source) + 0.005 THEN
    RAISE EXCEPTION 'Montant supérieur au crédit disponible sur la source (max = %€)', ROUND(ABS(v_reste_source), 2);
  END IF;

  IF p_montant > v_reste_dest + 0.005 THEN
    RAISE EXCEPTION 'Montant supérieur au solde de la facture destination (max = %€)', ROUND(v_reste_dest, 2);
  END IF;

  -- 4. Insertion atomique des deux lignes de compensation
  INSERT INTO lettrages (
    organisation_id, compensation_id, id_ligne_bancaire,
    numero_facture, code_client, montant,
    date_lettrage, mode, commentaire,
    cree_par, operateur
  ) VALUES
    -- Ligne source : montant négatif (réduit le crédit)
    (v_org_id, v_compensation_id, NULL,
     p_numero_source, v_code_client_src, -p_montant,
     current_date, 'compensation',
     COALESCE(p_commentaire, 'Compensation crédit → ' || p_numero_dest),
     p_cree_par, p_operateur),
    -- Ligne destination : montant positif (réduit le solde dû)
    (v_org_id, v_compensation_id, NULL,
     p_numero_dest,   v_code_client_dst,  p_montant,
     current_date, 'compensation',
     COALESCE(p_commentaire, 'Compensation depuis ' || p_numero_source),
     p_cree_par, p_operateur);

  RETURN v_compensation_id;
END;
$$;
