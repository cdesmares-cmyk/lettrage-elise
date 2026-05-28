-- Migration 043 : suppression FK lettrages.id_ligne_bancaire
-- Permet les ID synthétiques (ex: "2026040558-C") pour les corrections lettrages
-- L'intégrité est garantie au niveau applicatif : vrais lettrages = id existant, corrections = suffixe -C

ALTER TABLE lettrages DROP CONSTRAINT IF EXISTS lettrages_id_ligne_bancaire_fkey;
