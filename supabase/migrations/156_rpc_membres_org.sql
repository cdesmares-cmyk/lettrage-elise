-- Migration 156 : RPC membres org avec email (pour @mention + invitations calendrier)
-- SECURITY DEFINER permet de lire auth.users (normalement restreint)

CREATE OR REPLACE FUNCTION get_membres_org()
RETURNS TABLE (id uuid, nom text, prenom text, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id, u.nom, u.prenom, a.email
  FROM utilisateurs u
  JOIN auth.users a ON a.id = u.id
  WHERE u.organisation_id = get_my_organisation_id()
    AND u.role != 'externe'
  ORDER BY u.nom, u.prenom
$$;
