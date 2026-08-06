-- Migration 121 : Score v2 — nouvelle formule de notation risque client
--
-- 6 composants, total 100 pts, seuils d'exposition dynamiques par organisation
--
-- Composant          | Poids | Ce qui change vs v1
-- -------------------|-------|---------------------------------------------
-- 1. Comportement    | 0-15  | Réduit (était 30) — payeur lent = irritant, pas critique
-- 2. Rupture/Silence | 0-25  | Silence (0 paiement 3m + impayé) = 22-25 pts, corrige le bug v1
-- 3. Ancienneté      | 0-20  | Âge de la plus vieille facture impayée (seuil 60j)
-- 4. Statut juridique| 0-20  | NOUVEAU — lu depuis clients.statut_juridique, + plancher de score
-- 5. BODACC          | 0-10  | Inchangé
-- 6. Exposition      | 0-10  | NOUVEAU — seuils relatifs aux percentiles de l'organisation

CREATE OR REPLACE FUNCTION calculer_scores_org(p_organisation_id UUID)
RETURNS TABLE(clients_traites INT, alertes_inserees INT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_delai_org  INT;
  v_today      DATE := current_date;
  v_seuil_age  DATE := current_date - INTERVAL '5 years';
  v_nb         INT;
BEGIN
  SELECT COALESCE(delai_alerte_jours, 25) INTO v_delai_org
  FROM organisations WHERE id = p_organisation_id;

  DELETE FROM alertes_score
  WHERE organisation_id = p_organisation_id AND date_calcul = v_today;

  INSERT INTO alertes_score (organisation_id, code_client, nom_client, encours_ttc, retard_max_jours, score_risque, date_calcul)
  WITH
  -- ── Délais d'alerte par client ────────────────────────────────────────────
  delais_clients AS (
    SELECT code_dso, COALESCE(delai_alerte_jours, v_delai_org) AS delai
    FROM clients
    WHERE organisation_id = p_organisation_id
  ),

  -- ── Factures impayées actives ─────────────────────────────────────────────
  encours_actifs AS (
    SELECT
      f.code_client,
      SUM(f.reste_du)                                                        AS encours_ttc,
      MAX(GREATEST(0, v_today - f.date_echeance))
        FILTER (WHERE f.date_echeance IS NOT NULL)::int                      AS retard_max_jours,
      AVG(GREATEST(0, v_today - f.date_echeance))
        FILTER (WHERE f.date_echeance IS NOT NULL
                  AND f.date_echeance < v_today)::numeric                    AS delai_moyen_ouvert,
      COUNT(*) FILTER (
        WHERE d.delai IS NOT NULL AND f.date_echeance IS NOT NULL
          AND f.date_echeance + d.delai < v_today
      )                                                                       AS nb_echu,
      COUNT(*)                                                                AS nb_impayees
    FROM factures f
    LEFT JOIN delais_clients d ON d.code_dso = f.code_client
    WHERE f.organisation_id = p_organisation_id
      AND f.reste_du > 0.005
      AND f.est_avoir = false
      AND COALESCE(f.date_echeance, f.date_emission) >= v_seuil_age
    GROUP BY f.code_client
    HAVING SUM(f.reste_du) > 0
  ),

  -- ── Historique paiements 3 mois ───────────────────────────────────────────
  retard_3m AS (
    SELECT
      l.code_client,
      AVG(GREATEST(0, l.date_lettrage::date - f.date_echeance))::numeric AS moy,
      COUNT(*) AS nb_lettrages
    FROM lettrages l
    JOIN factures f ON f.numero_piece = l.numero_facture
      AND f.organisation_id = p_organisation_id
    WHERE l.date_lettrage >= v_today - INTERVAL '3 months'
      AND f.date_echeance IS NOT NULL
      AND f.est_avoir = false
      AND l.code_client != 'AUTRES'
    GROUP BY l.code_client
  ),

  -- ── Historique paiements 12 mois ──────────────────────────────────────────
  retard_12m AS (
    SELECT
      l.code_client,
      AVG(GREATEST(0, l.date_lettrage::date - f.date_echeance))::numeric AS moy,
      COUNT(*) AS nb_lettrages
    FROM lettrages l
    JOIN factures f ON f.numero_piece = l.numero_facture
      AND f.organisation_id = p_organisation_id
    WHERE l.date_lettrage >= v_today - INTERVAL '12 months'
      AND f.date_echeance IS NOT NULL
      AND f.est_avoir = false
      AND l.code_client != 'AUTRES'
    GROUP BY l.code_client
  ),

  -- ── BODACC : procédure active hors clôture ────────────────────────────────
  bodacc_actif AS (
    SELECT DISTINCT code_client, true AS actif
    FROM alertes_risque
    WHERE organisation_id = p_organisation_id
      AND type_procedure != 'cloture'
  ),

  -- ── P25 montant facture de l'organisation (seuil micro-facture) ───────────
  p25_facture_org AS (
    SELECT COALESCE(
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY montant_ttc)::numeric,
      75  -- fallback si pas assez de données
    ) AS val
    FROM factures
    WHERE organisation_id = p_organisation_id
      AND montant_ttc > 0
      AND est_avoir = false
      AND numero_piece NOT LIKE '411_%'
  ),

  -- ── P75 encours par client de l'organisation (seuil forte exposition) ─────
  p75_encours_org AS (
    SELECT COALESCE(
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY enc)::numeric,
      2000  -- fallback si pas assez de données
    ) AS val
    FROM (
      SELECT SUM(reste_du) AS enc
      FROM factures
      WHERE organisation_id = p_organisation_id
        AND reste_du > 0.005
        AND est_avoir = false
      GROUP BY code_client
    ) sub
  ),

  -- ── Calcul des 6 composants ───────────────────────────────────────────────
  scores AS (
    SELECT
      e.code_client,
      e.encours_ttc,
      COALESCE(e.retard_max_jours, 0) AS retard_max_jours,

      -- 1. COMPORTEMENT HABITUEL (0-15 pts)
      --    Retard moyen pondéré. Réduit vs v1 : payeur lent mais régulier = irritant, pas critique.
      LEAST(15, GREATEST(0,
        CASE
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert, 0) = 0 THEN 0
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <=  7  THEN (COALESCE(r3.moy, e.delai_moyen_ouvert) / 7.0) * 5
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <= 30  THEN 5  + ((COALESCE(r3.moy, e.delai_moyen_ouvert) - 7)  / 23.0) * 5
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <= 60  THEN 10 + ((COALESCE(r3.moy, e.delai_moyen_ouvert) - 30) / 30.0) * 4
          ELSE 15
        END
      )) AS pts_comportement,

      -- 2. RUPTURE + SILENCE (0-25 pts)
      --    Corrige le bug v1 : le silence donnait 0 (aucune donnée = aucune pénalité).
      --    Désormais : pas de paiement reçu en 3 mois alors qu'il y en avait avant = signal maximal.
      CASE
        WHEN r3.nb_lettrages IS NULL AND r12.nb_lettrages > 0     THEN 25  -- payait, a arrêté
        WHEN r3.nb_lettrages IS NULL AND e.retard_max_jours >= 60 THEN 22  -- jamais payé + retard > 60j
        WHEN r3.nb_lettrages IS NULL                              THEN 0   -- nouveau client sans historique
        WHEN COALESCE(r12.moy, 0) < 1                            THEN 0   -- pas d'historique annuel
        WHEN r3.moy / NULLIF(r12.moy, 0) >= 2.0                  THEN 20  -- dégradation majeure
        WHEN r3.moy / NULLIF(r12.moy, 0) >= 1.5                  THEN 14
        WHEN r3.moy / NULLIF(r12.moy, 0) >= 1.2                  THEN 8
        ELSE 0
      END AS pts_rupture_silence,

      -- 3. ANCIENNETÉ DE L'IMPAYÉ (0-20 pts)
      --    Âge de la facture impayée la plus ancienne. Seuil 60j = point d'alerte métier.
      CASE
        WHEN COALESCE(e.retard_max_jours, 0) <= 0  THEN 0
        WHEN e.retard_max_jours <=  30             THEN 0   -- dans les clous
        WHEN e.retard_max_jours <=  60             THEN 5   -- 60j : ça commence à puer
        WHEN e.retard_max_jours <=  90             THEN 12  -- alerte
        WHEN e.retard_max_jours <= 180             THEN 17  -- grave
        ELSE                                            20  -- contentieux probable
      END AS pts_anciennete,

      -- 4. STATUT JURIDIQUE (0-20 pts) — NOUVEAU
      --    Lu directement depuis clients.statut_juridique, indépendant de BODACC.
      --    Un plancher de score est aussi appliqué dans le SELECT final.
      CASE cl.statut_juridique
        WHEN 'sauvegarde'   THEN 12
        WHEN 'redressement' THEN 20
        WHEN 'liquidation'  THEN 20
        ELSE 0
      END AS pts_statut_juridique,

      -- 5. BODACC (0-10 pts) — inchangé, signal de confirmation externe
      CASE WHEN b.actif THEN 10 ELSE 0 END AS pts_bodacc,

      -- 6. EXPOSITION FINANCIÈRE (0-10 pts) — NOUVEAU, seuils relatifs à l'organisation
      --    A. Impact tréso : encours vs P75 des encours de l'org (0-5 pts)
      CASE
        WHEN e.encours_ttc > pe.val * 2 THEN 5
        WHEN e.encours_ttc > pe.val     THEN 3
        WHEN e.encours_ttc > pe.val / 2 THEN 1
        ELSE 0
      END
      +
      --    B. Coût de recouvrement : montant moyen/facture vs P25 factures de l'org (0-5 pts)
      CASE
        WHEN e.nb_impayees = 0                                    THEN 0
        WHEN (e.encours_ttc / e.nb_impayees) < pf.val             THEN 5  -- sous P25 = micro-factures
        WHEN (e.encours_ttc / e.nb_impayees) < pf.val * 2        THEN 3
        WHEN (e.encours_ttc / e.nb_impayees) < pf.val * 4        THEN 1
        ELSE 0
      END AS pts_exposition,

      -- Plancher de score selon statut juridique (appliqué dans SELECT final)
      CASE cl.statut_juridique
        WHEN 'sauvegarde'   THEN 60
        WHEN 'redressement' THEN 75
        WHEN 'liquidation'  THEN 90
        ELSE 0
      END AS score_plancher

    FROM encours_actifs e
    JOIN clients cl ON cl.code_dso = e.code_client
      AND cl.organisation_id = p_organisation_id
      AND (cl.alerte_snooze_jusqu_au IS NULL OR cl.alerte_snooze_jusqu_au < v_today)
    CROSS JOIN p25_facture_org pf
    CROSS JOIN p75_encours_org pe
    LEFT JOIN retard_3m   r3  ON r3.code_client  = e.code_client
    LEFT JOIN retard_12m  r12 ON r12.code_client = e.code_client
    LEFT JOIN bodacc_actif b  ON b.code_client   = e.code_client
    WHERE e.nb_echu > 0
  )
  SELECT
    p_organisation_id,
    s.code_client,
    cl2.nom,
    s.encours_ttc,
    s.retard_max_jours,
    -- Score final : plancher garanti si statut juridique actif
    GREATEST(
      s.score_plancher,
      LEAST(100, ROUND(
        s.pts_comportement    +
        s.pts_rupture_silence +
        s.pts_anciennete      +
        s.pts_statut_juridique +
        s.pts_bodacc          +
        s.pts_exposition
      ))
    )::int,
    v_today
  FROM scores s
  JOIN clients cl2 ON cl2.code_dso = s.code_client
    AND cl2.organisation_id = p_organisation_id
  ORDER BY (
    s.pts_comportement + s.pts_rupture_silence + s.pts_anciennete +
    s.pts_statut_juridique + s.pts_bodacc + s.pts_exposition
  ) DESC;

  GET DIAGNOSTICS v_nb = ROW_COUNT;
  RETURN QUERY SELECT v_nb, v_nb;
END;
$$;
