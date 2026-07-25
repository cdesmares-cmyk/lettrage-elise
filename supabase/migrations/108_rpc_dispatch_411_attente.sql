-- Migration 108 : RPC atomique fn_dispatch_411_attente
--
-- Problème : useDispatch411Attente.valider() faisait 4 appels Supabase successifs
-- (upsert factures → insert correction → insert dispatches → update flag).
-- Une coupure réseau entre le INSERT correction (−X) et les INSERT dispatch (+X)
-- laissait le crédit 411_ATTENTE définitivement réduit sans contrepartie.
--
-- Solution : tout dans une transaction PostgreSQL unique via SECURITY DEFINER.
-- En cas d'erreur à n'importe quelle étape, tout est annulé automatiquement.
--
-- Identique à dispatch_411() (migration 103) pour les 411_CLIENT,
-- mais adapté au flux 411_ATTENTE (source = ligne bancaire, pas pseudo-facture).

CREATE OR REPLACE FUNCTION fn_dispatch_411_attente(
  p_id_ligne_bancaire  text,
  p_operateur          text,
  p_targets            jsonb
  -- Format attendu : [{
  --   "classe":          "facture" | "compte_client" | "autres",
  --   "numero_facture":  text | null,
  --   "code_client":     text,
  --   "nom_client":      text | null,
  --   "montant":         numeric,
  --   "commentaire":     text | null
  -- }]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id         uuid    := get_my_organisation_id();
  v_today          date    := CURRENT_DATE;
  v_correction_id  uuid    := gen_random_uuid();
  v_credit_net     numeric;
  v_montant_total  numeric;
  v_restant_apres  numeric;
  v_target         jsonb;
  v_classe         text;
  v_numero_facture text;
  v_code_client    text;
  v_nom_client     text;
  v_montant        numeric;
  v_commentaire    text;
BEGIN
  -- ── 1. Vérifier le crédit net disponible sur 411_ATTENTE ─────────────────
  SELECT COALESCE(SUM(montant), 0)
  INTO   v_credit_net
  FROM   lettrages
  WHERE  id_ligne_bancaire = p_id_ligne_bancaire
    AND  organisation_id   = v_org_id
    AND  numero_facture    = '411_ATTENTE'
    AND  annule            = false;

  IF v_credit_net < 0.005 THEN
    RAISE EXCEPTION 'Aucun crédit disponible sur 411_ATTENTE pour cette ligne bancaire';
  END IF;

  -- ── 2. Vérifier le montant total dispatché ───────────────────────────────
  SELECT COALESCE(SUM((t->>'montant')::numeric), 0)
  INTO   v_montant_total
  FROM   jsonb_array_elements(p_targets) AS t;

  IF v_montant_total <= 0 THEN
    RAISE EXCEPTION 'Montant dispatch invalide (%)' , v_montant_total::text;
  END IF;

  IF v_montant_total > v_credit_net + 0.005 THEN
    RAISE EXCEPTION 'Montant dispatch (%) supérieur au crédit disponible (%)',
      v_montant_total::text, v_credit_net::text;
  END IF;

  -- ── 3. Upsert pseudo-factures 411_CLIENT si des lignes compte_client ─────
  FOR v_target IN SELECT * FROM jsonb_array_elements(p_targets)
  LOOP
    IF (v_target->>'classe') = 'compte_client' THEN
      v_code_client := v_target->>'code_client';
      v_nom_client  := v_target->>'nom_client';
      INSERT INTO factures (
        organisation_id, numero_piece, code_client, nom_client,
        date_emission, montant_ht, montant_ttc, reste_du, est_avoir
      ) VALUES (
        v_org_id,
        '411_' || v_code_client,
        v_code_client,
        v_nom_client,
        v_today, 0, 0, 0, false
      )
      ON CONFLICT (organisation_id, numero_piece) DO NOTHING;
    END IF;
  END LOOP;

  -- ── 4. Correction sur 411_ATTENTE (reversal du crédit dispatché) ─────────
  -- mode='correction' → exempté du trigger de date (migration 103)
  --                   → exempté de l'index unique (migration 105)
  INSERT INTO lettrages (
    id_ligne_bancaire, numero_facture, code_client, montant,
    date_lettrage, mode, correction_id, commentaire,
    operateur, cree_par, organisation_id
  ) VALUES (
    p_id_ligne_bancaire,
    '411_ATTENTE',
    'ATTENTE',
    -ROUND(v_montant_total * 100) / 100,
    v_today,
    'correction',
    v_correction_id,
    'Dispatch 411 Attente',
    p_operateur,
    auth.uid(),
    v_org_id
  );

  -- ── 5. Lettrages dispatch vers les cibles ────────────────────────────────
  -- mode='dispatch' → exempté du trigger de date (migration 103)
  FOR v_target IN SELECT * FROM jsonb_array_elements(p_targets)
  LOOP
    v_classe      := v_target->>'classe';
    v_montant     := ROUND((v_target->>'montant')::numeric * 100) / 100;
    v_commentaire := NULLIF(TRIM(COALESCE(v_target->>'commentaire', '')), '');

    IF v_classe = 'autres' THEN
      v_numero_facture := NULL;
      v_code_client    := 'AUTRES';
    ELSIF v_classe = 'compte_client' THEN
      v_code_client    := v_target->>'code_client';
      v_numero_facture := '411_' || v_code_client;
    ELSE
      -- facture réelle
      v_numero_facture := NULLIF(TRIM(COALESCE(v_target->>'numero_facture', '')), '');
      v_code_client    := v_target->>'code_client';
    END IF;

    INSERT INTO lettrages (
      id_ligne_bancaire, numero_facture, code_client, montant,
      date_lettrage, mode, commentaire,
      operateur, cree_par, organisation_id
    ) VALUES (
      p_id_ligne_bancaire,
      v_numero_facture,
      v_code_client,
      v_montant,
      v_today,
      'dispatch',
      v_commentaire,
      p_operateur,
      auth.uid(),
      v_org_id
    );
  END LOOP;

  -- ── 6. Retirer le flag en_attente_411 si entièrement dispatché ───────────
  v_restant_apres := ROUND((v_credit_net - v_montant_total) * 100) / 100;
  IF ABS(v_restant_apres) < 0.005 THEN
    UPDATE lignes_bancaires
    SET    en_attente_411 = false
    WHERE  id_operation    = p_id_ligne_bancaire
      AND  organisation_id = v_org_id;
  END IF;

END;
$$;
