-- Sprint : annulation de lettrage (soft delete) + structure export comptable
-- 1. Colonne annule sur lettrages (masquage sans suppression physique)
-- 2. Colonne export_id sur lettrages (rattachement à un batch d'export)
-- 3. Table exports_comptables
-- 4. Vue v_lignes_bancaires_avec_statut : exclure les lettrages annulés
-- 5. RPC dispatch_411 : exclure les lettrages annulés

-- ─── 1. Colonne annule ───────────────────────────────────────────────────────
ALTER TABLE lettrages ADD COLUMN IF NOT EXISTS annule boolean NOT NULL DEFAULT false;

-- ─── 2. Colonne export_id ────────────────────────────────────────────────────
-- Table créée d'abord pour que la FK soit valide
CREATE TABLE IF NOT EXISTS exports_comptables (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  date_debut     date NOT NULL,
  date_fin       date NOT NULL,
  nb_lettrages   integer NOT NULL DEFAULT 0,
  montant_total  numeric(12,2) NOT NULL DEFAULT 0,
  exporte_par    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE exports_comptables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exports_comptables_org" ON exports_comptables
  USING (organisation_id = get_my_organisation_id());

ALTER TABLE lettrages ADD COLUMN IF NOT EXISTS export_id uuid REFERENCES exports_comptables(id) ON DELETE SET NULL;

-- ─── 4. Vue v_lignes_bancaires_avec_statut : filtre annule = false ────────────
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
  lb.en_attente_471,
  COALESCE(SUM(l.montant), 0)::numeric(12,2)                                AS montant_lettre,
  (COALESCE(lb.credit, 0) - COALESCE(SUM(l.montant), 0))::numeric(12,2)   AS restant,
  CASE
    WHEN lb.credit IS NULL OR lb.credit = 0                                 THEN 'debit'
    WHEN lb.en_attente_471 = true                                           THEN 'en_attente_471'
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
  lb.en_attente_471, lb.organisation_id;

-- ─── 5. RPC dispatch_411 : exclure les lettrages annulés ─────────────────────
CREATE OR REPLACE FUNCTION dispatch_411(
  p_numero_411   text,
  p_operateur    text,
  p_lettrages    jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id      uuid := get_my_organisation_id();
  v_total       numeric;
  v_temp        record;
  v_commentaire text;
BEGIN
  v_commentaire := 'Dispatché depuis ' || p_numero_411
                 || ' le ' || CURRENT_DATE
                 || ' — opérateur ' || p_operateur;

  SELECT COALESCE(SUM((l->>'montant')::numeric), 0)
  INTO   v_total
  FROM   jsonb_array_elements(p_lettrages) AS l;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Montant dispatch invalide';
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
    INSERT INTO lettrages (
      id_ligne_bancaire, numero_facture, code_client, montant,
      date_lettrage, mode, commentaire, operateur, organisation_id
    ) VALUES (
      v_temp.id_ligne_bancaire,
      p_numero_411,
      v_temp.code_client,
      -v_temp.montant,
      CURRENT_DATE,
      'correction',
      v_commentaire,
      p_operateur,
      v_org_id
    );

    INSERT INTO lettrages (
      id_ligne_bancaire, numero_facture, code_client, montant,
      date_lettrage, mode, commentaire, operateur, organisation_id
    )
    SELECT
      v_temp.id_ligne_bancaire,
      NULLIF(TRIM(l->>'numero_facture'), ''),
      TRIM(l->>'code_client'),
      ROUND((l->>'montant')::numeric * v_temp.montant / v_total, 2),
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
