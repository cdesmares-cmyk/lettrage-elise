-- Migration 102 : fix dispatch_411 pour le cas 411_CLIENT (id_ligne_bancaire non nul)
--
-- Problème : quand la source est un lettrage avec id_ligne_bancaire renseigné
-- (cas 411_CLIENT : banque → pseudo-facture), l'INSERT de la correction
-- (-v_temp.montant sur le même couple id_ligne_bancaire+numero_facture)
-- déclenche une violation de l'index unique idx_lettrages_no_doublon
-- (qui couvre (id_ligne_bancaire, numero_facture) WHERE annule = false).
-- Ce bug n'affectait pas 411_ATTENTE car son id_ligne_bancaire est NULL.
--
-- Correction : pour les sources avec id_ligne_bancaire non nul, annuler la
-- source (annule = true, libère le slot de l'index unique) et réinsérer le
-- crédit résiduel si le dispatch est partiel.
-- Pour les sources avec id_ligne_bancaire nul (411_ATTENTE), on conserve
-- le mécanisme de correction négative existant.

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
  v_source_total   numeric;
  v_temp           record;
  v_commentaire    text;
  v_dispatched     numeric;
  v_remaining      numeric;
BEGIN
  v_commentaire := 'Dispatché depuis ' || p_numero_411
                 || ' le ' || CURRENT_DATE
                 || ' — opérateur ' || p_operateur;

  SELECT COALESCE(SUM((l->>'montant')::numeric), 0)
  INTO   v_total_dispatch
  FROM   jsonb_array_elements(p_lettrages) AS l;

  IF v_total_dispatch <= 0 THEN
    RAISE EXCEPTION 'Montant dispatch invalide';
  END IF;

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

  IF v_total_dispatch > v_source_total + 0.01 THEN
    RAISE EXCEPTION 'Montant dispatch (%) supérieur au crédit disponible (%)',
      v_total_dispatch, v_source_total;
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
    v_dispatched := ROUND(v_total_dispatch * v_temp.montant / v_source_total, 2);
    v_remaining  := GREATEST(0, v_temp.montant - v_dispatched);

    IF v_temp.id_ligne_bancaire IS NOT NULL THEN
      -- 411_CLIENT : annuler la source pour libérer l'index unique,
      -- puis réinsérer le crédit résiduel si dispatch partiel
      UPDATE lettrages SET annule = true WHERE id = v_temp.id;

      IF v_remaining > 0.005 THEN
        INSERT INTO lettrages (
          id_ligne_bancaire, numero_facture, code_client, montant,
          date_lettrage, mode, commentaire, operateur, organisation_id
        ) VALUES (
          v_temp.id_ligne_bancaire,
          p_numero_411,
          v_temp.code_client,
          v_remaining,
          CURRENT_DATE,
          'manuel',
          v_commentaire,
          p_operateur,
          v_org_id
        );
      END IF;
    ELSE
      -- 411_ATTENTE (id_ligne_bancaire nul) : correction négative existante
      -- (l'index unique ne couvre pas les lignes avec id_ligne_bancaire IS NULL)
      INSERT INTO lettrages (
        id_ligne_bancaire, numero_facture, code_client, montant,
        date_lettrage, mode, commentaire, operateur, organisation_id
      ) VALUES (
        NULL,
        p_numero_411,
        v_temp.code_client,
        -ROUND(v_total_dispatch * v_temp.montant / v_source_total, 2),
        CURRENT_DATE,
        'correction',
        v_commentaire,
        p_operateur,
        v_org_id
      );
    END IF;

    -- Lettrages réels proportionnels sur les factures cibles
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
      'manuel',
      v_commentaire,
      p_operateur,
      v_org_id
    FROM jsonb_array_elements(p_lettrages) AS l
    WHERE (l->>'montant')::numeric > 0;
  END LOOP;
END;
$$;
