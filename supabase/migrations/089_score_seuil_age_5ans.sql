-- Migration 089 : ajuste le seuil d'exclusion des vieilles factures de 3 ans à 5 ans
-- Le filtre 3 ans excluait toutes les factures éligibles d'Elise (écheances 2022)
-- 5 ans = exclut les factures antérieures à 2021, conserve 2022 et après

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
  delais_clients AS (
    SELECT code_dso, COALESCE(delai_alerte_jours, v_delai_org) AS delai
    FROM clients
    WHERE organisation_id = p_organisation_id
  ),
  nb_factures_total AS (
    SELECT code_client, COUNT(*) AS nb_all
    FROM factures
    WHERE organisation_id = p_organisation_id
      AND est_avoir = false
      AND numero_piece NOT LIKE '411_%'
      AND COALESCE(date_echeance, date_emission) >= v_seuil_age
    GROUP BY code_client
  ),
  encours_actifs AS (
    SELECT
      f.code_client,
      SUM(f.reste_du)                                                           AS encours_ttc,
      MAX(GREATEST(0, v_today - f.date_echeance))
        FILTER (WHERE f.date_echeance IS NOT NULL)::int                         AS retard_max_jours,
      AVG(GREATEST(0, v_today - f.date_echeance))
        FILTER (WHERE f.date_echeance IS NOT NULL
                  AND f.date_echeance < v_today)::numeric                       AS delai_moyen_ouvert,
      COUNT(*) FILTER (
        WHERE d.delai IS NOT NULL AND f.date_echeance IS NOT NULL
          AND f.date_echeance + d.delai < v_today
      )                                                                          AS nb_echu,
      COUNT(*)                                                                   AS nb_impayees
    FROM factures f
    LEFT JOIN delais_clients d ON d.code_dso = f.code_client
    WHERE f.organisation_id = p_organisation_id
      AND f.reste_du > 0.005
      AND f.est_avoir = false
      AND COALESCE(f.date_echeance, f.date_emission) >= v_seuil_age
    GROUP BY f.code_client
    HAVING SUM(f.reste_du) > 0
  ),
  retard_3m AS (
    SELECT l.code_client,
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
  retard_12m AS (
    SELECT l.code_client,
      AVG(GREATEST(0, l.date_lettrage::date - f.date_echeance))::numeric AS moy
    FROM lettrages l
    JOIN factures f ON f.numero_piece = l.numero_facture
      AND f.organisation_id = p_organisation_id
    WHERE l.date_lettrage >= v_today - INTERVAL '12 months'
      AND f.date_echeance IS NOT NULL
      AND f.est_avoir = false
      AND l.code_client != 'AUTRES'
    GROUP BY l.code_client
  ),
  tendance AS (
    SELECT code_client,
      COALESCE(regr_slope(retard_j, rn), 0)::numeric AS pente
    FROM (
      SELECT
        l.code_client,
        ROW_NUMBER() OVER (PARTITION BY l.code_client ORDER BY l.date_lettrage) AS rn,
        GREATEST(0, l.date_lettrage::date - f.date_echeance)::numeric           AS retard_j
      FROM (
        SELECT l2.code_client, l2.date_lettrage, l2.numero_facture,
          ROW_NUMBER() OVER (PARTITION BY l2.code_client ORDER BY l2.date_lettrage DESC) AS rk
        FROM lettrages l2
        JOIN factures f2 ON f2.numero_piece = l2.numero_facture
          AND f2.organisation_id = p_organisation_id
        WHERE l2.code_client != 'AUTRES'
          AND l2.numero_facture IS NOT NULL
      ) l
      JOIN factures f ON f.numero_piece = l.numero_facture
        AND f.organisation_id = p_organisation_id
        AND f.date_echeance IS NOT NULL
      WHERE l.rk <= 6
    ) sub
    GROUP BY code_client
    HAVING COUNT(*) >= 3
  ),
  bodacc_actif AS (
    SELECT DISTINCT code_client, true AS actif
    FROM alertes_risque
    WHERE organisation_id = p_organisation_id
      AND type_procedure != 'cloture'
  ),
  scores AS (
    SELECT
      e.code_client,
      e.encours_ttc,
      COALESCE(e.retard_max_jours, 0) AS retard_max_jours,
      LEAST(30, GREATEST(0,
        CASE
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert, 0) = 0 THEN 0
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <=  7  THEN (COALESCE(r3.moy, e.delai_moyen_ouvert) / 7.0)   * 10
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <= 15  THEN 10 + ((COALESCE(r3.moy, e.delai_moyen_ouvert) -  7) /  8.0) * 15
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <= 30  THEN 25 + ((COALESCE(r3.moy, e.delai_moyen_ouvert) - 15) / 15.0) * 25
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <= 60  THEN 50 + ((COALESCE(r3.moy, e.delai_moyen_ouvert) - 30) / 30.0) * 25
          ELSE 75 + LEAST(25, ((COALESCE(r3.moy, e.delai_moyen_ouvert) - 60) / 30.0) * 25)
        END
      )) AS pts_retard,
      CASE
        WHEN COALESCE(r12.moy, 0) < 1                THEN 0
        WHEN r3.moy / NULLIF(r12.moy,0) >= 2.0       THEN 20
        WHEN r3.moy / NULLIF(r12.moy,0) >= 1.5       THEN 14
        WHEN r3.moy / NULLIF(r12.moy,0) >= 1.2       THEN 8
        ELSE                                               0
      END AS pts_rupture,
      LEAST(20, GREATEST(0, COALESCE(t.pente, 0) * 2))  AS pts_tendance,
      CASE WHEN COALESCE(nft.nb_all, e.nb_impayees) > 0
        THEN LEAST(20, (e.nb_echu::float / COALESCE(nft.nb_all, e.nb_impayees)) * 20)
        ELSE 0
      END                                                AS pts_echu,
      CASE WHEN b.actif THEN 10 ELSE 0 END              AS pts_bodacc
    FROM encours_actifs e
    JOIN clients cl ON cl.code_dso = e.code_client
      AND cl.organisation_id = p_organisation_id
      AND (cl.alerte_snooze_jusqu_au IS NULL OR cl.alerte_snooze_jusqu_au < v_today)
    LEFT JOIN nb_factures_total nft ON nft.code_client = e.code_client
    LEFT JOIN retard_3m   r3  ON r3.code_client  = e.code_client
    LEFT JOIN retard_12m  r12 ON r12.code_client = e.code_client
    LEFT JOIN tendance    t   ON t.code_client   = e.code_client
    LEFT JOIN bodacc_actif b  ON b.code_client   = e.code_client
    WHERE e.nb_echu > 0
  )
  SELECT
    p_organisation_id,
    s.code_client,
    cl2.nom,
    s.encours_ttc,
    s.retard_max_jours,
    LEAST(100, ROUND(s.pts_retard + s.pts_rupture + s.pts_tendance + s.pts_echu + s.pts_bodacc))::int,
    v_today
  FROM scores s
  JOIN clients cl2 ON cl2.code_dso = s.code_client
    AND cl2.organisation_id = p_organisation_id
  ORDER BY (s.pts_retard + s.pts_rupture + s.pts_tendance + s.pts_echu + s.pts_bodacc) DESC;

  GET DIAGNOSTICS v_nb = ROW_COUNT;
  RETURN QUERY SELECT v_nb, v_nb;
END;
$$;
