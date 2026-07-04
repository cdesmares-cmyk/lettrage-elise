-- Migration 082 : suppression de la surcharge delai_alerte_jours par client
-- La personnalisation par client est retirée — le seuil org s'applique à tous.
-- On remet à NULL pour que le COALESCE dans le calcul du score_risque
-- tombe systématiquement sur le paramètre organisation.

UPDATE clients SET delai_alerte_jours = NULL WHERE delai_alerte_jours IS NOT NULL;
