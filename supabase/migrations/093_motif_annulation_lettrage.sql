-- Colonne optionnelle pour stocker le motif d'annulation d'un lettrage.
-- Nullable : les annulations passées et celles sans motif saisi restent valides.

ALTER TABLE lettrages
  ADD COLUMN IF NOT EXISTS motif_annulation text;
