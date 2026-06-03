-- RPC : CA net sur une période donnée
-- Sécurisée par RLS via get_my_organisation_id(), appelée uniquement au démarrage
-- ou lorsque moisMax évolue (nouvel import) — jamais sur les polls 60s

CREATE OR REPLACE FUNCTION get_ca_periode(p_debut date, p_fin date)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(montant_ttc), 0)
  FROM factures
  WHERE organisation_id = get_my_organisation_id()
    AND date_emission BETWEEN p_debut AND p_fin
    AND est_avoir = false
    AND numero_piece NOT LIKE '%\_compte'
$$;
