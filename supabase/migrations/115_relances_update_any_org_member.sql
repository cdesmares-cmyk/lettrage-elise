-- Migration 115 : relances — annotation et archivage ouverts à tous les membres de l'org
-- Avant : seul le propriétaire (operateur_id = auth.uid()) avec rôle admin/responsable pouvait modifier
-- Après : tout membre de la même organisation peut lire, annoter (note) et archiver (archivee)

-- 1. Remplace la politique SELECT restrictive par une vue org complète
DROP POLICY IF EXISTS "relances_select_own" ON relances;

CREATE POLICY "relances_select_org" ON relances
  FOR SELECT USING (
    operateur_id IN (
      SELECT id FROM utilisateurs
      WHERE organisation_id = (
        SELECT organisation_id FROM utilisateurs WHERE id = auth.uid()
      )
    )
  );

-- 2. Remplace la politique UPDATE propriétaire par une mise à jour org
DROP POLICY IF EXISTS "relances_update_own" ON relances;

CREATE POLICY "relances_update_org" ON relances
  FOR UPDATE USING (
    operateur_id IN (
      SELECT id FROM utilisateurs
      WHERE organisation_id = (
        SELECT organisation_id FROM utilisateurs WHERE id = auth.uid()
      )
    )
  );
