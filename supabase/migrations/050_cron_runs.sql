-- Migration 050 : table cron_runs — monitoring des Edge Functions planifiées
-- Générique : organisation_id NULL = run global, uuid = run per-org

CREATE TABLE IF NOT EXISTS cron_runs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fonction        text        NOT NULL,
  organisation_id uuid        REFERENCES organisations(id) ON DELETE SET NULL,
  statut          text        NOT NULL CHECK (statut IN ('ok', 'erreur', 'partiel')),
  nb_traite       integer     NOT NULL DEFAULT 0,
  message         text,
  duree_ms        integer,
  cree_le         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_runs_fonction   ON cron_runs(fonction, cree_le DESC);
CREATE INDEX IF NOT EXISTS idx_cron_runs_org        ON cron_runs(organisation_id, cree_le DESC);

ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;

-- Seul le superadmin peut lire
CREATE POLICY "cron_runs_superadmin_only" ON cron_runs
  FOR SELECT USING (is_superadmin());

-- RPC : 5 derniers runs par (fonction × organisation) avec nom d'org
CREATE OR REPLACE FUNCTION superadmin_get_monitoring(nb integer DEFAULT 5)
RETURNS TABLE (
  id              uuid,
  fonction        text,
  organisation_id uuid,
  org_nom         text,
  statut          text,
  nb_traite       integer,
  message         text,
  duree_ms        integer,
  cree_le         timestamptz,
  rang            integer
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  WITH ranked AS (
    SELECT
      cr.id, cr.fonction, cr.organisation_id,
      o.nom                                            AS org_nom_val,
      cr.statut, cr.nb_traite, cr.message, cr.duree_ms, cr.cree_le,
      ROW_NUMBER() OVER (
        PARTITION BY cr.fonction, COALESCE(cr.organisation_id::text, '##global##')
        ORDER BY cr.cree_le DESC
      )::integer                                       AS rang
    FROM cron_runs cr
    LEFT JOIN organisations o ON o.id = cr.organisation_id
  )
  SELECT id, fonction, organisation_id, org_nom_val, statut, nb_traite, message, duree_ms, cree_le, rang
  FROM ranked
  WHERE rang <= nb
  ORDER BY fonction, COALESCE(organisation_id::text, ''), cree_le DESC;
$$;
