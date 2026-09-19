-- Migration 157 : Score persistance + score_fil_du_jour
--
-- Enrichissements :
--   • Composant 7 — Persistance (0-15 pts) : ratio mois avec impayés / durée relation
--     Capte le client qui ne paie jamais vs le client avec un gros impayé ponctuel
--   • Comportement réduit de 15 → 10 pts (payeur lent = irritant, pas critique)
--   • score_fil_du_jour : score opérationnel quotidien pour le "Fil du jour"
--     = f(score_risque, jours depuis dernière relance) — exclu si relancé < 7j
--
-- Total toujours plafonné à 100 pts.

-- ── Nouvelle colonne ──────────────────────────────────────────────────────────
ALTER TABLE alertes_score ADD COLUMN IF NOT EXISTS score_fil_du_jour int DEFAULT 0;

-- ── RPC mise à jour ───────────────────────────────────────────────────────────
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

  INSERT INTO alertes_score (
    organisation_id, code_client, nom_client,
    encours_ttc, retard_max_jours,
    score_risque, score_fil_du_jour,
    date_calcul
  )
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

  -- ── P25 montant facture de l'organisation ────────────────────────────────
  p25_facture_org AS (
    SELECT COALESCE(
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY montant_ttc)::numeric,
      75
    ) AS val
    FROM factures
    WHERE organisation_id = p_organisation_id
      AND montant_ttc > 0
      AND est_avoir = false
      AND numero_piece NOT LIKE '411_%'
  ),

  -- ── P75 encours par client de l'organisation ──────────────────────────────
  p75_encours_org AS (
    SELECT COALESCE(
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY enc)::numeric,
      2000
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

  -- ── PERSISTANCE : fréquence mensuelle des impayés ─────────────────────────
  -- Compte les mois distincts avec au moins une facture impayée vs durée relation
  -- Client avec 10 factures en juillet → mois_impaye = 1 (ponctuel)
  -- Client avec 1 facture/mois sur 10 mois → mois_impaye = 10 (chronique)
  persistance AS (
    SELECT
      code_client,
      COUNT(DISTINCT DATE_TRUNC('month', date_echeance))
        FILTER (WHERE reste_du > 0.005 AND est_avoir = false)::int          AS mois_impaye_distincts,
      GREATEST(1,
        (EXTRACT(YEAR  FROM AGE(v_today, MIN(date_emission)))::int * 12 +
         EXTRACT(MONTH FROM AGE(v_today, MIN(date_emission)))::int)
      )::int                                                                  AS duree_relation_mois
    FROM factures
    WHERE organisation_id = p_organisation_id
      AND COALESCE(date_echeance, date_emission) >= v_seuil_age
    GROUP BY code_client
  ),

  -- ── DERNIÈRE RELANCE : pour le score fil du jour ──────────────────────────
  derniere_relance AS (
    SELECT
      code_client,
      (v_today - MAX(envoyee_le)::date) AS jours_sans_relance
    FROM relances
    WHERE organisation_id = p_organisation_id
      AND statut != 'brouillon'
      AND envoyee_le IS NOT NULL
    GROUP BY code_client
  ),

  -- ── Calcul des composants ─────────────────────────────────────────────────
  scores AS (
    SELECT
      e.code_client,
      e.encours_ttc,
      COALESCE(e.retard_max_jours, 0) AS retard_max_jours,

      -- 1. COMPORTEMENT HABITUEL (0-10 pts) — réduit de 15 à 10 (libère place pour persistance)
      LEAST(10, GREATEST(0,
        CASE
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert, 0) = 0 THEN 0
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <=  7  THEN (COALESCE(r3.moy, e.delai_moyen_ouvert) / 7.0) * 3
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <= 30  THEN 3  + ((COALESCE(r3.moy, e.delai_moyen_ouvert) - 7)  / 23.0) * 4
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <= 60  THEN 7  + ((COALESCE(r3.moy, e.delai_moyen_ouvert) - 30) / 30.0) * 3
          ELSE 10
        END
      )) AS pts_comportement,

      -- 2. RUPTURE + SILENCE (0-25 pts) — inchangé
      CASE
        WHEN r3.nb_lettrages IS NULL AND r12.nb_lettrages > 0     THEN 25
        WHEN r3.nb_lettrages IS NULL AND e.retard_max_jours >= 60 THEN 22
        WHEN r3.nb_lettrages IS NULL                              THEN 0
        WHEN COALESCE(r12.moy, 0) < 1                            THEN 0
        WHEN r3.moy / NULLIF(r12.moy, 0) >= 2.0                  THEN 20
        WHEN r3.moy / NULLIF(r12.moy, 0) >= 1.5                  THEN 14
        WHEN r3.moy / NULLIF(r12.moy, 0) >= 1.2                  THEN 8
        ELSE 0
      END AS pts_rupture_silence,

      -- 3. ANCIENNETÉ DE L'IMPAYÉ (0-20 pts) — inchangé
      CASE
        WHEN COALESCE(e.retard_max_jours, 0) <= 0  THEN 0
        WHEN e.retard_max_jours <=  30             THEN 0
        WHEN e.retard_max_jours <=  60             THEN 5
        WHEN e.retard_max_jours <=  90             THEN 12
        WHEN e.retard_max_jours <= 180             THEN 17
        ELSE                                            20
      END AS pts_anciennete,

      -- 4. STATUT JURIDIQUE (0-20 pts) — inchangé
      CASE cl.statut_juridique
        WHEN 'sauvegarde'   THEN 12
        WHEN 'redressement' THEN 20
        WHEN 'liquidation'  THEN 20
        ELSE 0
      END AS pts_statut_juridique,

      -- 5. BODACC (0-10 pts) — inchangé
      CASE WHEN b.actif THEN 10 ELSE 0 END AS pts_bodacc,

      -- 6. EXPOSITION FINANCIÈRE (0-10 pts) — inchangé
      CASE
        WHEN e.encours_ttc > pe.val * 2 THEN 5
        WHEN e.encours_ttc > pe.val     THEN 3
        WHEN e.encours_ttc > pe.val / 2 THEN 1
        ELSE 0
      END
      +
      CASE
        WHEN e.nb_impayees = 0                                    THEN 0
        WHEN (e.encours_ttc / e.nb_impayees) < pf.val            THEN 5
        WHEN (e.encours_ttc / e.nb_impayees) < pf.val * 2        THEN 3
        WHEN (e.encours_ttc / e.nb_impayees) < pf.val * 4        THEN 1
        ELSE 0
      END AS pts_exposition,

      -- 7. PERSISTANCE (0-15 pts) — NOUVEAU
      -- Ratio mois avec impayé / min(durée relation, 12 mois)
      -- 1 mois → ponctuel = 0 pts. >80% des mois = chronique = 15 pts.
      CASE
        WHEN COALESCE(p.mois_impaye_distincts, 0) <= 1                                                      THEN 0
        WHEN p.mois_impaye_distincts::numeric / LEAST(p.duree_relation_mois, 12) < 0.30                     THEN 3
        WHEN p.mois_impaye_distincts::numeric / LEAST(p.duree_relation_mois, 12) < 0.50                     THEN 7
        WHEN p.mois_impaye_distincts::numeric / LEAST(p.duree_relation_mois, 12) < 0.70                     THEN 11
        ELSE 15
      END AS pts_persistance,

      -- Score plancher statut juridique
      CASE cl.statut_juridique
        WHEN 'sauvegarde'   THEN 60
        WHEN 'redressement' THEN 75
        WHEN 'liquidation'  THEN 90
        ELSE 0
      END AS score_plancher,

      -- Jours sans relance (pour score fil du jour)
      COALESCE(dr.jours_sans_relance, 999) AS jours_sans_relance

    FROM encours_actifs e
    JOIN clients cl ON cl.code_dso = e.code_client
      AND cl.organisation_id = p_organisation_id
      AND (cl.alerte_snooze_jusqu_au IS NULL OR cl.alerte_snooze_jusqu_au < v_today)
    CROSS JOIN p25_facture_org pf
    CROSS JOIN p75_encours_org pe
    LEFT JOIN retard_3m       r3  ON r3.code_client  = e.code_client
    LEFT JOIN retard_12m      r12 ON r12.code_client = e.code_client
    LEFT JOIN bodacc_actif    b   ON b.code_client   = e.code_client
    LEFT JOIN persistance     p   ON p.code_client   = e.code_client
    LEFT JOIN derniere_relance dr ON dr.code_client  = e.code_client
    WHERE e.nb_echu > 0
  ),

  -- ── Score final avec score_fil_du_jour ───────────────────────────────────
  scores_finaux AS (
    SELECT
      s.*,
      GREATEST(
        s.score_plancher,
        LEAST(100, (
          s.pts_comportement    +
          s.pts_rupture_silence +
          s.pts_anciennete      +
          s.pts_statut_juridique +
          s.pts_bodacc          +
          s.pts_exposition      +
          s.pts_persistance
        ))
      )::int AS score_risque_final
    FROM scores s
  )

  SELECT
    p_organisation_id,
    sf.code_client,
    cl2.nom,
    sf.encours_ttc,
    sf.retard_max_jours,
    sf.score_risque_final,
    -- Score fil du jour : 0 si relancé < 7j, sinon combo risque + ancienneté relance
    CASE
      WHEN sf.jours_sans_relance < 7 THEN 0
      ELSE LEAST(100, ROUND(
        sf.score_risque_final * 0.60 +
        LEAST(40, sf.jours_sans_relance) * 1.0
      ))::int
    END AS score_fil_du_jour,
    v_today
  FROM scores_finaux sf
  JOIN clients cl2 ON cl2.code_dso = sf.code_client
    AND cl2.organisation_id = p_organisation_id
  ORDER BY sf.score_risque_final DESC;

  GET DIAGNOSTICS v_nb = ROW_COUNT;
  RETURN QUERY SELECT v_nb, v_nb;
END;
$$;
