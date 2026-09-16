-- Migration 145 : RPC encaisser_remise_atomique
--
-- Remplace les deux updates directs JS (lettrages + remises) par une fonction
-- atomique qui :
--   1. Vérifie que la remise est encore en_attente (garde-fou double-clic)
--   2. Détecte les doublons AVANT l'update pour produire un message clair
--   3. Exécute les deux updates dans la même transaction

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

  -- 2. Détection de doublon : cherche un lettrage existant (hors cette remise)
  --    sur la même ligne bancaire pour l'une des factures de la remise
  IF EXISTS (
    SELECT 1
    FROM   lettrages conflit
    JOIN   lettrages rl ON rl.remise_id = p_remise_id
    WHERE  conflit.id_ligne_bancaire          = p_id_ligne_bancaire
      AND  conflit.numero_facture             = rl.numero_facture
      AND  conflit.annule                     = false
      AND  conflit.remise_id IS DISTINCT FROM p_remise_id
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
