-- ══════════════════════════════════════════════════════════════════════
-- Migration 139 — Correction trigger maj_timestamp sur commentaires
-- maj_timestamp() écrit sur mis_a_jour_le qui n'existe pas dans cette table
-- La colonne s'appelle modifie_le → fonction dédiée
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION maj_modifie_le()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.modifie_le = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS commentaires_maj_ts ON public.commentaires;

CREATE TRIGGER commentaires_maj_ts
  BEFORE UPDATE ON public.commentaires
  FOR EACH ROW EXECUTE FUNCTION maj_modifie_le();
