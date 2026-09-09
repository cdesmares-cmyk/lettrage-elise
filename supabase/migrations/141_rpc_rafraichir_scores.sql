-- Migration 141 : wrapper RPC pour déclencher le recalcul des scores depuis l'UI
--
-- Accessible aux rôles admin et responsable_poste_client uniquement.
-- Récupère l'org de l'utilisateur connecté via auth.uid() — pas de param exposé.

CREATE OR REPLACE FUNCTION rafraichir_scores_org()
RETURNS TABLE(clients_traites INT, alertes_inserees INT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_org_id UUID;
  v_role   TEXT;
BEGIN
  SELECT organisation_id, role INTO v_org_id, v_role
  FROM utilisateurs WHERE id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'utilisateur non trouvé';
  END IF;

  IF v_role NOT IN ('admin', 'responsable_poste_client') THEN
    RAISE EXCEPTION 'accès refusé';
  END IF;

  RETURN QUERY SELECT * FROM calculer_scores_org(v_org_id);
END;
$$;
