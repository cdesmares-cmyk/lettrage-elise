-- Migration 186 : supprimer un echange, sans l'effacer
--
-- POURQUOI. Un operateur se trompe de client, ou enregistre deux fois le meme
-- appel. L'interface ne propose rien pour revenir en arriere : on peut corriger
-- le commentaire et le retour, pas retirer la ligne. Or un echange de trop
-- fausse le J+ de ce client pendant toute la fenetre de non-re-relance, et
-- empeche le robot de le relancer. Constate des le premier jour d'usage, le
-- 2026-11-02 : Clement n'a pas pu retirer son propre echange de test.
--
-- CE QUE VOIT L'OPERATEUR : un bouton « Supprimer ». La ligne disparait, le J+
-- se recalcule, le robot cesse d'en tenir compte.
--
-- CE QUI SE PASSE EN BASE : rien n'est efface, la ligne est marquee archivee.
--
-- POURQUOI CET ECART DE VOCABULAIRE, ET IL EST ASSUME. « Archiver » dans
-- l'interface serait un piege : quelqu'un s'en servirait pour ranger un appel
-- traite, et ferait repartir le J+ par erreur. Du point de vue de l'operateur
-- l'effet EST une suppression — ca disparait partout et plus rien n'en tient
-- compte — donc le bouton doit dire « Supprimer ». L'archivage est notre
-- mecanique, pas son probleme. Arrete avec Clement le 2026-11-02.
--
-- POURQUOI PAS UN VRAI DELETE. Un echange est la trace qu'un contact client a
-- eu lieu. L'effacer pour de bon, c'est perdre l'information meme. Et la table
-- relances porte deja « archivee » : meme grammaire, meme reflexe pour qui lit
-- le code dans six mois.
--
--   A NE PAS CONFONDRE AVEC LA SUPPRESSION D'UN CONTACT. Celle-ci est un vrai
--   DELETE, voulu, pour motif RGPD — ce sont des donnees personnelles. Ce sont
--   deux gestes differents : retirer une trace erronee d'un cote, exercer un
--   droit a l'effacement de l'autre. Le second n'est PAS traite ici, et il ne
--   l'est pas non plus ailleurs a ce jour : les colonnes contact_nom,
--   contact_prenom, contact_telephone et contact_email ajoutees par la
--   migration 183 survivent a la suppression du contact, puisque la cle
--   etrangere est ON DELETE SET NULL. Sujet ouvert, a trancher separement.
--
-- LES TROIS LECTURES A FILTRER. Si une seule est oubliee, le bouton ment :
--   1. L'historique du client          (SectionTimelineRelances.tsx)
--   2. Le calcul du J+ global          (useDerniersEchanges.ts)
--   3. La deduplication du robot       (supabase/functions/relance-auto)
-- La troisieme vit hors du depot et demande un deploiement separe. Tant qu'il
-- n'est pas fait, le robot continue d'ecarter un client sur la foi d'un echange
-- supprime.
--
-- QUI PEUT SUPPRIMER : toute personne qui peut modifier le panneau, meme regle
-- que le reste. Reserver le geste a l'auteur de l'echange bloquerait un
-- collegue devant une erreur evidente.
--
-- PAS D'ECRAN CORBEILLE, volontairement. La donnee est conservee et relisible
-- en SQL si besoin. Un ecran de plus pour un cas qui ne se produira presque
-- jamais, ce serait de la complexite pour rien.

ALTER TABLE echanges_clients
  ADD COLUMN IF NOT EXISTS archivee     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archivee_le  timestamptz,
  ADD COLUMN IF NOT EXISTS archivee_par uuid;

COMMENT ON COLUMN echanges_clients.archivee IS
  'Echange retire par un operateur. Affiche « Supprimer » cote interface : la '
  'ligne disparait de l''historique, du calcul du J+ et de la deduplication du '
  'robot. Rien n''est efface en base.';

-- L'index de lecture par client ne sert a rien s'il ramene des lignes que la
-- requete va jeter ensuite. Le predicat partiel le limite aux echanges vivants,
-- qui sont les seuls jamais lus par l'application.
DROP INDEX IF EXISTS idx_echanges_clients_org_client;
CREATE INDEX IF NOT EXISTS idx_echanges_clients_org_client
  ON echanges_clients (organisation_id, code_client, echange_le DESC)
  WHERE NOT archivee;

DROP INDEX IF EXISTS idx_echanges_clients_org_date;
CREATE INDEX IF NOT EXISTS idx_echanges_clients_org_date
  ON echanges_clients (organisation_id, echange_le DESC)
  WHERE NOT archivee;


-- ═══════════════════════════════════════════════════════════════════════════
--  CONTROLES APRES EXECUTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Les trois colonnes existent, et les echanges deja saisis sont vivants.
--
--    SELECT archivee, count(*) FROM echanges_clients GROUP BY archivee;
--    -- attendu : une seule ligne, archivee = false
--
-- 2. Les deux index sont bien devenus partiels.
--
--    SELECT indexname, indexdef FROM pg_indexes
--    WHERE  tablename = 'echanges_clients';
--    -- attendu : « WHERE (NOT archivee) » sur les deux
--
-- 3. APRES DEPLOIEMENT DU FRONT, le controle qui valide la bascule. Supprimer
--    l'echange de test sur 63111, puis :
--
--    SELECT lancer_relance_auto();
--    -- puis lire le detail : 63111 doit avoir QUITTE le motif
--    -- « contact client trace hors Ockham » et retrouver son motif d'origine.
--
--    Tant que l'Edge Function n'est pas redeployee, il le gardera. C'est
--    attendu, et c'est exactement ce que ce controle sert a mesurer.
--
-- RETOUR ARRIERE :
--    ALTER TABLE echanges_clients
--      DROP COLUMN archivee, DROP COLUMN archivee_le, DROP COLUMN archivee_par;
--    Puis recreer les deux index sans predicat (voir migration 182).
--    A ne faire qu'avant la mise en production du front : sans ces colonnes, le
--    front qui les interroge casse.
