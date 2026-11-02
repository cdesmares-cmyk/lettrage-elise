-- Migration 183 : le contact d'un echange, en quatre champs
--
-- POURQUOI. La migration 182 a donne a echanges_clients un seul champ de texte
-- libre, contact_libre. A l'usage ce n'est pas suffisant : l'operateur veut
-- saisir Nom, Prenom, Telephone et Mail separement, et surtout les RELIRE
-- separement. Un seul champ affiche « Clement Desmares 06.56.2... » tronque,
-- sans qu'on sache ou s'arrete le nom et ou commence le numero.
--
-- POURQUOI PAS CONCATENER. Quatre zones de saisie qui finissent dans une seule
-- colonne, c'est une illusion : la saisie est propre, la relecture est une
-- bouillie, et plus rien n'est exploitable ensuite (chercher un numero,
-- exporter les contacts rencontres hors Ockham). Quatre champs distincts a
-- l'ecran demandent quatre colonnes en base.
--
-- POURQUOI PAS ECRIRE DANS contacts_client. Ce serait le reflexe, et c'est
-- refuse explicitement par Clement le 2026-11-02 : « si on a pas toute les
-- donnees on sera bloque donc non ». Creer une fiche contact exige un email et
-- declenche la contrainte UNIQUE (organisation_id, email, code_client). Un
-- operateur qui n'a qu'un prenom et un numero de standard serait bloque, et il
-- renoncerait a tracer l'appel. Ces quatre colonnes acceptent le partiel.
--
-- CE QUI NE CHANGE PAS.
--   - contact_id reste la : quand une fiche existante est cochee, le lien est
--     conserve. Les quatre colonnes enregistrent les valeurs REELLEMENT
--     utilisees ce jour-la, qui peuvent differer de la fiche (un numero a
--     change, on le corrige dans l'echange sans toucher la fiche).
--   - contact_libre reste la, et n'est pas supprime. Des lignes existent deja
--     avec cette colonne remplie ; les ecraser ferait perdre la saisie. Le
--     front la lit encore en repli quand les quatre colonnes sont vides.
--   - Aucun effet sur le niveau de relance ni sur les scores. Cette table
--     n'est lue par aucun calcul SQL, c'est l'absence de jointure qui protege.
--
-- Tout est nullable : un echange sans contact du tout reste valide, c'est le
-- choix de la 182 et il ne bouge pas. Seul le canal est obligatoire.

ALTER TABLE echanges_clients
  ADD COLUMN IF NOT EXISTS contact_nom       text,
  ADD COLUMN IF NOT EXISTS contact_prenom    text,
  ADD COLUMN IF NOT EXISTS contact_telephone text,
  ADD COLUMN IF NOT EXISTS contact_email     text;

COMMENT ON COLUMN echanges_clients.contact_nom IS
  'Nom du contact joint, tel que saisi ou recopie depuis la fiche cochee.';
COMMENT ON COLUMN echanges_clients.contact_libre IS
  'Historique (migration 182) : contact en texte libre, avant la separation en '
  'quatre champs. Conserve pour les lignes deja saisies, plus alimente.';


-- ═══════════════════════════════════════════════════════════════════════════
--  CONTROLES APRES EXECUTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Les quatre colonnes existent et sont nullables
--
--    SELECT column_name, data_type, is_nullable
--    FROM   information_schema.columns
--    WHERE  table_name = 'echanges_clients'
--      AND  column_name LIKE 'contact%'
--    ORDER  BY column_name;
--    -- attendu : contact_email, contact_id, contact_libre, contact_nom,
--    --           contact_prenom, contact_telephone — toutes en YES
--
-- 2. Les lignes deja saisies sont intactes
--
--    SELECT id, canal, echange_le, contact_libre, contact_nom
--    FROM   echanges_clients
--    ORDER  BY created_at DESC;
--    -- attendu : contact_libre toujours rempli, contact_nom a NULL
--
-- RETOUR ARRIERE :
--    ALTER TABLE echanges_clients
--      DROP COLUMN contact_nom, DROP COLUMN contact_prenom,
--      DROP COLUMN contact_telephone, DROP COLUMN contact_email;
--
-- Sans risque : ces colonnes sont neuves, rien d'autre ne les lit tant que le
-- front n'est pas deploye. A ne faire qu'avant la mise en production du front.
