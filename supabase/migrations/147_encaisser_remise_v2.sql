-- Migration 147 : encaisser_remise_atomique v2
--
-- Avec migration 146, les lettrages remise sont exclus de l'index unique.
-- Le check intra-remise (même facture deux fois dans la même remise) n'est
-- plus nécessaire — c'est désormais un cas métier autorisé.
--
-- On conserve uniquement le check inter-source : si un lettrage NORMAL
-- (remise_id IS NULL) couvre déjà cette facture sur cette ligne, on bloque
-- avec un message lisible.

CREATE OR REPLACE FUNCTION encaisser_remise_atomique(
  p_remise_id         uuid,
  p_id_ligne_bancaire text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_statut text;
BEGIN
  -- 1. Garde-fou statut
  SELECT statut INTO v_statut FROM remises WHERE id = p_remise_id;
  IF v_statut IS NULL THEN
    RAISE EXCEPTION 'Remise introuvable';
  END IF;
  IF v_statut = 'encaisse' THEN
    RAISE EXCEPTION 'Cette remise a déjà été encaissée';
  END IF;

  -- 2. Conflit avec un lettrage normal (non-remise) sur la même ligne + même facture
  IF EXISTS (
    SELECT 1
    FROM   lettrages conflit
    JOIN   lettrages rl ON rl.remise_id = p_remise_id
    WHERE  conflit.id_ligne_bancaire = p_id_ligne_bancaire
      AND  conflit.numero_facture    = rl.numero_facture
      AND  conflit.annule            = false
      AND  conflit.remise_id         IS NULL
      AND  conflit.mode NOT IN ('correction', 'dispatch')
      AND  conflit.numero_facture IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'doublon_lettrage';
  END IF;

  -- 3. Mise à jour atomique lettrages + remise
  UPDATE lettrages
  SET    id_ligne_bancaire = p_id_ligne_bancaire
  WHERE  remise_id = p_remise_id;

  UPDATE remises
  SET    statut            = 'encaisse',
         id_ligne_bancaire = p_id_ligne_bancaire,
         date_encaissement = current_date
  WHERE  id = p_remise_id;
END;
$$;
