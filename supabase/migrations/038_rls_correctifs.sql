-- Migration 038 : Correctifs RLS — 5 vulnérabilités identifiées à l'audit
-- 1. alertes_score       — RLS absent
-- 2. contacts_client     — organisation_id manquante, isolation inexistante
-- 3. match_clients_par_siren() — fuite cross-org si appelée côté client
-- 4. bulk_update_axonaut_pdf() — org_id non validé
-- 5. calculer_scores_org()    — org_id non validé

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. alertes_score — activation RLS + policy isolation
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE alertes_score ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alertes_score_org_isolation" ON alertes_score
  FOR ALL USING (organisation_id = get_my_organisation_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. contacts_client — ajout organisation_id + isolation
-- ═══════════════════════════════════════════════════════════════════════════

-- Ajout de la colonne (nullable d'abord pour la rétro-compatibilité)
ALTER TABLE contacts_client
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id);

-- Peuple les lignes existantes via la table clients
UPDATE contacts_client cc
SET organisation_id = c.organisation_id
FROM clients c
WHERE c.code_dso = cc.code_client
  AND cc.organisation_id IS NULL;

-- Rend la colonne obligatoire
ALTER TABLE contacts_client
  ALTER COLUMN organisation_id SET NOT NULL;

-- Index pour les requêtes filtrées par org
CREATE INDEX IF NOT EXISTS contacts_client_org_idx
  ON contacts_client (organisation_id);

-- Trigger auto-injection (réutilise la fonction partagée de migration 019)
CREATE TRIGGER contacts_client_inject_org_id
  BEFORE INSERT ON contacts_client
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

-- Supprime les anciennes policies insuffisantes
DROP POLICY IF EXISTS "contacts_select_authenticated" ON contacts_client;
DROP POLICY IF EXISTS "contacts_insert_operateurs"    ON contacts_client;
DROP POLICY IF EXISTS "contacts_update_operateurs"    ON contacts_client;
DROP POLICY IF EXISTS "contacts_delete_admin"         ON contacts_client;

-- Nouvelle policy unifiée : isolation par organisation
CREATE POLICY "contacts_client_org_isolation" ON contacts_client
  FOR ALL USING (organisation_id = get_my_organisation_id());

-- Restriction écriture : admin + responsable_poste_client uniquement
CREATE POLICY "contacts_client_write_restriction" ON contacts_client
  FOR INSERT WITH CHECK (
    organisation_id = get_my_organisation_id()
    AND get_my_role() IN ('admin', 'responsable_poste_client')
  );

CREATE POLICY "contacts_client_update_restriction" ON contacts_client
  FOR UPDATE USING (
    organisation_id = get_my_organisation_id()
    AND get_my_role() IN ('admin', 'responsable_poste_client')
  );

CREATE POLICY "contacts_client_delete_restriction" ON contacts_client
  FOR DELETE USING (
    organisation_id = get_my_organisation_id()
    AND get_my_role() = 'admin'
  );


-- ═══════════════════════════════════════════════════════════════════════════
-- 3. match_clients_par_siren() — restriction au contexte appelant
-- Service role (Edge Function bodacc-sync) : voit toutes les orgs (auth.uid() IS NULL)
-- Utilisateur authentifié : voit uniquement son org
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION match_clients_par_siren(sirens text[])
RETURNS TABLE(code_dso text, siret text, organisation_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT code_dso, siret, organisation_id
  FROM clients
  WHERE siret IS NOT NULL
    AND siret != ''
    AND LEFT(siret, 9) = ANY(sirens)
    AND (
      auth.uid() IS NULL
      OR organisation_id = get_my_organisation_id()
    )
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 4. bulk_update_axonaut_pdf() — validation org_id
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION bulk_update_axonaut_pdf(updates jsonb, org_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND org_id IS DISTINCT FROM get_my_organisation_id() THEN
    RAISE EXCEPTION 'Accès refusé : organisation non autorisée';
  END IF;

  RETURN (
    WITH upd AS (
      UPDATE factures f
      SET axonaut_pdf_url = u->>'pdf_url'
      FROM jsonb_array_elements(updates) AS u
      WHERE f.numero_piece = u->>'numero_piece'
        AND f.organisation_id = org_id
      RETURNING 1
    )
    SELECT count(*)::int FROM upd
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 5. calculer_scores_org() — validation org_id
-- Service role (score-calc Edge Function) : auth.uid() IS NULL → autorisé
-- Utilisateur authentifié : doit appartenir à l'org demandée
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculer_scores_org(p_organisation_id UUID)
RETURNS TABLE(clients_traites INT, alertes_inserees INT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_delai_org INT;
  v_today     DATE := current_date;
  v_nb        INT;
BEGIN
  IF auth.uid() IS NOT NULL AND p_organisation_id IS DISTINCT FROM get_my_organisation_id() THEN
    RAISE EXCEPTION 'Accès refusé : organisation non autorisée';
  END IF;

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
  encours_actifs AS (
    SELECT
      f.code_client,
      SUM(f.reste_du) AS encours_ttc,
      MAX(GREATEST(0, v_today - f.date_echeance))
        FILTER (WHERE f.date_echeance IS NOT NULL)::int   AS retard_max_jours,
      COUNT(*) FILTER (
        WHERE d.delai IS NOT NULL AND f.date_echeance IS NOT NULL
          AND f.date_echeance + d.delai < v_today
      )                                                   AS nb_echu,
      COUNT(*)                                            AS nb_total
    FROM factures f
    LEFT JOIN delais_clients d ON d.code_dso = f.code_client
    WHERE f.organisation_id = p_organisation_id
      AND f.reste_du > 0.005
      AND f.est_avoir = false
    GROUP BY f.code_client
    HAVING SUM(f.reste_du) > 0
  ),
  retard_3m AS (
    SELECT l.code_client,
      AVG(GREATEST(0, l.date_lettrage::date - f.date_echeance))::numeric AS moy
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
          WHEN COALESCE(r3.moy, 0) = 0  THEN 0
          WHEN r3.moy <=  7             THEN (r3.moy / 7.0)   * 10
          WHEN r3.moy <= 15             THEN 10 + ((r3.moy -  7) /  8.0) * 15
          WHEN r3.moy <= 30             THEN 25 + ((r3.moy - 15) / 15.0) * 25
          WHEN r3.moy <= 60             THEN 50 + ((r3.moy - 30) / 30.0) * 25
          ELSE                          75 + LEAST(25, ((r3.moy - 60) / 30.0) * 25)
        END
      )) AS pts_retard,
      CASE
        WHEN COALESCE(r12.moy, 0) < 1                          THEN 0
        WHEN r3.moy / NULLIF(r12.moy,0) >= 2.0                 THEN 20
        WHEN r3.moy / NULLIF(r12.moy,0) >= 1.5                 THEN 14
        WHEN r3.moy / NULLIF(r12.moy,0) >= 1.2                 THEN 8
        ELSE                                                         0
      END AS pts_rupture,
      LEAST(20, GREATEST(0, COALESCE(t.pente, 0) * 2))         AS pts_tendance,
      CASE WHEN e.nb_total > 0
        THEN LEAST(20, (e.nb_echu::float / e.nb_total) * 20)
        ELSE 0
      END                                                        AS pts_echu,
      CASE WHEN b.actif THEN 10 ELSE 0 END                      AS pts_bodacc
    FROM encours_actifs e
    JOIN clients cl ON cl.code_dso = e.code_client
      AND cl.organisation_id = p_organisation_id
      AND (cl.alerte_snooze_jusqu_au IS NULL OR cl.alerte_snooze_jusqu_au < v_today)
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
  ORDER BY (s.pts_retard + s.pts_rupture + s.pts_tendance + s.pts_echu + s.pts_bodacc) DESC
  LIMIT 20;

  GET DIAGNOSTICS v_nb = ROW_COUNT;
  RETURN QUERY SELECT v_nb, v_nb;
END;
$$;
