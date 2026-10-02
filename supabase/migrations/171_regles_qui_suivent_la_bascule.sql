-- Migration 171 : les regles qui ne suivaient pas la bascule
--
-- La migration 170 a pose le socle. 40 regles d'isolation passent par
-- get_my_organisation_id() et basculent donc toutes seules. Six ne le font pas :
-- elles relisent utilisateurs.organisation_id en direct, donc elles resteraient
-- accrochees a la structure D'ORIGINE apres une bascule.
--
-- Le bug serait silencieux : pas un ecran casse, un ecran qui montre autre
-- chose. C'est le pire type de defaut.
--
-- ============================================================================
-- PREALABLE
-- ============================================================================
-- La migration 170 doit etre appliquee, et son controle doit renvoyer 0 / 0.
-- Tant qu'aucune appartenance n'existe, 170 et 171 sont tous deux inertes :
-- elles peuvent donc etre appliquees separement sans fenetre de risque.
--
-- ============================================================================
-- LES DEUX SUPPRESSIONS
-- ============================================================================
-- alertes_score / « lecture org » : strictement redondante avec
--   alertes_score_org_isolation, qui est declaree FOR ALL et couvre donc la
--   lecture, avec exactement la meme condition. Rien n'est perdu.
--
-- relances / relances_select_org : filtre sur l'organisation de l'OPERATEUR, la
--   ou relances_select filtre sur celle de la relance. Cette derniere est plus
--   large — elle voit aussi les relances sans operateur. Rien n'est perdu.
--
-- Les regles permissives s'additionnent : laisser l'une des deux en place
-- aurait AJOUTE un acces a la structure d'origine pendant qu'on travaille
-- ailleurs. Il faut donc les retirer, pas seulement en corriger une.
--
-- ============================================================================
-- CE QUI EST CONSERVE, ET POURQUOI
-- ============================================================================
-- relances_update_org est REECRITE, pas supprimee. Elle autorise un membre a
-- modifier la relance d'un COLLEGUE, la ou relances_update ne couvre que ses
-- propres relances. C'est l'objet meme de la migration 115 : reprendre la
-- relance d'un absent. La supprimer aurait retire cette capacite sans message
-- d'erreur explicite — juste un bouton qui ne marche plus.
--
-- ============================================================================
-- DEUX CORRECTIFS D'ISOLATION, SANS LIEN AVEC LA BASCULE
-- ============================================================================
-- Trouves pendant l'inventaire. Ils existent AUJOURD'HUI.
--
-- lettrages_archive a l'insertion : la seule condition etait
--   « auth.uid() IS NOT NULL ». N'importe quel utilisateur connecte pouvait
--   donc inserer une ligne dans l'archive de n'importe quelle organisation.
--   Gravite faible (table d'archive, lecture restant cloisonnee), mais c'est
--   une ecriture qui franchit la frontiere.
--
-- commentaires en modification et suppression : seul l'auteur etait verifie,
--   pas l'organisation. Apres la bascule, quelqu'un present dans deux
--   structures aurait pu deplacer son propre commentaire de l'une a l'autre.
--
-- ============================================================================
-- CONTROLE APRES APPLICATION (a executer)
-- ============================================================================
--   SELECT tablename, policyname, cmd
--   FROM pg_policies
--   WHERE schemaname = 'public'
--     AND coalesce(qual, '') || ' ' || coalesce(with_check, '') LIKE '%FROM utilisateurs%'
--   ORDER BY tablename, policyname;
--   -- attendu : AUCUNE ligne
--
-- ============================================================================
-- RETOUR ARRIERE
-- ============================================================================
--   -- Les deux supprimees :
--   CREATE POLICY "lecture org" ON alertes_score FOR SELECT
--     USING (organisation_id = (SELECT organisation_id FROM utilisateurs WHERE id = auth.uid()));
--   CREATE POLICY relances_select_org ON relances FOR SELECT
--     USING (operateur_id IN (SELECT id FROM utilisateurs
--            WHERE organisation_id = (SELECT organisation_id FROM utilisateurs WHERE id = auth.uid())));
--   -- Les quatre reecrites, dans leur version d'origine. Postgres n'a pas de
--   -- CREATE OR REPLACE POLICY : il faut supprimer puis recreer.
--   DROP POLICY relances_update_org ON relances;
--   CREATE POLICY relances_update_org ON relances FOR UPDATE
--     USING (operateur_id IN (SELECT id FROM utilisateurs
--            WHERE organisation_id = (SELECT organisation_id FROM utilisateurs WHERE id = auth.uid())));
--   DROP POLICY relances_auto_log_insert ON relances_auto_log;
--   CREATE POLICY relances_auto_log_insert ON relances_auto_log FOR INSERT
--     WITH CHECK (organisation_id = (SELECT organisation_id FROM utilisateurs WHERE id = auth.uid()));
--   DROP POLICY relances_auto_log_select ON relances_auto_log;
--   CREATE POLICY relances_auto_log_select ON relances_auto_log FOR SELECT
--     USING (organisation_id = (SELECT organisation_id FROM utilisateurs WHERE id = auth.uid()));
--   DROP POLICY commentaires_select ON commentaires;
--   CREATE POLICY commentaires_select ON commentaires FOR SELECT
--     USING (organisation_id = (SELECT organisation_id FROM utilisateurs WHERE id = auth.uid()));
--   -- Les trois correctifs :
--   DROP POLICY "insert authentifie lettrages_archive" ON lettrages_archive;
--   CREATE POLICY "insert authentifie lettrages_archive" ON lettrages_archive
--     FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
--   DROP POLICY commentaires_update ON commentaires;
--   CREATE POLICY commentaires_update ON commentaires FOR UPDATE
--     USING (auteur_id = auth.uid()) WITH CHECK (auteur_id = auth.uid());
--   DROP POLICY commentaires_delete ON commentaires;
--   CREATE POLICY commentaires_delete ON commentaires FOR DELETE
--     USING (auteur_id = auth.uid());
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Les deux redondantes : supprimees
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "lecture org"       ON alertes_score;
DROP POLICY IF EXISTS relances_select_org ON relances;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. relances_update_org : capacite conservee, perimetre corrige
-- ────────────────────────────────────────────────────────────────────────────
-- Avant : « je modifie les relances dont l'auteur est dans mon organisation ».
-- Apres : « je modifie les relances de ma structure active ».
--
-- Sans condition d'ecriture explicite, Postgres reutilise la condition de
-- lecture pour controler la ligne modifiee. Effet de bord utile : on ne peut
-- plus deplacer une relance d'une structure vers une autre.

DROP POLICY IF EXISTS relances_update_org ON relances;
CREATE POLICY relances_update_org ON relances
  FOR UPDATE USING (organisation_id = get_my_organisation_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 3. relances_auto_log : les deux seules regles de la table
-- ────────────────────────────────────────────────────────────────────────────
-- Le robot de relance ecrit ici avec la cle de service, qui ignore les regles.
-- Ces deux-la ne concernent donc que l'application.

DROP POLICY IF EXISTS relances_auto_log_select ON relances_auto_log;
CREATE POLICY relances_auto_log_select ON relances_auto_log
  FOR SELECT USING (organisation_id = get_my_organisation_id());

DROP POLICY IF EXISTS relances_auto_log_insert ON relances_auto_log;
CREATE POLICY relances_auto_log_insert ON relances_auto_log
  FOR INSERT WITH CHECK (organisation_id = get_my_organisation_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. commentaires : lecture cloisonnee par la fonction
-- ────────────────────────────────────────────────────────────────────────────
-- C'est le seul filtre d'organisation de cette table : a reecrire, pas a
-- supprimer.

DROP POLICY IF EXISTS commentaires_select ON commentaires;
CREATE POLICY commentaires_select ON commentaires
  FOR SELECT USING (organisation_id = get_my_organisation_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 5. commentaires : l'auteur ET l'organisation
-- ────────────────────────────────────────────────────────────────────────────
-- Les deux conditions, pas l'une ou l'autre. Etre l'auteur ne doit pas suffire
-- a toucher un commentaire d'une autre structure.

DROP POLICY IF EXISTS commentaires_update ON commentaires;
CREATE POLICY commentaires_update ON commentaires
  FOR UPDATE
  USING      (auteur_id = auth.uid() AND organisation_id = get_my_organisation_id())
  WITH CHECK (auteur_id = auth.uid() AND organisation_id = get_my_organisation_id());

DROP POLICY IF EXISTS commentaires_delete ON commentaires;
CREATE POLICY commentaires_delete ON commentaires
  FOR DELETE
  USING (auteur_id = auth.uid() AND organisation_id = get_my_organisation_id());

-- ────────────────────────────────────────────────────────────────────────────
-- 6. lettrages_archive : une insertion ne traverse plus les structures
-- ────────────────────────────────────────────────────────────────────────────
-- Etre connecte ne suffisait pas a rendre l'ecriture legitime. Correctif d'une
-- anomalie presente avant ce chantier.

DROP POLICY IF EXISTS "insert authentifie lettrages_archive" ON lettrages_archive;
CREATE POLICY "insert authentifie lettrages_archive" ON lettrages_archive
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND organisation_id = get_my_organisation_id());

COMMIT;
