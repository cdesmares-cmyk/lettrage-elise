-- Migration 149 : RPC annuler_compensation_atomique
--
-- Annule les deux lignes d'une compensation (source + destination) en une seule
-- transaction. Impossible si l'une des lignes est déjà verrouillée dans un export
-- comptable (export_id IS NOT NULL).

CREATE OR REPLACE FUNCTION annuler_compensation_atomique(
  p_compensation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_nb_lignes  integer;
  v_nb_lockees integer;
BEGIN
  -- 1. Vérifier que la compensation existe et appartient à l'org (RLS)
  SELECT COUNT(*) INTO v_nb_lignes
  FROM   lettrages
  WHERE  compensation_id = p_compensation_id
    AND  annule          = false;

  IF v_nb_lignes = 0 THEN
    RAISE EXCEPTION 'Compensation introuvable ou déjà annulée';
  END IF;

  -- 2. Bloquer si au moins une ligne est verrouillée dans un export
  SELECT COUNT(*) INTO v_nb_lockees
  FROM   lettrages
  WHERE  compensation_id = p_compensation_id
    AND  annule          = false
    AND  export_id       IS NOT NULL;

  IF v_nb_lockees > 0 THEN
    RAISE EXCEPTION 'Cette compensation est verrouillée dans un export comptable — annulation impossible';
  END IF;

  -- 3. Annulation atomique des deux lignes
  UPDATE lettrages
  SET    annule = true
  WHERE  compensation_id = p_compensation_id
    AND  annule          = false;
END;
$$;
