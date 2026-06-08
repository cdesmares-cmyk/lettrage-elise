-- Normalisation des listes de référence commercial/opérateur/plateforme
-- Purge + reconstruction depuis les valeurs distinctes en base clients

-- Fonction de capitalisation mot à mot (Bouillod Jean, pas BOUILLOD ou bouillod)
CREATE OR REPLACE FUNCTION capitaliser_mots(v text) RETURNS text AS $$
  SELECT string_agg(
    upper(substring(word, 1, 1)) || lower(substring(word, 2)),
    ' '
  )
  FROM regexp_split_to_table(trim(regexp_replace(v, '\s+', ' ', 'g')), ' ') AS word
  WHERE word <> '';
$$ LANGUAGE sql IMMUTABLE;

-- Normaliser les valeurs existantes sur les fiches clients
UPDATE clients
SET commercial = capitaliser_mots(commercial)
WHERE commercial IS NOT NULL AND trim(commercial) <> '';

UPDATE clients
SET operateur = capitaliser_mots(operateur)
WHERE operateur IS NOT NULL AND trim(operateur) <> '';

UPDATE clients
SET plateforme = capitaliser_mots(plateforme)
WHERE plateforme IS NOT NULL AND trim(plateforme) <> '';

-- Purge des listes de référence (hors format_facture)
DELETE FROM ref_valeurs WHERE categorie IN ('commercial', 'operateur', 'plateforme');

-- Reconstruction depuis les clients (valeurs normalisées)
INSERT INTO ref_valeurs (categorie, valeur)
SELECT DISTINCT 'commercial', capitaliser_mots(commercial)
FROM clients
WHERE commercial IS NOT NULL AND trim(commercial) <> '';

INSERT INTO ref_valeurs (categorie, valeur)
SELECT DISTINCT 'operateur', capitaliser_mots(operateur)
FROM clients
WHERE operateur IS NOT NULL AND trim(operateur) <> '';

INSERT INTO ref_valeurs (categorie, valeur)
SELECT DISTINCT 'plateforme', capitaliser_mots(plateforme)
FROM clients
WHERE plateforme IS NOT NULL AND trim(plateforme) <> '';
