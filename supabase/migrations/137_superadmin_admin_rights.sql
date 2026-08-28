-- Migration 137 : SuperAdmin hérite des droits Admin
-- Le rôle superadmin peut désormais effectuer toutes les opérations
-- qu'un admin peut faire au sein de son organisation.
-- Les policies cross-org spécifiques (migration 047) restent inchangées.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. utilisateurs — superadmin gère les users de son org comme un admin
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "utilisateurs_select_admin" ON utilisateurs;
CREATE POLICY "utilisateurs_select_admin" ON utilisateurs
  FOR SELECT USING (
    get_my_role() IN ('admin', 'superadmin')
    AND organisation_id = get_my_organisation_id()
  );

DROP POLICY IF EXISTS "utilisateurs_update_admin" ON utilisateurs;
CREATE POLICY "utilisateurs_update_admin" ON utilisateurs
  FOR UPDATE USING (
    get_my_role() IN ('admin', 'superadmin')
    AND organisation_id = get_my_organisation_id()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. contacts_client — superadmin peut créer / modifier / supprimer
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "contacts_client_write_restriction" ON contacts_client;
CREATE POLICY "contacts_client_write_restriction" ON contacts_client
  FOR INSERT WITH CHECK (
    organisation_id = get_my_organisation_id()
    AND get_my_role() IN ('admin', 'responsable_poste_client', 'superadmin')
  );

DROP POLICY IF EXISTS "contacts_client_update_restriction" ON contacts_client;
CREATE POLICY "contacts_client_update_restriction" ON contacts_client
  FOR UPDATE USING (
    organisation_id = get_my_organisation_id()
    AND get_my_role() IN ('admin', 'responsable_poste_client', 'superadmin')
  );

DROP POLICY IF EXISTS "contacts_client_delete_restriction" ON contacts_client;
CREATE POLICY "contacts_client_delete_restriction" ON contacts_client
  FOR DELETE USING (
    organisation_id = get_my_organisation_id()
    AND get_my_role() IN ('admin', 'superadmin')
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. relances — superadmin peut créer des relances
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "relances_insert" ON relances;
CREATE POLICY "relances_insert" ON relances
  FOR INSERT WITH CHECK (
    organisation_id = get_my_organisation_id()
    AND get_my_role() IN ('admin', 'responsable_poste_client', 'superadmin')
    AND operateur_id = auth.uid()
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. integrations — superadmin configure les intégrations de son org
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "integrations_admin_write" ON integrations;
CREATE POLICY "integrations_admin_write" ON integrations
  FOR INSERT WITH CHECK (
    organisation_id = get_my_organisation_id()
    AND get_my_role() IN ('admin', 'superadmin')
  );

DROP POLICY IF EXISTS "integrations_admin_update" ON integrations;
CREATE POLICY "integrations_admin_update" ON integrations
  FOR UPDATE USING (
    organisation_id = get_my_organisation_id()
    AND get_my_role() IN ('admin', 'superadmin')
  );
