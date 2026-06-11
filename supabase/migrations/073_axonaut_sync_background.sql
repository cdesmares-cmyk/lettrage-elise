-- Migration 073 : sync Axonaut en arrière-plan (pg_cron + pg_net)
--
-- Ajoute l'état de synchronisation dans integrations et un cron toutes les 2 min.
-- Le cron appelle l'Edge Function axonaut-sync avec action=sync_step.
--
-- PRÉREQUIS (à exécuter une seule fois dans SQL Editor) :
--   ALTER DATABASE postgres SET app.supabase_url = 'https://aqxsqmgtmenjpfrblqoe.supabase.co';
--   ALTER DATABASE postgres SET app.service_role_key = '<VOTRE_SERVICE_ROLE_KEY>';

-- ── Colonnes d'état sur integrations ────────────────────────────────────────
ALTER TABLE integrations
  ADD COLUMN IF NOT EXISTS sync_actif            boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_page_courante    int         DEFAULT 1,
  ADD COLUMN IF NOT EXISTS sync_stats            jsonb       DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sync_verrou_expire_le timestamptz,
  ADD COLUMN IF NOT EXISTS sync_dernier_rapport  jsonb;

-- ── Fonction appelée par pg_cron ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION declencher_axonaut_sync_step()
RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  r   RECORD;
  v_url text;
  v_key text;
BEGIN
  v_url := current_setting('app.supabase_url',    true);
  v_key := current_setting('app.service_role_key', true);

  -- Silencieux si les settings ne sont pas encore configurés
  IF v_url IS NULL OR v_key IS NULL THEN RETURN; END IF;

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

-- ── Planification du cron (toutes les 2 minutes) ─────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('axonaut-sync-step');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'axonaut-sync-step',
  '*/2 * * * *',
  'SELECT declencher_axonaut_sync_step()'
);
