ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS raison_sociale   text,
  ADD COLUMN IF NOT EXISTS forme_juridique  text,
  ADD COLUMN IF NOT EXISTS siren            text,
  ADD COLUMN IF NOT EXISTS siret            text,
  ADD COLUMN IF NOT EXISTS tva_number       text;
