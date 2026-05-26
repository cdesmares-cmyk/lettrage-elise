-- Migration 037 : Crons score-calc (6h00) + score-digest (7h30)
-- ⚠️  À exécuter manuellement dans le SQL Editor de Supabase
-- Prérequis : extensions pg_cron et pg_net activées (Database > Extensions)
-- Valeurs à renseigner : Project Settings > General (ref) et API (service_role)

-- ── 1. Calcul quotidien des scores à 6h00 UTC ────────────────────────────────
-- SELECT cron.schedule(
--   'score-calc-daily',
--   '0 6 * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://PROJECT_REF.supabase.co/functions/v1/score-calc',
--     headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $$
-- );

-- ── 2. Digest email alertes à 7h30 UTC (après score-calc) ────────────────────
-- SELECT cron.schedule(
--   'score-digest-daily',
--   '30 7 * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://PROJECT_REF.supabase.co/functions/v1/score-digest',
--     headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY", "Content-Type": "application/json"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $$
-- );

-- ── Vérifier les crons actifs ─────────────────────────────────────────────────
-- SELECT jobname, schedule, command, active FROM cron.job ORDER BY jobname;

-- ── Supprimer un cron (si besoin de recréer) ─────────────────────────────────
-- SELECT cron.unschedule('score-calc-daily');
-- SELECT cron.unschedule('score-digest-daily');
