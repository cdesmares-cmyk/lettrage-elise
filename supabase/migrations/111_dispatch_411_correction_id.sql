-- Migration 111 : propager correction_id dans dispatch_411
--
-- Contexte (audit chantier H) :
--   dispatch_411 (migrations 103/109) ne posait pas de correction_id sur ses
--   lignes correction ni dispatch. Conséquences :
--   1. Les corrections dispatch_411 n'apparaissent pas dans ModalCorrection
--      (filtre NOT correction_id IS NULL).
--   2. Impossible d'annuler un dispatch spécifique : PageLettrage annule tout
--      par id_ligne_bancaire, sans granularité si plusieurs dispatches ont eu lieu.
--
-- Fix : générer un v_correction_id par appel, le propager sur chaque ligne
--   correction ET chaque ligne dispatch, identique à fn_dispatch_411_attente
--   (migration 110).
--
-- ModalCorrection annule via WHERE correction_id = x (sans filtre sur mode),
-- donc correction + dispatches sont annulés atomiquement.

CREATE OR REPLACE FUNCTION dispatch_411(
  p_numero_411   text,
  p_operateur    text,
  p_lettrages    jsonb   -- [{numero_facture, code_client, montant}]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id         uuid    := get_my_organisation_id();
  v_correction_id  uuid    := gen_random_uuid();
  v_total_dispatch numeric;
  v_source_total   numeric;
  v_credit_net     numeric;
  v_temp           record;
  v_commentaire    text;
BEGIN
  v_commentaire := 'Dispatché depuis ' || p_numero_411
                 || ' le ' || CURRENT_DATE
                 || ' — opérateur ' || p_operateur;

  -- Montant net de toutes les cibles (factures positives + avoirs négatifs)
  SELECT COALESCE(SUM((l->>'montant')::numeric), 0)
  INTO   v_total_dispatch
  FROM   jsonb_array_elements(p_lettrages) AS l;

  IF v_total_dispatch <= 0 THEN
    RAISE EXCEPTION 'Montant dispatch invalide';
  END IF;

  -- Somme brute des sources positives (pour le calcul proportionnel)
  SELECT COALESCE(SUM(montant), 0)
  INTO   v_source_total
  FROM   lettrages
  WHERE  numero_facture  = p_numero_411
    AND  organisation_id = v_org_id
    AND  montant         > 0
    AND  annule          = false;

  IF v_source_total <= 0 THEN
    RAISE EXCEPTION 'Aucun lettrage source actif pour %', p_numero_411;
  END IF;

  -- Crédit net réel (sources - corrections déjà passées)
  SELECT COALESCE(SUM(montant), 0)
  INTO   v_credit_net
  FROM   lettrages
  WHERE  numero_facture  = p_numero_411
    AND  organisation_id = v_org_id
    AND  annule          = false;

  IF v_credit_net <= 0.005 THEN
    RAISE EXCEPTION 'Aucun crédit disponible sur le compte %', p_numero_411;
  END IF;

  IF v_total_dispatch > v_credit_net + 0.01 THEN
    RAISE EXCEPTION 'Montant dispatch (%) supérieur au crédit disponible (%)',
      v_total_dispatch, v_credit_net;
  END IF;

  FOR v_temp IN
    SELECT id, id_ligne_bancaire, montant, code_client
    FROM   lettrages
    WHERE  numero_facture  = p_numero_411
      AND  organisation_id = v_org_id
      AND  montant         > 0
      AND  annule          = false
    ORDER  BY id
  LOOP
    -- Correction proportionnelle sur le compte 411 (avec correction_id)
    INSERT INTO lettrages (
      id_ligne_bancaire, numero_facture, code_client, montant,
      date_lettrage, mode, correction_id, commentaire, operateur, organisation_id
    ) VALUES (
      v_temp.id_ligne_bancaire,
      p_numero_411,
      v_temp.code_client,
      -ROUND(v_total_dispatch * v_temp.montant / v_source_total, 2),
      CURRENT_DATE,
      'correction',
      v_correction_id,
      v_commentaire,
      p_operateur,
      v_org_id
    );

    -- Lettrages réels sur les factures et avoirs cibles (avec correction_id)
    INSERT INTO lettrages (
      id_ligne_bancaire, numero_facture, code_client, montant,
      date_lettrage, mode, correction_id, commentaire, operateur, organisation_id
    )
    SELECT
      v_temp.id_ligne_bancaire,
      NULLIF(TRIM(l->>'numero_facture'), ''),
      TRIM(l->>'code_client'),
      ROUND((l->>'montant')::numeric * v_temp.montant / v_source_total, 2),
      CURRENT_DATE,
      'dispatch',
      v_correction_id,
      v_commentaire,
      p_operateur,
      v_org_id
    FROM jsonb_array_elements(p_lettrages) AS l
    WHERE ABS((l->>'montant')::numeric) > 0.005;
  END LOOP;
END;
$$;
