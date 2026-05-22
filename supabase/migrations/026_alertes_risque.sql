-- Migration 026 : Table alertes_risque — veille BODACC
-- Stocke les événements BODACC-B (procédures collectives) et BODACC-C (radiations)
-- détectés sur les clients ayant un SIRET renseigné.

CREATE TABLE IF NOT EXISTS alertes_risque (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id   uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code_client       text        NOT NULL,
  siret             text        NOT NULL,
  bodacc_id         text        NOT NULL,   -- recordid BODACC — clé de déduplication
  famille           text        NOT NULL,   -- 'BODACC-B' | 'BODACC-C'
  type_procedure    text        NOT NULL,   -- 'liquidation' | 'redressement' | 'sauvegarde' | 'radiation' | 'cloture'
  tribunal          text,
  date_jugement     date,
  date_parution     date,
  description       text,
  lu                boolean     NOT NULL DEFAULT false,
  cree_le           timestamptz NOT NULL DEFAULT now(),

  UNIQUE (organisation_id, bodacc_id)
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_alertes_organisation   ON alertes_risque(organisation_id);
CREATE INDEX IF NOT EXISTS idx_alertes_code_client    ON alertes_risque(code_client);
CREATE INDEX IF NOT EXISTS idx_alertes_non_lues       ON alertes_risque(organisation_id, lu) WHERE lu = false;

-- Trigger auto-injection organisation_id
CREATE TRIGGER set_organisation_id_alertes_risque
  BEFORE INSERT ON alertes_risque
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

-- RLS
ALTER TABLE alertes_risque ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertes_risque_org_isolation" ON alertes_risque
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- ─── Cron quotidien à 6h (à exécuter séparément dans Supabase SQL Editor) ────
-- Nécessite l'extension pg_cron + pg_net activées dans votre projet.
--
-- SELECT cron.schedule(
--   'bodacc-daily',
--   '0 6 * * *',
--   $$
--     SELECT net.http_post(
--       url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/bodacc-sync',
--       headers := jsonb_build_object(
--         'Content-Type',  'application/json',
--         'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--       ),
--       body    := '{}'::jsonb
--     );
--   $$
-- );
