-- Migration 047 : Rôle superadmin — accès cross-org pour le pilotage OCKHAM

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Ajout de superadmin dans le CHECK constraint du rôle
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  EXECUTE (
    SELECT 'ALTER TABLE utilisateurs DROP CONSTRAINT ' || quote_ident(conname)
    FROM pg_constraint
    WHERE conrelid = 'utilisateurs'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%admin%'
    LIMIT 1
  );
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE utilisateurs
  ADD CONSTRAINT utilisateurs_role_check
  CHECK (role IN ('admin', 'responsable_poste_client', 'commercial', 'superadmin'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. RLS utilisateurs — superadmin voit et modifie tout le monde
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "utilisateurs_select_superadmin" ON utilisateurs;
CREATE POLICY "utilisateurs_select_superadmin" ON utilisateurs
  FOR SELECT USING (get_my_role() = 'superadmin');

DROP POLICY IF EXISTS "utilisateurs_update_superadmin" ON utilisateurs;
CREATE POLICY "utilisateurs_update_superadmin" ON utilisateurs
  FOR UPDATE USING (get_my_role() = 'superadmin');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. RLS organisations — superadmin voit toutes les organisations
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "organisations_select_superadmin" ON organisations;
CREATE POLICY "organisations_select_superadmin" ON organisations
  FOR SELECT USING (get_my_role() = 'superadmin');

DROP POLICY IF EXISTS "organisations_insert_superadmin" ON organisations;
CREATE POLICY "organisations_insert_superadmin" ON organisations
  FOR INSERT WITH CHECK (get_my_role() = 'superadmin');

DROP POLICY IF EXISTS "organisations_update_superadmin" ON organisations;
CREATE POLICY "organisations_update_superadmin" ON organisations
  FOR UPDATE USING (get_my_role() = 'superadmin');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Fonction helper : is_superadmin() — utilisée dans les guards frontend/edge
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT role = 'superadmin' FROM utilisateurs WHERE id = auth.uid()
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. INSTRUCTION : passer votre compte en superadmin
-- Remplacer l'email par le vôtre puis exécuter cette ligne séparément.
-- ═══════════════════════════════════════════════════════════════════════════════

-- UPDATE utilisateurs SET role = 'superadmin' WHERE email = 'ctournebize@ockham-finance.com';
