-- Migration 023 : Ajout du flag "Ne pas relancer" sur les commentaires de factures
-- Ce champ permet d'exclure une facture du système de relance (mail + Top 10)
-- sans la masquer du compte client ou de l'encours.

ALTER TABLE commentaires_factures
  ADD COLUMN IF NOT EXISTS ne_pas_relancer boolean NOT NULL DEFAULT false;
