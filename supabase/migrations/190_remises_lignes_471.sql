-- Migration 190 : lignes « Autres (471) » dans les remises Chèque / LCR
--
-- POURQUOI. Une remise ne pouvait contenir que des factures client réelles. Le
-- front refusait toute ligne dont le numéro n'existait pas dans
-- v_factures_avec_reste_du, et les deux RPC écrivaient numero_facture et
-- code_client en les tirant de cette facture.
--
-- Conséquence : un chèque qui ne correspond à aucune facture client était
-- impossible à saisir. Le cas concret qui a déclenché ce chantier : un
-- fournisseur nous rembourse un trop-payé par chèque. L'argent arrive, mais il
-- n'y a pas de facture en face. Il fallait attendre que la ligne bancaire tombe
-- pour la dispatcher en 471, donc renoncer au pré-lettrage.
--
-- CE QU'ON NE CRÉE PAS, et c'est le point important : aucune table, aucune
-- colonne, aucun marqueur nouveau. On réutilise la convention « Autres » déjà
-- posée partout ailleurs dans le lettrage :
--
--   code_client     = 'AUTRES'
--   numero_facture  = NULL
--   commentaire     = le libellé libre saisi par l'opérateur
--
-- C'est ce qui fait que l'export comptable et l'historique de lettrage savent
-- déjà afficher ces lignes SANS ÊTRE MODIFIÉS (exportLettrageXls.ts:210,
-- exportXls.ts:138). Inventer un marqueur propre aux remises aurait voulu dire
-- reprendre chaque lecture en aval, et en oublier une.
--
-- LE LIBELLÉ EST OBLIGATOIRE, côté front. Même raisonnement que le motif de
-- suspension (migration 189) : c'est la seule trace de ce qu'est ce chèque.
-- Sans lui, on retrouve dans trois mois une ligne « Autres · 412,00 € » que
-- plus personne ne sait rattacher. C'est aussi la seule chose qui remonte dans
-- la colonne Commentaire de l'export. Pas de contrainte CHECK ici : une ligne
-- existante reprise par un script ne doit pas échouer pour autant.
--
-- LE COMMENTAIRE GARDE LES DEUX INFORMATIONS : « Remise CHQ n°X — libellé ».
-- La référence de remise seule ne dit pas ce qu'est l'encaissement ; le libellé
-- seul ne dit pas d'où il vient. L'export a besoin des deux.
--
-- CE QUI N'A PAS BESOIN DE BOUGER, vérifié ligne à ligne :
--   encaisser_remise_atomique (147) : son contrôle anti-doublon est gardé par
--     « conflit.numero_facture IS NOT NULL ». Une ligne 471 ne peut pas le
--     déclencher.
--   idx_lettrages_no_doublon (146) : l'index exige numero_facture IS NOT NULL.
--     Une ligne 471 en est exclue d'office.
--   organisation_id : posé par le trigger lettrages_inject_org_id (019). Les
--     INSERT ci-dessous gardent donc volontairement la même liste de colonnes
--     qu'avant — ne pas y toucher.

