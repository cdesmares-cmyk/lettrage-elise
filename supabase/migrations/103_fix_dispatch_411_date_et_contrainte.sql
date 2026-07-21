-- Migration 103 : fix complet du dispatch 411 (date + contrainte unique)
--
-- Deux blocages identifiés :
--
-- 1. Contrainte unique idx_lettrages_no_doublon (migration 063) :
--    bloque l'INSERT de la correction (-x€ sur 411_CLIENT avec le même
--    id_ligne_bancaire) car un enregistrement actif existe déjà avec
--    le même couple (id_ligne_bancaire, numero_facture, annule=false).
--    Fix : recréer l'index en excluant mode='correction' (les corrections
--    doivent coexister avec la source positive).
--
-- 2. Trigger fn_valider_date_lettrage (migration 094) :
--    bloque les lettrages dont date_lettrage ≠ date_operation de la ligne
--    bancaire. Le dispatch est une écriture de correction intentionnellement
--    datée au jour du dispatch (pas au jour de l'opération bancaire).
--    Fix : exempter mode IN ('correction', 'dispatch').
--
-- Trace comptable conservée (cf. attente utilisateur) :
--   +x€ date_operation  → compte 411 (lettrage source, déjà enregistré)
--   -x€ date_dispatch   → compte 411 (correction, mode='correction')
--   +x€ date_dispatch   → facture réelle (dispatch, mode='dispatch')
--
-- Migration 102 est supersédée par celle-ci (retour au mécanisme de
-- correction proportionnelle, plus propre pour la piste comptable).

-- ─── 1. Index unique : autoriser plusieurs corrections par même paire ────────

DROP INDEX IF EXISTS idx_lettrages_no_doublon;

CREATE UNIQUE INDEX idx_lettrages_no_doublon
  ON lettrages (id_ligne_bancaire, numero_facture)
  WHERE id_ligne_bancaire IS NOT NULL
    AND numero_facture    IS NOT NULL
    AND annule            = false
    AND mode              != 'correction';
-- Les enregistrements mode='correction' sont exclus de l'unicité.
-- Les lettrages manuels et dispatch restent uniques par (ligne, facture).

-- ─── 2. Trigger : exempter les corrections et dispatches de la validation date ─

CREATE OR REPLACE FUNCTION fn_valider_date_lettrage()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_date_operation date;
BEGIN
  IF NEW.id_ligne_bancaire IS NULL THEN
    RETURN NEW;
  END IF;

  -- Les corrections et dispatches ont intentionnellement une date ≠ date_operation
  IF NEW.mode IN ('correction', 'dispatch') THEN
    RETURN NEW;
  END IF;

  SELECT DATE(date_operation) INTO v_date_operation
  FROM lignes_bancaires
  WHERE id_operation = NEW.id_ligne_bancaire;

  IF v_date_operation IS NULL THEN
    RETURN NEW;
  END IF;

  IF DATE(NEW.date_lettrage) != v_date_operation THEN
    RAISE EXCEPTION
      'date_lettrage (%) ne correspond pas à la date_operation de la ligne bancaire (%).',
      NEW.date_lettrage, v_date_operation;
  END IF;

  RETURN NEW;
END;
$$;

-- ─── 3. RPC dispatch_411 : correction proportionnelle + mode corrects ────────
--
-- Remplace les versions de migrations 056, 057, 074 et 102.
-- Logique clé :
--   - Correction sur compte 411  : mode='correction', date=CURRENT_DATE
--     → exempté de l'index unique et du trigger de date
--   - Lettrage sur facture réelle : mode='dispatch', date=CURRENT_DATE
--     → exempté du trigger de date, protégé par l'index unique
--   - Vérification du crédit disponible NET (source - corrections déjà passées)
--     pour éviter les sur-dispatches lors de dispatches partiels successifs.

CREATE OR REPLACE FUNCTION dispatch_411(
  p_numero_411   text,
  p_operateur    text,
  p_lettrages    jsonb   -- [{numero_facture, code_client, montant}]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id         uuid    := get_my_organisation_id();
  v_total_dispatch numeric;
  v_source_total   numeric;  -- somme brute des sources positives (calcul proportionnel)
  v_credit_net     numeric;  -- crédit net restant (sources - corrections déjà passées)
  v_temp           record;
  v_commentaire    text;
BEGIN
  v_commentaire := 'Dispatché depuis ' || p_numero_411
                 || ' le ' || CURRENT_DATE
                 || ' — opérateur ' || p_operateur;

  SELECT COALESCE(SUM((l->>'montant')::numeric), 0)
  INTO   v_total_dispatch
  FROM   jsonb_array_elements(p_lettrages) AS l;

  IF v_total_dispatch <= 0 THEN
    RAISE EXCEPTION 'Montant dispatch invalide';
  END IF;

  -- Somme brute des sources positives (pour le calcul proportionnel)
  SELECT COALESCE(SUM(montant), 0)
  INTO   v_source_total
  FROM   lettrages
  WHERE  numero_facture  = p_numero_411
    AND  organisation_id = v_org_id
    AND  montant         > 0
    AND  annule          = false;

  IF v_source_total <= 0 THEN
    RAISE EXCEPTION 'Aucun lettrage source actif pour %', p_numero_411;
  END IF;

  -- Crédit net réel (inclut les corrections déjà passées lors de dispatches partiels)
  SELECT COALESCE(SUM(montant), 0)
  INTO   v_credit_net
  FROM   lettrages
  WHERE  numero_facture  = p_numero_411
    AND  organisation_id = v_org_id
    AND  annule          = false;

  IF v_credit_net <= 0.005 THEN
    RAISE EXCEPTION 'Aucun crédit disponible sur le compte %', p_numero_411;
  END IF;

  IF v_total_dispatch > v_credit_net + 0.01 THEN
    RAISE EXCEPTION 'Montant dispatch (%) supérieur au crédit disponible (%)',
      v_total_dispatch, v_credit_net;
  END IF;

  FOR v_temp IN
    SELECT id, id_ligne_bancaire, montant, code_client
    FROM   lettrages
    WHERE  numero_facture  = p_numero_411
      AND  organisation_id = v_org_id
      AND  montant         > 0
      AND  annule          = false
    ORDER  BY id
  LOOP
    -- Correction proportionnelle sur le compte 411
    -- (mode='correction' → exempté de l'index unique et du trigger de date)
    INSERT INTO lettrages (
      id_ligne_bancaire, numero_facture, code_client, montant,
      date_lettrage, mode, commentaire, operateur, organisation_id
    ) VALUES (
      v_temp.id_ligne_bancaire,
      p_numero_411,
      v_temp.code_client,
      -ROUND(v_total_dispatch * v_temp.montant / v_source_total, 2),
      CURRENT_DATE,
      'correction',
      v_commentaire,
      p_operateur,
      v_org_id
    );

    -- Lettrages réels sur les factures cibles
    -- (mode='dispatch' → exempté du trigger de date, protégé par index unique)
    INSERT INTO lettrages (
      id_ligne_bancaire, numero_facture, code_client, montant,
      date_lettrage, mode, commentaire, operateur, organisation_id
    )
    SELECT
      v_temp.id_ligne_bancaire,
      NULLIF(TRIM(l->>'numero_facture'), ''),
      TRIM(l->>'code_client'),
      ROUND((l->>'montant')::numeric * v_temp.montant / v_source_total, 2),
      CURRENT_DATE,
      'dispatch',
      v_commentaire,
      p_operateur,
      v_org_id
    FROM jsonb_array_elements(p_lettrages) AS l
    WHERE (l->>'montant')::numeric > 0;
  END LOOP;
END;
$$;
