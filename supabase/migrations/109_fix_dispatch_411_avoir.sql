-- Migration 109 : supporter les avoirs (montants négatifs) dans dispatch_411
--
-- Chantier Avoirs : permettre de dispatcher factures + avoirs simultanément.
-- Exemple : 411_CLIENT a 1000€ de crédit. On dispatche vers facture 800€ + avoir -200€.
-- Montant net dispatché = 600€, retrait identique sur le compte 411.
--
-- Trigger trg_sync_reste_du : reste_du -= NEW.montant
--   Pour l'avoir : -200 - (-200) = 0  → solde à zéro ✓
--   Pour la facture : 800 - 800 = 0   → solde à zéro ✓
--
-- Blocage précédent (migration 103, ligne 189) :
--   WHERE (l->>'montant')::numeric > 0
-- filtrait silencieusement les avoirs (montant négatif), qui n'étaient jamais lettrés.
-- Fix : WHERE ABS((l->>'montant')::numeric) > 0.005
--
-- fn_dispatch_411_attente (migration 108) n'est pas modifiée :
-- sa boucle dispatch n'avait pas de filtre > 0.

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
  v_total_dispatch numeric;
  v_source_total   numeric;  -- somme brute des sources positives (calcul proportionnel)
  v_credit_net     numeric;  -- crédit net restant (sources - corrections déjà passées)
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

  -- Crédit net réel (inclut les corrections déjà passées lors de dispatches partiels)
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
    -- Correction proportionnelle sur le compte 411
    INSERT INTO lettrages (
      id_ligne_bancaire, numero_facture, code_client, montant,
      date_lettrage, mode, commentaire, operateur, organisation_id
    ) VALUES (
      v_temp.id_ligne_bancaire,
      p_numero_411,
      v_temp.code_client,
      -ROUND(v_total_dispatch * v_temp.montant / v_source_total, 2),
      CURRENT_DATE,
      'correction',
      v_commentaire,
      p_operateur,
      v_org_id
    );

    -- Lettrages réels sur les factures et avoirs cibles
    INSERT INTO lettrages (
      id_ligne_bancaire, numero_facture, code_client, montant,
      date_lettrage, mode, commentaire, operateur, organisation_id
    )
    SELECT
      v_temp.id_ligne_bancaire,
      NULLIF(TRIM(l->>'numero_facture'), ''),
      TRIM(l->>'code_client'),
      ROUND((l->>'montant')::numeric * v_temp.montant / v_source_total, 2),
      CURRENT_DATE,
      'dispatch',
      v_commentaire,
      p_operateur,
      v_org_id
    FROM jsonb_array_elements(p_lettrages) AS l
    WHERE ABS((l->>'montant')::numeric) > 0.005;
  END LOOP;
END;
$$;
