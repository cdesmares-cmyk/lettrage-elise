-- Migration 073b : patch — valeurs hardcodées dans la fonction cron
-- (ALTER DATABASE non autorisé dans Supabase SQL Editor)
--
-- Remplacer TON_SERVICE_ROLE_KEY par la clef visible dans
-- Dashboard Supabase > Settings > API > service_role

CREATE OR REPLACE FUNCTION declencher_axonaut_sync_step()
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r     RECORD;
  v_url text := 'https://aqxsqmgtmenjpfrblqoe.supabase.co';
  v_key text := 'TON_SERVICE_ROLE_KEY';
BEGIN
  FOR r IN
    SELECT organisation_id
    FROM   integrations
    WHERE  provider    = 'axonaut'
      AND  actif       = true
      AND  sync_actif  = true
      AND  (sync_verrou_expire_le IS NULL OR sync_verrou_expire_le < now())
  LOOP
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/axonaut-sync',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object(
        'action', 'sync_step',
        'org_id', r.organisation_id
      ),
      timeout_milliseconds := 90000
    );
  END LOOP;
END;
$$;
