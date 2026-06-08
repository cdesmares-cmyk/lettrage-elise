-- Code organisation lisible — C-000001 — visible dans l'interface pour le support
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS code_org text;

-- Séquence pour auto-incrément
CREATE SEQUENCE IF NOT EXISTS organisations_code_seq START 1;

-- Backfill des organisations existantes dans l'ordre de création
DO $$
DECLARE
  rec RECORD;
  n   int := 1;
BEGIN
  FOR rec IN SELECT id FROM organisations ORDER BY created_at ASC NULLS LAST LOOP
    UPDATE organisations
    SET code_org = 'C-' || lpad(n::text, 6, '0')
    WHERE id = rec.id AND code_org IS NULL;
    n := n + 1;
  END LOOP;
END;
$$;

-- Index unique pour garantir l'unicité des codes
CREATE UNIQUE INDEX IF NOT EXISTS organisations_code_org_uidx ON organisations (code_org) WHERE code_org IS NOT NULL;
