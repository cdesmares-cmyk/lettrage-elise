-- Migration 097 : Extension de creer_export_comptable pour inclure les compensations avoir/facture.
-- Les lignes de compensation (id_ligne_bancaire IS NULL, compensation_id IS NOT NULL)
-- dans la période sont verrouillées (export_id posé) au même titre que les lettrages bancaires.
-- Une fois exportées, elles ne peuvent plus être annulées.

CREATE OR REPLACE FUNCTION creer_export_comptable(
  p_date_debut date,
  p_date_fin   date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid := get_my_organisation_id();
  v_export_id   uuid;
  v_nb          integer;
  v_montant     numeric(12,2);
  v_nb_comp     integer;
BEGIN
  -- Créer le batch (compteurs mis à jour après)
  INSERT INTO exports_comptables (organisation_id, date_debut, date_fin, nb_lettrages, montant_total)
  VALUES (v_org_id, p_date_debut, p_date_fin, 0, 0)
  RETURNING id INTO v_export_id;

  -- Verrouiller les lettrages des lignes bancaires 100% lettrées non encore exportés
  WITH lignes_lettrees AS (
    SELECT lb.id_operation
    FROM   lignes_bancaires lb
    LEFT   JOIN lettrages l
           ON  l.id_ligne_bancaire = lb.id_operation
           AND l.organisation_id   = v_org_id
           AND l.annule            = false
    WHERE  lb.organisation_id = v_org_id
      AND  lb.date_operation   BETWEEN p_date_debut AND p_date_fin
      AND  lb.credit           IS NOT NULL
      AND  lb.credit           > 0
    GROUP  BY lb.id_operation, lb.credit
    HAVING ABS(COALESCE(lb.credit, 0) - COALESCE(SUM(l.montant), 0)) < 0.005
  ),
  verrouilles AS (
    UPDATE lettrages
    SET    export_id = v_export_id
    WHERE  organisation_id    = v_org_id
      AND  annule             = false
      AND  export_id          IS NULL
      AND  id_ligne_bancaire  IN (SELECT id_operation FROM lignes_lettrees)
    RETURNING montant
  )
  SELECT COUNT(*)::integer, COALESCE(SUM(montant), 0)::numeric(12,2)
  INTO   v_nb, v_montant
  FROM   verrouilles;

  -- Verrouiller les compensations avoir/facture de la période (non encore exportées)
  WITH comp_ids AS (
    SELECT DISTINCT compensation_id
    FROM   lettrages
    WHERE  organisation_id    = v_org_id
      AND  compensation_id    IS NOT NULL
      AND  id_ligne_bancaire  IS NULL
      AND  annule             = false
      AND  export_id          IS NULL
      AND  date_lettrage      BETWEEN p_date_debut AND p_date_fin
  ),
  verrouilles_comp AS (
    UPDATE lettrages
    SET    export_id = v_export_id
    WHERE  organisation_id  = v_org_id
      AND  compensation_id  IN (SELECT compensation_id FROM comp_ids)
      AND  annule           = false
      AND  export_id        IS NULL
    RETURNING id
  )
  SELECT COUNT(*)::integer INTO v_nb_comp FROM verrouilles_comp;

  -- Annuler si rien à verrouiller (tout déjà exporté ou aucune ligne éligible)
  IF v_nb = 0 AND v_nb_comp = 0 THEN
    DELETE FROM exports_comptables WHERE id = v_export_id;
    RAISE EXCEPTION 'Aucune ligne éligible : toutes les lignes 100%% lettrées et compensations de cette période sont déjà verrouillées';
  END IF;

  UPDATE exports_comptables
  SET    nb_lettrages = v_nb + v_nb_comp, montant_total = v_montant
  WHERE  id = v_export_id;

  RETURN json_build_object(
    'export_id',      v_export_id::text,
    'nb_lettrages',   v_nb,
    'nb_compensations', v_nb_comp,
    'montant_total',  v_montant
  );
END;
$$;
