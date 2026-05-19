-- Migration 021 : Fonction batch pour mise à jour des PDF URLs Axonaut
-- Remplace les 500 UPDATE individuels par un seul appel SQL

CREATE OR REPLACE FUNCTION bulk_update_axonaut_pdf(updates jsonb, org_id uuid)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH upd AS (
    UPDATE factures f
    SET axonaut_pdf_url = u->>'pdf_url'
    FROM jsonb_array_elements(updates) AS u
    WHERE f.numero_piece = u->>'numero_piece'
      AND f.organisation_id = org_id
    RETURNING 1
  )
  SELECT count(*)::int FROM upd;
$$;
