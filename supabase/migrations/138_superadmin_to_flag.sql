-- Migration 138 : superadmin → colonne is_superadmin + role admin
-- Le rôle 'superadmin' disparaît de la colonne role.
-- Les utilisateurs superadmin deviennent admin + is_superadmin = true.
-- Les policies RLS cross-org de la migration 047 sont supprimées —
-- l'onglet SuperAdmin passe exclusivement par la Edge Function superadmin-data
-- (service_role), qui se protège elle-même via le flag is_superadmin.

-- 1. Nouvelle colonne flag
ALTER TABLE utilisateurs
  ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT false;

-- 2. Migrer les superadmins existants
UPDATE utilisateurs
  SET is_superadmin = true,
      role          = 'admin'
  WHERE role = 'superadmin';

-- 3. Recréer le CHECK constraint sans 'superadmin'
ALTER TABLE utilisateurs
  DROP CONSTRAINT IF EXISTS utilisateurs_role_check;

ALTER TABLE utilisateurs
  ADD CONSTRAINT utilisateurs_role_check
  CHECK (role IN ('admin', 'responsable_poste_client', 'commercial', 'externe'));

-- 4. Supprimer les policies RLS cross-org de la migration 047
DROP POLICY IF EXISTS "utilisateurs_select_superadmin" ON utilisateurs;
DROP POLICY IF EXISTS "utilisateurs_update_superadmin" ON utilisateurs;
DROP POLICY IF EXISTS "organisations_select_superadmin" ON organisations;
DROP POLICY IF EXISTS "organisations_insert_superadmin" ON organisations;
DROP POLICY IF EXISTS "organisations_update_superadmin" ON organisations;

-- 5. Mettre à jour la fonction helper is_superadmin()
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(is_superadmin, false) FROM utilisateurs WHERE id = auth.uid()
$$;
