-- Migration 165 : restaurer la purge de l'historique de alertes_score
--
-- POURQUOI. Cette purge a deja existe. La migration 101 (juillet 2026) l'avait
--   ajoutee, avec le meme constat : "les lignes des jours precedents
--   s'accumulaient indefiniment". La migration 121 a reecrit la fonction en
--   partant d'une base ANTERIEURE a la 101. La ligne a disparu sans un mot, et
--   aucune version depuis ne l'a reprise : 121, 127, 157, 158, 159, 163, 164.
--   Les deux dernieres sont de moi : j'ai propage la regression en repartant
--   de la 159 sans voir ce qui manquait.
--
--   Constat du 2026-09-24 : 292 530 lignes sur 49 jours pour 7 307 utiles.
--   97,5 % de la table est morte. Elle pese 52 Mo, deuxieme table de la base.
--
-- CE QUI CHANGE. Une ligne, celle de la 101 : la purge des lignes anterieures
--   au jour courant, executee a chaque recalcul. Plus une purge immediate du
--   passe deja accumule, en tete de ce fichier.
--
-- POURQUOI C'EST SANS RISQUE. Verifie le 2026-09-24 : deux lecteurs seulement,
--   useAlertesScore.ts:35 et score-digest/index.ts:171, tous deux filtrent sur
--   date_calcul = aujourd'hui. Personne ne lit l'historique. Il serait
--   inexploitable de toute facon : la formule a connu TREIZE versions, dont
--   cinq en cinq jours. Un graphique d'evolution montrerait des changements de
--   regle, pas la degradation d'un client.
--
-- A 100 ORGANISATIONS. Sans cette ligne la table atteindrait ~12 Go par an.
--   Avec elle elle reste a ~180 000 lignes, ~35 Mo, constant.
--
-- REGLE A TENIR. Toute version future de calculer_scores_org doit repartir de
--   la fonction REELLEMENT EN PRODUCTION (SELECT prosrc FROM pg_proc WHERE
--   proname = 'calculer_scores_org'), jamais d'un fichier de migration, meme
--   recent. C'est comme ca que la 101 et le modele de cron 037 ont ete perdus.
--
-- RETOUR ARRIERE : rejouer 164_niveau_relance_externe_seul.sql. L'historique
--   deja efface, lui, ne revient pas : il n'est recuperable que par une
--   restauration de sauvegarde Supabase.

-- ── 0. Purge immediate du passe accumule ──────────────────────────
-- Attendu : environ 285 000 lignes retirees, 7 307 conservees.
DELETE FROM alertes_score WHERE date_calcul < current_date;

-- ── 1. Colonnes ────────────────────────────────────────────────────────────────
ALTER TABLE alertes_score
  ADD COLUMN IF NOT EXISTS niveau_relance SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS est_gele        BOOLEAN  NOT NULL DEFAULT false,
  -- NULL = jamais relance sur les factures actuellement ouvertes
  ADD COLUMN IF NOT EXISTS jours_derniere_relance INT;

