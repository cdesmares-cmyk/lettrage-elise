-- Migration 124 : RLS utilisateurs — responsable_poste_client et commercial voient
-- tous les membres de leur organisation (nécessaire pour le filtre "par commercial"
-- dans Compte Client et Relances)

CREATE POLICY "utilisateurs_select_same_org" ON utilisateurs
  FOR SELECT USING (
    get_my_role() IN ('responsable_poste_client', 'commercial')
    AND organisation_id = get_my_organisation_id()
  );
