-- Migration 059 : Corriger sync_reste_du pour gérer l'annulation des lettrages
-- Problème : UPDATE lettrages SET annule = true ne change pas montant
--            → trigger calcule OLD.montant - NEW.montant = 0 → reste_du inchangé
--            → la pseudo-facture 411 reste visible après annulation
-- Solution  : détecter le changement du flag annule et ajuster reste_du en conséquence

CREATE OR REPLACE FUNCTION sync_reste_du()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Seulement si le lettrage était actif
    IF OLD.annule = false THEN
      UPDATE factures SET reste_du = reste_du + OLD.montant
      WHERE numero_piece = OLD.numero_facture;
    END IF;

  ELSIF TG_OP = 'INSERT' THEN
    -- Seulement si le nouveau lettrage est actif
    IF NEW.annule = false THEN
      UPDATE factures SET reste_du = reste_du - NEW.montant
      WHERE numero_piece = NEW.numero_facture;
    END IF;

  ELSE -- UPDATE
    IF OLD.annule = false AND NEW.annule = true THEN
      -- Annulation : restituer le montant au reste_du de la facture
      UPDATE factures SET reste_du = reste_du + OLD.montant
      WHERE numero_piece = NEW.numero_facture;

    ELSIF OLD.annule = true AND NEW.annule = false THEN
      -- Réactivation : déduire à nouveau du reste_du
      UPDATE factures SET reste_du = reste_du - NEW.montant
      WHERE numero_piece = NEW.numero_facture;

    ELSIF OLD.annule = false AND NEW.annule = false THEN
      -- Pas de changement sur annule : comportement standard
      IF OLD.numero_facture IS DISTINCT FROM NEW.numero_facture THEN
        UPDATE factures SET reste_du = reste_du + OLD.montant WHERE numero_piece = OLD.numero_facture;
        UPDATE factures SET reste_du = reste_du - NEW.montant WHERE numero_piece = NEW.numero_facture;
      ELSE
        UPDATE factures SET reste_du = reste_du + OLD.montant - NEW.montant
        WHERE numero_piece = NEW.numero_facture;
      END IF;

    -- Cas OLD.annule = true AND NEW.annule = true : rien à faire
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Recalculer reste_du pour les factures dont certains lettrages sont déjà annulés
-- (correction des lignes annulées avant ce correctif)
UPDATE factures f
SET reste_du = f.montant_ttc - COALESCE(
  (SELECT SUM(l.montant) FROM lettrages l
   WHERE l.numero_facture = f.numero_piece AND l.annule = false),
  0
)
WHERE EXISTS (
  SELECT 1 FROM lettrages l
  WHERE l.numero_facture = f.numero_piece AND l.annule = true
);
