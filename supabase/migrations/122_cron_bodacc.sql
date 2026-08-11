SELECT cron.schedule(
  'bodacc-sync-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://PROJECT_REF.supabase.co/functions/v1/bodacc-sync',
    headers := '{"x-cron-secret": "CRON_SECRET_VALUE", "Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'bodacc-alerts-daily',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://PROJECT_REF.supabase.co/functions/v1/bodacc-alerts',
    headers := '{"x-cron-secret": "CRON_SECRET_VALUE", "Content-Type": "application/json"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
