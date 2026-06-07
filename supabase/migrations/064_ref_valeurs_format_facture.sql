-- Migration 064 : Ajout de la catégorie 'format_facture' dans ref_valeurs
-- Permet à chaque organisation de configurer ses propres exemples de numéros de facture
-- pour la détection automatique dans le navigateur de factures.

ALTER TABLE ref_valeurs DROP CONSTRAINT IF EXISTS ref_valeurs_categorie_check;

ALTER TABLE ref_valeurs ADD CONSTRAINT ref_valeurs_categorie_check
  CHECK (categorie IN ('commercial', 'operateur', 'plateforme', 'format_facture'));
