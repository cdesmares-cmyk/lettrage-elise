-- Migration 078 : Policy UPDATE organisations pour admin et responsable_poste_client
-- Correction : les admins et credit managers ne pouvaient pas sauvegarder
-- les paramètres org (délai alerte, relances auto…) — update silencieux sans erreur.

CREATE POLICY "organisations_update_admin" ON organisations
  FOR UPDATE
  USING (
    id = get_my_organisation_id()
    AND get_my_role() IN ('admin', 'responsable_poste_client')
  )
  WITH CHECK (
    id = get_my_organisation_id()
    AND get_my_role() IN ('admin', 'responsable_poste_client')
  );
