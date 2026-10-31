-- Migration 178 : ouvrir ref_valeurs aux catégories de configuration
--
-- Exécutée à la main dans l'éditeur SQL Supabase le 2026-10-31.
-- Ce fichier n'est là que pour la trace — ne pas le rejouer.
--
-- Contexte : l'onglet Règles des paramètres de relances stocke son seuil
-- "Sans suite" dans ref_valeurs avec categorie = 'config_seuil_sans_suite'.
-- Or la contrainte CHECK en place (migration 065) n'autorisait que
-- 'commercial', 'operateur', 'plateforme', 'format_facture'.
--
-- Conséquence constatée : l'INSERT échouait à chaque enregistrement, aucune
-- ligne 'config_seuil_sans_suite' n'existait en base, et l'application
-- retombait silencieusement sur le défaut codé en dur (30 jours). Le réglage
-- saisi par l'utilisateur n'a jamais pris effet depuis la mise en service.
--
-- Le motif 'config%' évite de revenir en base à chaque nouveau réglage
-- (délai d'archivage, écart de l'alerte, etc.). La contrainte est élargie,
-- pas affaiblie : aucune donnée touchée, aucune policy RLS modifiée.

ALTER TABLE ref_valeurs DROP CONSTRAINT IF EXISTS ref_valeurs_categorie_check;

ALTER TABLE ref_valeurs ADD CONSTRAINT ref_valeurs_categorie_check
  CHECK (
    categorie IN ('commercial', 'operateur', 'plateforme', 'format_facture')
    OR categorie LIKE 'config%'
  );
