-- Migration 095 — Correction du trigger on_auth_user_created
-- Migration 090 avait renommé nom_affiche → nom et ajouté prenom + initiales
-- mais le trigger n'avait pas été mis à jour.
-- Résultat : toute invitation via GoTrue échouait silencieusement avec {}.

CREATE OR REPLACE FUNCTION on_auth_user_created()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nom text;
BEGIN
  v_nom := split_part(NEW.email, '@', 1);
  INSERT INTO utilisateurs (id, email, nom, prenom, initiales)
  VALUES (NEW.id, NEW.email, v_nom, '', UPPER(LEFT(v_nom, 3)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
