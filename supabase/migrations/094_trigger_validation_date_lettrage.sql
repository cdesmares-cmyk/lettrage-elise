-- Vérifie côté serveur que date_lettrage correspond bien à la date_operation
-- de la ligne bancaire associée. S'applique uniquement aux lettrages avec
-- id_ligne_bancaire réel (exclut les corrections à ID synthétique).

CREATE OR REPLACE FUNCTION fn_valider_date_lettrage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_date_operation date;
BEGIN
  -- Pas de validation pour les lignes sans référence bancaire (corrections synthétiques)
  IF NEW.id_ligne_bancaire IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT DATE(date_operation) INTO v_date_operation
  FROM lignes_bancaires
  WHERE id_operation = NEW.id_ligne_bancaire;

  -- Ligne bancaire introuvable : on laisse passer (FK gérée ailleurs)
  IF v_date_operation IS NULL THEN
    RETURN NEW;
  END IF;

  IF DATE(NEW.date_lettrage) != v_date_operation THEN
    RAISE EXCEPTION
      'date_lettrage (%) ne correspond pas à la date_operation de la ligne bancaire (%).',
      NEW.date_lettrage, v_date_operation;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_valider_date_lettrage ON lettrages;

CREATE TRIGGER tr_valider_date_lettrage
BEFORE INSERT ON lettrages
FOR EACH ROW
EXECUTE FUNCTION fn_valider_date_lettrage();
