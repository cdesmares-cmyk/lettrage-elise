-- Migration 065 : Correctifs ref_valeurs
-- 1. Trigger inject_organisation_id manquant (oubli migration 019)
--    Sans ce trigger, les INSERTs échouent silencieusement (RLS bloque org_id NULL)
-- 2. Nettoyage des contraintes CHECK sur categorie :
--    supprime TOUTES les contraintes CHECK existantes sur la colonne (nom incertain)
--    et recrée une contrainte propre incluant 'format_facture'

-- ── 1. Trigger manquant ──────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS ref_valeurs_inject_org_id ON ref_valeurs;
CREATE TRIGGER ref_valeurs_inject_org_id
  BEFORE INSERT ON ref_valeurs
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

-- ── 2. Nettoyage des CHECK sur categorie ────────────────────────────────────
-- Supprime toutes les contraintes CHECK portant sur la colonne categorie,
-- quel que soit leur nom auto-généré.

DO $$
DECLARE
  c text;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att
      ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'ref_valeurs'
      AND con.contype = 'c'
      AND att.attname = 'categorie'
  LOOP
    EXECUTE format('ALTER TABLE ref_valeurs DROP CONSTRAINT IF EXISTS %I', c);
  END LOOP;
END $$;

ALTER TABLE ref_valeurs ADD CONSTRAINT ref_valeurs_categorie_check
  CHECK (categorie IN ('commercial', 'operateur', 'plateforme', 'format_facture'));