-- ── 2. Fonction mise à jour (reprend v158 + calcul niveau_relance / est_gele) ─
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

  -- Purge de l'historique : la table ne garde que l'etat courant. Ligne de la
  -- migration 101, perdue par la 121, restauree ici. Personne ne lit le passe.
  DELETE FROM alertes_score
  WHERE organisation_id = p_organisation_id AND date_calcul < v_today;

  -- Recalcul du jour : retire les lignes d'aujourd'hui avant reinsertion
  DELETE FROM alertes_score
  WHERE organisation_id = p_organisation_id AND date_calcul = v_today;

  INSERT INTO alertes_score (
    organisation_id, code_client, nom_client,
    encours_ttc, retard_max_jours,
    score_risque, score_fil_du_jour,
    niveau_relance, jours_derniere_relance, est_gele,
    date_calcul
  )
  WITH
  delais_clients AS (
    SELECT code_dso, COALESCE(delai_alerte_jours, v_delai_org) AS delai
    FROM clients
    WHERE organisation_id = p_organisation_id
  ),

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
      COUNT(*)                                                                AS nb_impayees,
      -- Tableau des numéros de pièce actuellement impayés : sert à l'overlap
      -- avec les relances historiques pour calculer niveau_relance.
      ARRAY_AGG(f.numero_piece)                                              AS factures_ids_ouvertes
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

  bodacc_actif AS (
    SELECT DISTINCT code_client, true AS actif
    FROM alertes_risque
    WHERE organisation_id = p_organisation_id
      AND type_procedure != 'cloture'
  ),

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

  -- Niveau de relance : compte TOUTES les relances envoyées portant sur au moins
  -- une facture encore impayée aujourd'hui (overlap &&), sans condition d'âge.
  -- Plafonné à 3 : au-delà c'est toujours N3 (mise en demeure).
  -- Les jours sont calculés sur la même population : niveau et ancienneté
  -- décrivent exactement les mêmes relances, sinon la ligne affichée est fausse.
  niveau_relance_client AS (
    SELECT
      ea.code_client,
      LEAST(3, COUNT(r.id))::smallint        AS niveau,
      (v_today - MAX(r.envoyee_le)::date)::int AS jours
    FROM encours_actifs ea
    JOIN relances r
      ON  r.code_client      = ea.code_client
      AND r.organisation_id  = p_organisation_id
      AND r.statut           != 'brouillon'
      AND r.envoyee_le       IS NOT NULL
      -- Les relances internes notifient un commercial, pas le client :
      -- elles n'ont rien a faire dans un niveau de relance client.
      AND r.type             = 'externe'
      AND r.factures_ids     && ea.factures_ids_ouvertes
    GROUP BY ea.code_client
  ),

  scores AS (
    SELECT
      e.code_client,
      e.encours_ttc,
      COALESCE(e.retard_max_jours, 0) AS retard_max_jours,

      LEAST(10, GREATEST(0,
        CASE
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert, 0) = 0 THEN 0
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <=  7  THEN (COALESCE(r3.moy, e.delai_moyen_ouvert) / 7.0) * 3
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <= 30  THEN 3  + ((COALESCE(r3.moy, e.delai_moyen_ouvert) - 7)  / 23.0) * 4
          WHEN COALESCE(r3.moy, e.delai_moyen_ouvert) <= 60  THEN 7  + ((COALESCE(r3.moy, e.delai_moyen_ouvert) - 30) / 30.0) * 3
          ELSE 10
        END
      )) AS pts_comportement,

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

      CASE
        WHEN COALESCE(e.retard_max_jours, 0) <= 0  THEN 0
        WHEN e.retard_max_jours <=  30             THEN 0
        WHEN e.retard_max_jours <=  60             THEN 5
        WHEN e.retard_max_jours <=  90             THEN 12
        WHEN e.retard_max_jours <= 180             THEN 17
        ELSE                                            20
      END AS pts_anciennete,

      CASE cl.statut_juridique
        WHEN 'sauvegarde'   THEN 12
        WHEN 'redressement' THEN 20
        WHEN 'liquidation'  THEN 20
        ELSE 0
      END AS pts_statut_juridique,

      CASE WHEN b.actif THEN 10 ELSE 0 END AS pts_bodacc,

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

      CASE
        WHEN COALESCE(p.mois_impaye_distincts, 0) <= 1                                                   THEN 0
        WHEN p.mois_impaye_distincts::numeric / LEAST(p.duree_relation_mois, 12) < 0.30                  THEN 3
        WHEN p.mois_impaye_distincts::numeric / LEAST(p.duree_relation_mois, 12) < 0.50                  THEN 7
        WHEN p.mois_impaye_distincts::numeric / LEAST(p.duree_relation_mois, 12) < 0.70                  THEN 11
        ELSE 15
      END AS pts_persistance,

      CASE cl.statut_juridique
        WHEN 'sauvegarde'   THEN 60
        WHEN 'redressement' THEN 75
        WHEN 'liquidation'  THEN 90
        ELSE 0
      END AS score_plancher,

      COALESCE(b.actif, false)             AS bodacc_actif,
      COALESCE(dr.jours_sans_relance, 999) AS jours_sans_relance

    FROM encours_actifs e
    JOIN clients cl ON cl.code_dso = e.code_client
      AND cl.organisation_id = p_organisation_id
      AND (cl.alerte_snooze_jusqu_au IS NULL OR cl.alerte_snooze_jusqu_au < v_today)
    CROSS JOIN p25_facture_org pf
    CROSS JOIN p75_encours_org pe
    LEFT JOIN retard_3m        r3  ON r3.code_client  = e.code_client
    LEFT JOIN retard_12m       r12 ON r12.code_client = e.code_client
    LEFT JOIN bodacc_actif     b   ON b.code_client   = e.code_client
    LEFT JOIN persistance      p   ON p.code_client   = e.code_client
    LEFT JOIN derniere_relance dr  ON dr.code_client  = e.code_client
    WHERE e.nb_echu > 0
  ),

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
    CASE
      WHEN sf.pts_statut_juridique > 0 THEN 0
      WHEN sf.bodacc_actif             THEN 0
      WHEN sf.jours_sans_relance < 7   THEN 0
      ELSE LEAST(100, ROUND(
        sf.score_risque_final * 0.60 +
        LEAST(40, sf.jours_sans_relance) * 1.0
      ))::int
    END                                                        AS score_fil_du_jour,
    COALESCE(nr.niveau, 0)                                     AS niveau_relance,
    nr.jours                                                   AS jours_derniere_relance,
    (sf.pts_statut_juridique > 0 OR sf.bodacc_actif)           AS est_gele,
    v_today
  FROM scores_finaux sf
  JOIN clients cl2 ON cl2.code_dso = sf.code_client
    AND cl2.organisation_id = p_organisation_id
  LEFT JOIN niveau_relance_client nr ON nr.code_client = sf.code_client
  ORDER BY sf.score_risque_final DESC;

  GET DIAGNOSTICS v_nb = ROW_COUNT;
  RETURN QUERY SELECT v_nb, v_nb;
END;
$$;
