-- Migration 080 : Cron relance-auto quotidien à 8h00 UTC
-- ⚠️  À exécuter manuellement dans le SQL Editor de Supabase
-- Prérequis : extensions pg_cron et pg_net activées (Database > Extensions)
-- Valeurs à renseigner : Project Settings > General (ref) et API (service_role)

-- ── Planifier le cron ─────────────────────────────────────────────────────────
-- SELECT cron.schedule(
--   'relance-auto-daily',
--   '0 8 * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://PROJECT_REF.supabase.co/functions/v1/relance-auto',
--     headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $$
-- );

-- ── Vérifier les crons actifs ─────────────────────────────────────────────────
-- SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname;

-- ── Supprimer le cron (si besoin de recréer) ─────────────────────────────────
-- SELECT cron.unschedule('relance-auto-daily');
