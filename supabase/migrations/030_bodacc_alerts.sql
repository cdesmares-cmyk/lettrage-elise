-- Migration 030 : Phase email BODACC
-- 1. RPC encours_client : encours HT + TTC pour un client donné
-- 2. Cron bodacc-send-alerts : envoi quotidien à 7h30

-- Calcule l'encours HT et TTC restant (factures non soldées, hors avoirs)
CREATE OR REPLACE FUNCTION encours_client(p_code_client text, p_organisation_id uuid)
RETURNS TABLE(encours_ht numeric, encours_ttc numeric)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(SUM(
      CASE WHEN f.montant_ttc > 0
        THEN f.montant_ht * (f.reste_du / f.montant_ttc)
        ELSE 0
      END
    ), 0)::numeric(12,2) AS encours_ht,
    COALESCE(SUM(f.reste_du), 0)::numeric(12,2) AS encours_ttc
  FROM factures f
  WHERE f.code_client      = p_code_client
    AND f.organisation_id  = p_organisation_id
    AND f.reste_du         > 0.005
    AND f.est_avoir        = false
$$;

-- Cron : envoi des alertes email chaque jour à 7h30
-- À exécuter manuellement dans le SQL Editor après avoir déployé l'Edge Function bodacc-alerts
-- (remplacer PROJECT_REF et SERVICE_ROLE_KEY par les vraies valeurs)

-- SELECT cron.schedule(
--   'bodacc-send-alerts',
--   '30 7 * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://PROJECT_REF.supabase.co/functions/v1/bodacc-alerts',
--     headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $$
-- );
