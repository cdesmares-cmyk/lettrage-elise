-- Migration 074 : 411/471 — renommage + correction dispatch partiel
-- 1. Renomme en_attente_471 → en_attente_411 sur lignes_bancaires
-- 2. Recrée la vue avec le nouveau nom de colonne et de statut
-- 3. Corrige dispatch_411 pour les dispatches partiels

-- ─── 1. Renommage colonne ────────────────────────────────────────────────────
ALTER TABLE lignes_bancaires RENAME COLUMN en_attente_471 TO en_attente_411;

-- ─── 2. Vue v_lignes_bancaires_avec_statut ───────────────────────────────────
DROP VIEW IF EXISTS v_lignes_bancaires_avec_statut;

CREATE VIEW v_lignes_bancaires_avec_statut
WITH (security_invoker = true)
AS
SELECT
  lb.id_operation,
  lb.date_operation,
  lb.libelle,
  lb.detail,
  lb.infos_complementaires,
  lb.debit,
  lb.credit,
  lb.code_client_propose,
  lb.import_id,
  lb.created_at,
  lb.en_attente_411,
  COALESCE(SUM(l.montant), 0)::numeric(12,2)                                AS montant_lettre,
  (COALESCE(lb.credit, 0) - COALESCE(SUM(l.montant), 0))::numeric(12,2)   AS restant,
  CASE
    WHEN lb.credit IS NULL OR lb.credit = 0                                 THEN 'debit'
    WHEN lb.en_attente_411 = true                                           THEN 'en_attente_411'
    WHEN COALESCE(SUM(l.montant), 0) <= 0                                   THEN 'non_lettre'
    WHEN ABS(COALESCE(lb.credit, 0) - COALESCE(SUM(l.montant), 0)) < 0.01 THEN 'lettre'
    ELSE 'partiel'
  END                                                                        AS statut_lettrage,
  MAX(l.date_lettrage)                                                       AS derniere_date_lettrage,
  (COALESCE(SUM(CASE WHEN l.code_client = '471' THEN l.montant ELSE 0 END), 0) > 0.005) AS est_virement_471,
  lb.organisation_id
FROM lignes_bancaires lb
LEFT JOIN lettrages l
  ON  l.id_ligne_bancaire = lb.id_operation
  AND l.organisation_id   = lb.organisation_id
  AND l.annule            = false
WHERE lb.organisation_id = get_my_organisation_id()
GROUP BY
  lb.id_operation, lb.date_operation, lb.libelle, lb.detail,
  lb.infos_complementaires, lb.debit, lb.credit,
  lb.code_client_propose, lb.import_id, lb.created_at,
  lb.en_attente_411, lb.organisation_id;

-- ─── 3. RPC dispatch_411 : correction proportionnelle (dispatch partiel) ─────
-- Ancienne formule : correction = -v_temp.montant (full reversal) → faux si partiel
-- Nouvelle formule : correction = -v_total_dispatch * v_temp.montant / v_source_total
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
  v_org_id         uuid := get_my_organisation_id();
  v_total_dispatch numeric;  -- montant dispatché dans cet appel
  v_source_total   numeric;  -- crédit total actif sur le compte 411
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

  -- Total des lettrages source actifs (crédit réel disponible sur ce compte 411)
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

  IF v_total_dispatch > v_source_total + 0.01 THEN
    RAISE EXCEPTION 'Montant dispatch (%) supérieur au crédit disponible (%)',
      v_total_dispatch, v_source_total;
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
    -- Correction proportionnelle au dispatch courant (pas un full reversal)
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

    -- Lettrages réels proportionnels sur les lignes source
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
      'manuel',
      v_commentaire,
      p_operateur,
      v_org_id
    FROM jsonb_array_elements(p_lettrages) AS l
    WHERE (l->>'montant')::numeric > 0;
  END LOOP;
END;
$$;
