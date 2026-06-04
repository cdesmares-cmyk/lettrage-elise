-- Phase 3 : RPC atomique dispatch 411
-- Supprime le(s) lettrage(s) temporaire(s) et crée les vrais lettrages en une transaction

CREATE OR REPLACE FUNCTION dispatch_411(
  p_numero_411   text,
  p_date_lettrage date,
  p_operateur    text,
  p_lettrages    jsonb   -- [{numero_facture, code_client, montant}]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid := get_my_organisation_id();
  v_total       numeric;
  v_temp        record;
  v_commentaire text;
BEGIN
  v_commentaire := 'Dispatché depuis ' || p_numero_411
                 || ' le ' || p_date_lettrage
                 || ' — opérateur ' || p_operateur;

  -- Total des montants à dispatcher
  SELECT COALESCE(SUM((l->>'montant')::numeric), 0)
  INTO   v_total
  FROM   jsonb_array_elements(p_lettrages) AS l;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Montant dispatch invalide';
  END IF;

  -- Pour chaque ligne bancaire qui a contribué au compte 411
  FOR v_temp IN
    SELECT id, id_ligne_bancaire, montant
    FROM   lettrages
    WHERE  numero_facture  = p_numero_411
      AND  organisation_id = v_org_id
    ORDER  BY id
  LOOP
    -- Supprimer le lettrage temporaire (trigger : 411.reste_du remonte vers 0)
    DELETE FROM lettrages WHERE id = v_temp.id;

    -- Créer les vrais lettrages proportionnels pour cette ligne bancaire
    INSERT INTO lettrages (
      id_ligne_bancaire, numero_facture, code_client, montant,
      date_lettrage, mode, commentaire, operateur, organisation_id
    )
    SELECT
      v_temp.id_ligne_bancaire,
      NULLIF(TRIM(l->>'numero_facture'), ''),
      TRIM(l->>'code_client'),
      ROUND((l->>'montant')::numeric * v_temp.montant / v_total, 2),
      p_date_lettrage,
      'manuel',
      v_commentaire,
      p_operateur,
      v_org_id
    FROM jsonb_array_elements(p_lettrages) AS l
    WHERE (l->>'montant')::numeric > 0;
  END LOOP;
END;
$$;
