-- Migration 041 : Fonction RPC fn_upsert_libelle_sepa
-- Appelée après chaque lettrage validé pour alimenter le dictionnaire auto-apprenant.
-- Pattern UPDATE + INSERT : respecte le RLS multi-tenant (pas de ON CONFLICT qui bypasse RLS).

CREATE OR REPLACE FUNCTION fn_upsert_libelle_sepa(
  p_libelle     text,
  p_code_client text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  -- UPDATE d'abord (RLS appliqué — ne touche que la ligne appartenant à l'org)
  UPDATE libelles_sepa
  SET code_client     = p_code_client,
      nb_utilisations = nb_utilisations + 1
  WHERE libelle = p_libelle;

  -- Si aucune ligne trouvée (première occurrence), INSERT
  IF NOT FOUND THEN
    INSERT INTO libelles_sepa (libelle, code_client, nb_utilisations)
    VALUES (p_libelle, p_code_client, 1)
    ON CONFLICT (libelle) DO NOTHING; -- garde contre race condition
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_upsert_libelle_sepa(text, text) TO authenticated;
