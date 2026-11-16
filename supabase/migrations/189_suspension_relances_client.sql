-- Migration 189 : suspendre les relances d'un compte client
--
-- POURQUOI. Quatre mecanismes voisins existent deja, et aucun ne fait ca :
--
--   relance_auto_active       bloque LE ROBOT seulement. Un operateur peut
--                             toujours relancer a la main.
--   est_gele                  n'est pas une decision : il est CALCULE depuis le
--                             statut juridique et le BODACC. Il avertit, il ne
--                             bloque rien.
--   alerte_snooze_jusqu_au    met en pause L'ALERTE, pas la relance, et
--                             temporairement.
--   ne_pas_relancer           porte sur UNE FACTURE, pas sur le compte.
--
-- Il manquait donc : un blocage des DEUX canaux, au niveau du COMPTE, par
-- DECISION HUMAINE, et durable. C'est ce que ces colonnes apportent.
--
-- GEL ET STOP NE DISENT PAS LA MEME CHOSE, et la distinction est le coeur du
-- sujet. Arretee avec Clement le 2026-11-16 :
--
--   GEL   « on sait qu'on ne devrait pas relancer, mais on en garde la
--          possibilite ». Constat automatique, consultatif.
--   STOP  « aucune relance possible ». Blocage manuel, assume, trace.
--
-- LE MOTIF EST OBLIGATOIRE, et c'est l'inverse du choix fait pour les echanges
-- hors Ockham. La raison : un appel trace sans detail reste utile, alors qu'un
-- compte suspendu sans motif est un mystere dans trois mois. Personne n'osera
-- le reactiver sans savoir pourquoi il a ete bloque, et la decision survivra a
-- celui qui l'a prise. Le front refuse la suspension tant que le champ est
-- vide ; aucune contrainte CHECK ici, parce qu'une ligne existante mise a jour
-- par un script ne doit pas echouer pour autant.
--
-- PAS DE DATE DE FIN. La suspension dure tant que quelqu'un ne la leve pas. Le
-- garde-fou n'est pas une expiration automatique mais un filtre : l'ecran
-- Compte client permet d'afficher les comptes suspendus pour les passer en
-- revue. Sans ce filtre, on creerait un cimetiere de creances oubliees, ce
-- qu'un outil de recouvrement ne doit surtout pas faire.
--
-- CE QUI NE CHANGE PAS, et c'est l'arbitrage de Clement : le compte reste dans
-- le perimetre. Il reste dans les listes de travail, son encours reste compte
-- dans tous les KPI, son niveau de relance continue d'etre calcule. SEULES les
-- relances sont bloquees. Aucun chiffre ne bouge, donc rien ne peut diverger
-- en silence.
--
-- LES TROIS CANAUX DOIVENT BLOQUER : relance manuelle, relance en masse, et
-- robot. Si un seul passait, le bouton mentirait. Le robot vit hors du depot
-- et demande un deploiement separe de l'Edge Function : TANT QU'IL N'EST PAS
-- FAIT, LE ROBOT CONTINUE DE RELANCER UN COMPTE MARQUE STOP.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS relance_bloquee       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS relance_bloquee_motif text,
  ADD COLUMN IF NOT EXISTS relance_bloquee_le    timestamptz,
  ADD COLUMN IF NOT EXISTS relance_bloquee_par   uuid;

COMMENT ON COLUMN clients.relance_bloquee IS
  'STOP : aucune relance possible depuis Ockham, ni manuelle, ni en masse, ni '
  'automatique. Decision humaine, a distinguer de est_gele qui est calcule et '
  'seulement consultatif. Les appels et mails hors Ockham restent permis.';

COMMENT ON COLUMN clients.relance_bloquee_motif IS
  'Obligatoire a la saisie : un compte suspendu sans motif est inexploitable '
  'une fois son auteur parti. Texte libre, sans limite de longueur.';


