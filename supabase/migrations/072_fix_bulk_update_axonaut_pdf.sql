-- Migration 072 : correction bulk_update_axonaut_pdf
--
-- Bug : UPDATE dans un CTE imbriqué dans RETURN() → PostgreSQL error 0A000
-- "WITH clause containing a data-modifying statement must be at the top level"
--
-- Fix : déplacer le CTE au niveau racine d'un SELECT INTO

CREATE OR REPLACE FUNCTION bulk_update_axonaut_pdf(
  updates  jsonb,
  org_id   uuid
)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int;
BEGIN
  IF auth.uid() IS NOT NULL AND org_id IS DISTINCT FROM get_my_organisation_id() THEN
    RAISE EXCEPTION 'Accès refusé : organisation non autorisée';
  END IF;

  WITH upd AS (
    UPDATE factures f
    SET axonaut_pdf_url = u->>'pdf_url'
    FROM jsonb_array_elements(updates) AS u
    WHERE f.numero_piece = u->>'numero_piece'
      AND f.organisation_id = org_id
    RETURNING 1
  )
  SELECT count(*)::int INTO v_count FROM upd;

  RETURN v_count;
END;
$$;
