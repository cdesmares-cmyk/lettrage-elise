-- Empêche la suppression d'une ligne bancaire si des lettrages actifs (non annulés) y sont rattachés.
-- Les lettrages orphelins fausseraient les calculs d'encours et les exports comptables.

CREATE OR REPLACE FUNCTION fn_bloquer_suppression_ligne_lettree()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM lettrages
  WHERE id_ligne_bancaire = OLD.id_operation
    AND annule = false;

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Impossible de supprimer la ligne bancaire % : % lettrage(s) actif(s) y sont rattachés. Annulez les lettrages avant de supprimer la ligne.',
      OLD.id_operation, v_count;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_bloquer_suppression_ligne_lettree ON lignes_bancaires;

CREATE TRIGGER tr_bloquer_suppression_ligne_lettree
BEFORE DELETE ON lignes_bancaires
FOR EACH ROW
EXECUTE FUNCTION fn_bloquer_suppression_ligne_lettree();
