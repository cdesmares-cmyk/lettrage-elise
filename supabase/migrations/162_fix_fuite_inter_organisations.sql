-- ═══════════════════════════════════════════════════════════════════════════════
-- 162 — Correctif de fuite inter-organisations
--
-- Constat (test réel du 2026-09-20) : un compte « admin » de l'organisation
-- SAS Odoo, pourtant vide, pouvait lire les données du client Elise Lyon :
--   • lettrages_archive        : 24 lignes visibles
--   • commentaires_factures    : 64 lignes visibles
--
-- Causes :
--   • lettrages_archive     → policy « USING (auth.uid() IS NOT NULL) », créée en
--                             migration 142. Elle n'exige qu'une authentification,
--                             sans aucun filtre d'organisation.
--   • commentaires_factures → table créée à la main hors migrations, avec une
--                             policy permissive du même type. Cette migration
--                             reprend aussi sa définition pour la rendre
--                             reproductible.
--
-- Principe : fermer la fuite sans rien changer d'autre. Aucune restriction de
-- rôle n'est ajoutée — les mêmes personnes gardent exactement les mêmes droits,
-- mais uniquement à l'intérieur de leur propre organisation.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ─── 1. lettrages_archive ────────────────────────────────────────────────────
-- Table non utilisée par le front : la fermer n'a aucun impact fonctionnel.

DROP POLICY IF EXISTS "lecture authentifiee lettrages_archive" ON lettrages_archive;

CREATE POLICY "lettrages_archive_org_isolation" ON lettrages_archive
  FOR SELECT USING (organisation_id = get_my_organisation_id());


-- ─── 2. commentaires_factures ────────────────────────────────────────────────
-- Les policies existantes ont été créées hors migrations : leurs noms sont
-- inconnus du dépôt. On les supprime donc toutes de façon déterministe avant
-- de poser la bonne.

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'commentaires_factures'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.commentaires_factures', p.policyname);
  END LOOP;
END $$;

ALTER TABLE commentaires_factures ENABLE ROW LEVEL SECURITY;

-- Lecture et écriture réservées à l'organisation de l'utilisateur.
-- FOR ALL couvre le upsert du front (INSERT + UPDATE), dont le payload
-- renseigne déjà organisation_id depuis le profil connecté.
CREATE POLICY "commentaires_factures_org_isolation" ON commentaires_factures
  FOR ALL
  USING      (organisation_id = get_my_organisation_id())
  WITH CHECK (organisation_id = get_my_organisation_id());


-- ─── 3. Garde-fou ────────────────────────────────────────────────────────────
-- Empêche toute ligne orpheline : une ligne sans organisation serait invisible
-- pour tout le monde, donc silencieusement perdue.

DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM commentaires_factures WHERE organisation_id IS NULL;
  IF n > 0 THEN
    RAISE WARNING 'commentaires_factures : % ligne(s) sans organisation_id, desormais invisibles', n;
  END IF;

  SELECT count(*) INTO n FROM lettrages_archive WHERE organisation_id IS NULL;
  IF n > 0 THEN
    RAISE WARNING 'lettrages_archive : % ligne(s) sans organisation_id, desormais invisibles', n;
  END IF;
END $$;
