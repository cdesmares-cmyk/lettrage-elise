-- Migration 173 : retirer la cle etrangere de organisation_active_id
--
-- ============================================================================
-- CORRECTIF D'UNE REGRESSION DE PRODUCTION CAUSEE PAR LA MIGRATION 170
-- ============================================================================
-- La 170 a ajoute utilisateurs.organisation_active_id AVEC une cle etrangere
-- vers organisations. Or utilisateurs.organisation_id en avait deja une.
--
-- L'application charge son profil par :
--
--   .select('role, organisation_id, prenom, nom, initiales, organisations(nom, code_org)')
--
-- Ce raccourci demande a PostgREST de suivre le lien vers organisations. Avec
-- DEUX liens candidats, il ne peut plus trancher et refuse la requete entiere
-- (PGRST201, « more than one relationship was found »).
--
-- Le profil revient donc vide, et tout ce qui en depend tombe avec lui :
--   - le nom de l'organisation, sur l'ecran de chargement et dans le menu
--   - le mois de reference, qui retombe sur la date du jour
--   - le chiffre d'affaires 12 mois, donc le DSO, qui n'affiche plus rien
--   - le role, donc les menus : les admins perdent leurs actions et les
--     commerciaux voient des entrees normalement masquees
--
-- La migration 170 avait ete annoncee « sans effet par construction ». C'etait
-- vrai de sa semantique SQL. Ca ne l'etait pas de l'API : ajouter une seconde
-- cle etrangere change la facon dont PostgREST resout les raccourcis. Les
-- controles avaient tous ete faits en SQL, aucun par l'API que le produit
-- utilise reellement.
--
-- LECON : une migration qui touche une table lue par un raccourci PostgREST
-- doit etre verifiee DEPUIS L'APPLICATION, pas seulement en SQL.
--
-- ============================================================================
-- CE QU'ON PERD, ET POURQUOI C'EST ACCEPTABLE
-- ============================================================================
-- La cle etrangere garantissait que organisation_active_id pointe sur une
-- organisation existante. Le declencheur trg_utilisateurs_valider_structure_active
-- pose deja une condition PLUS FORTE : la structure active doit figurer parmi
-- les appartenances declarees de l'utilisateur — ce qui implique qu'elle
-- existe, puisque membres_organisations la referencera.
--
-- Seul cas non couvert : une organisation supprimee laisserait une valeur
-- orpheline. Les appartenances disparaitraient en cascade, mais la colonne
-- garderait son identifiant. L'utilisateur ne verrait alors plus rien, au lieu
-- d'etre bascule sur sa structure d'origine.
--
-- On pourra retablir la cle quand le front nommera explicitement le lien a
-- suivre — `organisations!utilisateurs_organisation_id_fkey(...)`. Tant que ce
-- n'est pas fait, la cle casse la production.
--
-- ============================================================================
-- CONTROLE APRES APPLICATION
-- ============================================================================
--   SELECT conname, pg_get_constraintdef(oid) AS definition
--   FROM pg_constraint
--   WHERE conrelid = 'utilisateurs'::regclass AND contype = 'f';
--   -- attendu : UNE SEULE ligne pointant vers organisations
--
-- Puis, dans l'application : recharger la page. Le nom de l'organisation, le
-- mois de reference et le DSO doivent revenir ensemble.
--
-- ============================================================================
-- RETOUR ARRIERE
-- ============================================================================
-- A ne faire que si le front a ete corrige au prealable, sinon la regression
-- revient immediatement :
--   ALTER TABLE utilisateurs
--     ADD CONSTRAINT utilisateurs_organisation_active_id_fkey
--     FOREIGN KEY (organisation_active_id) REFERENCES organisations(id);
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================

BEGIN;

ALTER TABLE utilisateurs
  DROP CONSTRAINT IF EXISTS utilisateurs_organisation_active_id_fkey;

COMMENT ON COLUMN utilisateurs.organisation_active_id IS
  'Structure dans laquelle l''utilisateur travaille. NULL = sa structure d''origine. '
  'Ne peut valoir qu''une organisation declaree dans membres_organisations '
  '(garanti par trg_utilisateurs_valider_structure_active). '
  'Volontairement SANS cle etrangere : une seconde cle vers organisations rend '
  'ambigus les raccourcis PostgREST du front — voir migration 173.';

COMMIT;

-- Hors transaction : force l'API a relire son schema immediatement, au lieu
-- d'attendre son prochain rafraichissement.
NOTIFY pgrst, 'reload schema';
