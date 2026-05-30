-- Migration 045 : Correctifs RLS — fuite cross-org identifiée en production
-- Problème : un admin d'une org pouvait voir les utilisateurs de toutes les organisations
-- via la policy "utilisateurs_select_admin" (aucun filtre organisation_id).
-- Problème secondaire : ref_valeurs "FOR ALL" autorisait l'écriture sur les lignes
-- globales (organisation_id IS NULL) depuis n'importe quelle org.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. utilisateurs — scoper les policies admin à l'organisation courante
-- ═══════════════════════════════════════════════════════════════════════════════

-- SELECT : l'admin voit uniquement les utilisateurs de sa propre organisation
DROP POLICY IF EXISTS "utilisateurs_select_admin" ON utilisateurs;
CREATE POLICY "utilisateurs_select_admin" ON utilisateurs
  FOR SELECT USING (
    get_my_role() = 'admin'
    AND organisation_id = get_my_organisation_id()
  );

-- UPDATE : l'admin ne peut modifier que les utilisateurs de sa propre organisation
DROP POLICY IF EXISTS "utilisateurs_update_admin" ON utilisateurs;
CREATE POLICY "utilisateurs_update_admin" ON utilisateurs
  FOR UPDATE USING (
    get_my_role() = 'admin'
    AND organisation_id = get_my_organisation_id()
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. ref_valeurs — séparer SELECT (global + org) des écritures (org seulement)
-- La policy "FOR ALL" permettait de modifier les lignes globales (IS NULL)
-- depuis n'importe quelle organisation, ce qui est non souhaité.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "ref_valeurs_org_isolation" ON ref_valeurs;

-- Lecture : valeurs globales (NULL) + valeurs propres à l'org
CREATE POLICY "ref_valeurs_select" ON ref_valeurs
  FOR SELECT USING (
    organisation_id IS NULL
    OR organisation_id = get_my_organisation_id()
  );

-- Insertion : uniquement dans son organisation (le trigger inject_organisation_id
-- remplit automatiquement organisation_id, donc cette policy est cohérente)
CREATE POLICY "ref_valeurs_insert" ON ref_valeurs
  FOR INSERT WITH CHECK (
    organisation_id = get_my_organisation_id()
  );

-- Mise à jour : uniquement les lignes propres à son organisation (pas les globales)
CREATE POLICY "ref_valeurs_update" ON ref_valeurs
  FOR UPDATE USING (
    organisation_id = get_my_organisation_id()
  );

-- Suppression : idem
CREATE POLICY "ref_valeurs_delete" ON ref_valeurs
  FOR DELETE USING (
    organisation_id = get_my_organisation_id()
  );