-- ── La vue doit exposer les nouvelles colonnes ──────────────────────────────
--
-- v_comptes_clients liste ses colonnes explicitement : sans cette reecriture,
-- le front ne verrait jamais l'indicateur.
--
-- CREATE OR REPLACE et non DROP CASCADE, contrairement a la migration 150. Un
-- DROP CASCADE emporte silencieusement tout objet dependant : si une vue ou
-- une fonction s'appuie dessus aujourd'hui, elle disparaitrait sans que rien
-- ne le dise. Le prix a payer : les nouvelles colonnes ne peuvent etre
-- AJOUTEES QU'A LA FIN, l'ordre des colonnes existantes etant fige.
CREATE OR REPLACE VIEW v_comptes_clients
WITH (security_invoker = true)
AS
SELECT
  c.code_dso,
  c.nom,
  c.statut_juridique,
  c.commercial,
  c.commercial_id,
  c.operateur,
  c.plateforme,
  c.code_groupement,
  c.organisation_id,
  c.siret,
  c.relance_auto_alerte,
  c.note_client,
  c.a_suivre,
  COUNT(f.numero_piece)::int                                                    AS nb_factures_total,
  COUNT(CASE WHEN f.reste_du > 0.005 AND f.est_avoir = false THEN 1 END)::int  AS nb_impayees,
  COALESCE(
    SUM(CASE WHEN f.reste_du > 0.005 AND f.est_avoir = false THEN f.reste_du ELSE 0 END),
    0
  )::numeric(12,2)                                                              AS encours_total,
  COALESCE(
    SUM(CASE WHEN ABS(f.reste_du) > 0.005 THEN f.reste_du ELSE 0 END),
    0
  )::numeric(12,2)                                                              AS encours_net,
  MAX(f.date_emission)                                                          AS derniere_emission,
  MAX(a.score_risque)::int                                                      AS score_risque,
  -- Nouvelles colonnes, obligatoirement en fin de liste.
  c.relance_bloquee,
  c.relance_bloquee_motif,
  c.relance_bloquee_le,
  c.relance_bloquee_par
FROM clients c
LEFT JOIN factures f ON f.code_client = c.code_dso
                     AND f.organisation_id = c.organisation_id
LEFT JOIN alertes_score a ON a.organisation_id = c.organisation_id
                          AND a.code_client = c.code_dso
                          AND a.date_calcul = CURRENT_DATE
GROUP BY
  c.code_dso, c.nom, c.statut_juridique, c.commercial, c.commercial_id,
  c.operateur, c.plateforme, c.code_groupement, c.organisation_id, c.siret,
  c.relance_auto_alerte, c.note_client, c.a_suivre,
  c.relance_bloquee, c.relance_bloquee_motif, c.relance_bloquee_le,
  c.relance_bloquee_par;


-- ═══════════════════════════════════════════════════════════════════════════
--  CONTROLES APRES EXECUTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Les quatre colonnes existent, et aucun compte n'est suspendu.
--
--    SELECT relance_bloquee, count(*) FROM clients GROUP BY relance_bloquee;
--    -- attendu : une seule ligne, false
--
--
-- 2. LE CONTROLE QUI COMPTE : la vue n'a RIEN perdu. Elle est lue au demarrage
--    de l'application, une colonne disparue casserait l'ecran Compte client.
--
--    SELECT count(*) AS nb_colonnes
--    FROM   information_schema.columns
--    WHERE  table_name = 'v_comptes_clients';
--    -- attendu : 23 (19 d'origine + 4 ajoutees)
--
--    SELECT column_name, ordinal_position
--    FROM   information_schema.columns
--    WHERE  table_name = 'v_comptes_clients'
--    ORDER  BY ordinal_position;
--    -- attendu : les 19 premieres inchangees et dans le meme ordre,
--    --           puis relance_bloquee, _motif, _le, _par
--
--
-- 3. Les totaux de la vue n'ont pas bouge. Un GROUP BY elargi ne doit rien
--    changer : les nouvelles colonnes viennent de clients, pas des factures,
--    donc elles ne peuvent pas multiplier les lignes. A verifier quand meme.
--
--    SELECT count(*)                       AS nb_clients,
--           ROUND(SUM(encours_total))      AS encours
--    FROM   v_comptes_clients;
--    -- a comparer avec le meme chiffre releve AVANT execution
--
--
-- RETOUR ARRIERE :
--    Rejouer la vue de la migration 150 telle quelle, PUIS
--    ALTER TABLE clients
--      DROP COLUMN relance_bloquee, DROP COLUMN relance_bloquee_motif,
--      DROP COLUMN relance_bloquee_le, DROP COLUMN relance_bloquee_par;
--    Dans cet ordre : la vue reference les colonnes, les supprimer d'abord
--    echouerait.