-- ─── creer_remise_atomique ───────────────────────────────────────────────────
--
-- p_lignes : [{ "numero_facture": "...", "code_client": "...",
--               "montant": 0.00, "libelle": "..." }]
--   code_client = 'AUTRES' → ligne 471 : numero_facture ignoré, libelle utilisé.
--   sinon                  → ligne facture : comportement inchangé.
CREATE OR REPLACE FUNCTION creer_remise_atomique(
  p_type          text,
  p_numero        text,
  p_montant_total numeric,
  p_cree_par      uuid,
  p_operateur     text,
  p_lignes        jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_remise_id   uuid;
  v_commentaire text;
BEGIN
  IF jsonb_array_length(p_lignes) = 0 THEN
    RAISE EXCEPTION 'Impossible de créer une remise sans ligne rattachée';
  END IF;

  v_commentaire := 'Remise '
    || CASE WHEN p_type = 'cheque' THEN 'CHQ' ELSE 'LCR' END
    || ' n°' || p_numero;

  INSERT INTO remises (type, numero, montant_total, statut, cree_par, operateur)
  VALUES (p_type, p_numero, p_montant_total, 'en_attente', p_cree_par, p_operateur)
  RETURNING id INTO v_remise_id;

  INSERT INTO lettrages (
    id_ligne_bancaire, remise_id, numero_facture, code_client,
    montant, date_lettrage, mode, commentaire, cree_par, operateur
  )
  SELECT
    null,
    v_remise_id,
    CASE WHEN l->>'code_client' = 'AUTRES'
         THEN NULL
         ELSE NULLIF(TRIM(l->>'numero_facture'), '') END,
    (l->>'code_client'),
    (l->>'montant')::numeric,
    current_date,
    'manuel',
    CASE WHEN l->>'code_client' = 'AUTRES'
          AND NULLIF(TRIM(l->>'libelle'), '') IS NOT NULL
         THEN v_commentaire || ' — ' || TRIM(l->>'libelle')
         ELSE v_commentaire END,
    p_cree_par,
    p_operateur
  FROM jsonb_array_elements(p_lignes) AS l;

  RETURN v_remise_id;
END;
$$;


-- ─── modifier_remise_atomique ────────────────────────────────────────────────
--
-- Reprise de la version 142 (garde-fou p_lignes vide + archive avant DELETE),
-- avec la même logique 471 que ci-dessus. Le garde-fou et l'archive sont
-- conservés tels quels : ils protègent d'une perte de données silencieuse.
CREATE OR REPLACE FUNCTION modifier_remise_atomique(
  p_remise_id     uuid,
  p_type          text,
  p_numero        text,
  p_montant_total numeric,
  p_lignes        jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_commentaire text;
  v_statut      text;
BEGIN
  IF jsonb_array_length(p_lignes) = 0 THEN
    RAISE EXCEPTION 'Impossible de modifier une remise sans ligne rattachée';
  END IF;

  SELECT statut INTO v_statut FROM remises WHERE id = p_remise_id;
  IF v_statut = 'encaisse' THEN
    RAISE EXCEPTION 'Impossible de modifier une remise déjà encaissée';
  END IF;

  v_commentaire := 'Remise '
    || CASE WHEN p_type = 'cheque' THEN 'CHQ' ELSE 'LCR' END
    || ' n°' || p_numero;

  -- Archive avant suppression (migration 142)
  INSERT INTO lettrages_archive (
    lettrage_id, remise_id, numero_facture, code_client,
    montant, date_lettrage, mode, commentaire,
    organisation_id, cree_par, operateur, motif
  )
  SELECT
    id, remise_id, numero_facture, code_client,
    montant, date_lettrage, mode, commentaire,
    organisation_id, cree_par, operateur, 'modification'
  FROM lettrages
  WHERE remise_id = p_remise_id;

  DELETE FROM lettrages WHERE remise_id = p_remise_id;

  UPDATE remises
  SET    type = p_type, numero = p_numero, montant_total = p_montant_total
  WHERE  id = p_remise_id;

  INSERT INTO lettrages (
    id_ligne_bancaire, remise_id, numero_facture, code_client,
    montant, date_lettrage, mode, commentaire
  )
  SELECT
    null,
    p_remise_id,
    CASE WHEN l->>'code_client' = 'AUTRES'
         THEN NULL
         ELSE NULLIF(TRIM(l->>'numero_facture'), '') END,
    (l->>'code_client'),
    (l->>'montant')::numeric,
    current_date,
    'manuel',
    CASE WHEN l->>'code_client' = 'AUTRES'
          AND NULLIF(TRIM(l->>'libelle'), '') IS NOT NULL
         THEN v_commentaire || ' — ' || TRIM(l->>'libelle')
         ELSE v_commentaire END
  FROM jsonb_array_elements(p_lignes) AS l;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  CONTRÔLES APRÈS EXÉCUTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Les deux fonctions existent et ont la bonne signature.
--
--    SELECT routine_name, data_type
--    FROM   information_schema.routines
--    WHERE  routine_name IN ('creer_remise_atomique', 'modifier_remise_atomique');
--    -- attendu : 2 lignes, uuid et void
--
--
-- 2. LE CONTRÔLE QUI COMPTE : aucune remise existante n'a bougé. Ces fonctions
--    ne touchent que les remises créées ou modifiées APRÈS leur exécution, mais
--    une erreur de syntaxe dans le CASE casserait toute création future.
--
--    SELECT count(*) AS nb_remises,
--           count(*) FILTER (WHERE numero_facture IS NULL) AS lignes_471
--    FROM   lettrages
--    WHERE  remise_id IS NOT NULL;
--    -- attendu juste après migration : lignes_471 = 0
--
--
-- 3. Test fonctionnel, à faire depuis l'application et non en SQL :
--    créer une remise CHQ avec une seule ligne « Autres (471) », libellé
--    « Test remboursement fournisseur », montant 1,00 €. Puis :
--
--    SELECT numero_facture, code_client, montant, commentaire
--    FROM   lettrages
--    WHERE  remise_id = '<id de la remise>';
--    -- attendu : numero_facture NULL, code_client 'AUTRES',
--    --           commentaire 'Remise CHQ n°X — Test remboursement fournisseur'
--
--    Supprimer la remise de test ensuite depuis l'application.
--
--
-- RETOUR ARRIÈRE :
--    Rejouer la migration 032 pour creer_remise_atomique et la partie
--    modifier_remise_atomique de la migration 142, telles quelles. Les deux
--    sont des CREATE OR REPLACE : aucune donnée n'est touchée.
--    À ne faire qu'après avoir vérifié qu'aucune remise en attente ne contient
--    de ligne 471 (requête 2 ci-dessus) — sinon sa modification échouerait.
