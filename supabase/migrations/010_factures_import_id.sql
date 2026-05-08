-- Migration 010 : import_id sur factures + trigger init reste_du à l'insertion

-- Traçabilité : savoir quel import a créé chaque facture (permet l'annulation)
ALTER TABLE factures
  ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES imports(id);

CREATE INDEX IF NOT EXISTS idx_factures_import_id ON factures(import_id);

-- Trigger : initialise reste_du = montant_ttc pour toute nouvelle facture insérée
-- (le trigger lettrages gère ensuite les mises à jour)
CREATE OR REPLACE FUNCTION init_reste_du_facture()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reste_du IS NULL THEN
    NEW.reste_du := NEW.montant_ttc;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_reste_du_facture ON factures;
CREATE TRIGGER trg_init_reste_du_facture
  BEFORE INSERT ON factures
  FOR EACH ROW EXECUTE FUNCTION init_reste_du_facture();
