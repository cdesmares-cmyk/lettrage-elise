-- Migration 182 : table echanges_clients
--
-- POURQUOI. Une equipe appelle un client, ou lui ecrit depuis sa propre boite,
-- et Ockham n'en sait rien. L'ecran affiche « jamais relance » alors que
-- quelqu'un a eu le client au telephone la veille, et un collegue le relance
-- une seconde fois. Cette table recoit les echanges qui ont eu lieu HORS de
-- l'outil, pour qu'ils comptent comme ce qu'ils sont : un contact client.
--
-- POURQUOI PAS DANS relances. Deux raisons.
--   1. PageRelances ne filtre pas sur le type : un appel apparaitrait dans les
--      onglets En cours, Payees et Sans suite, ou il n'a rien a faire.
--   2. relances attend un objet, un tableau de factures, un solde fige. Un
--      appel n'a rien de tout cela — la table serait remplie de vide.
--
-- POURQUOI PAS DANS commentaires_factures. Cette table porte bien contact et
-- date_contact, et le panneau de commentaire par facture s'en sert. Mais elle
-- est indexee PAR FACTURE. « J'ai appele le client » n'a pas de facture
-- naturelle a laquelle s'accrocher : il faudrait en choisir une arbitrairement.
--
-- EFFET SUR LES INDICATEURS, arrete avec Clement le 2026-11-02 :
--   - Le J+ et le bouton « Relance » : OUI. Un appel vaut une relance, c'est un
--     contact client. Le front fusionne les sources et prend la plus recente,
--     donc l'effet est immediat, sans attendre le recalcul de 02:00.
--   - Le NIVEAU de relance : NON. Le niveau mesure l'escalade sur des factures
--     impayees, pas l'activite. Aucun garde-fou a poser : le calcul SQL ne lit
--     que relances et relances_auto_log, cette table en est exclue par
--     construction, c'est l'absence de jointure qui protege.
--   - La deduplication du robot : OUI. Il s'arretera sur un client appele
--     recemment. Cela demande de modifier et deployer l'Edge Function
--     relance-auto — c'est la seule facon, le robot interroge la base lui-meme.

CREATE TABLE IF NOT EXISTS echanges_clients (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code_client     text        NOT NULL,
  canal           text        NOT NULL CHECK (canal IN ('appel', 'mail')),

  -- Le contact : soit une fiche existante, soit une saisie libre.
  -- Les deux peuvent etre vides : on ne bloque pas un geste rapide sur une
  -- donnee complete. Si l'operateur n'a que « la comptable, au standard », il
  -- l'ecrit dans le commentaire et c'est suffisant.
  contact_id      uuid        REFERENCES contacts_client(id) ON DELETE SET NULL,
  contact_libre   text,

  -- Nullable volontairement. Un appel trace sans commentaire deplace quand
  -- meme le J+, qui est l'essentiel. Exiger un texte ferait renoncer a tracer.
  commentaire     text,
  -- Ce que le client a repondu. Rempli plus tard, souvent.
  retour_client   text,

  echange_le      date        NOT NULL DEFAULT current_date,
  cree_par        uuid,
  operateur       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz
);

-- Lecture type : les echanges d'un client, du plus recent au plus ancien.
CREATE INDEX IF NOT EXISTS idx_echanges_clients_org_client
  ON echanges_clients (organisation_id, code_client, echange_le DESC);

-- La deduplication du robot interroge par date sur toute l'organisation.
CREATE INDEX IF NOT EXISTS idx_echanges_clients_org_date
  ON echanges_clients (organisation_id, echange_le DESC);


-- ── Isolation entre organisations ──────────────────────────────────────────
--
-- Motif canonique du CLAUDE.md. Surtout pas USING (auth.uid() IS NOT NULL),
-- qui veut dire « n'importe qui de connecte, toutes organisations confondues »
-- et qui a cause la fuite corrigee par la migration 162.
ALTER TABLE echanges_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "echanges_clients_org_isolation" ON echanges_clients;
CREATE POLICY "echanges_clients_org_isolation" ON echanges_clients
  FOR ALL
  USING      (organisation_id = get_my_organisation_id())
  WITH CHECK (organisation_id = get_my_organisation_id());


-- ── Triggers ───────────────────────────────────────────────────────────────
--
-- inject_organisation_id est INDISPENSABLE. Sans lui, le front doit fournir
-- organisation_id lui-meme, et s'il l'oublie le RLS rejette l'INSERT EN
-- SILENCE : la ligne n'arrive jamais et rien ne le dit. C'est l'oubli que la
-- migration 065 a du rattraper sur ref_valeurs.
DROP TRIGGER IF EXISTS echanges_clients_inject_org_id ON echanges_clients;
CREATE TRIGGER echanges_clients_inject_org_id
  BEFORE INSERT ON echanges_clients
  FOR EACH ROW EXECUTE FUNCTION inject_organisation_id();

DROP TRIGGER IF EXISTS trg_echanges_clients_updated_at ON echanges_clients;
CREATE TRIGGER trg_echanges_clients_updated_at
  BEFORE UPDATE ON echanges_clients
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
--  CONTROLES APRES EXECUTION
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. La table et ses deux triggers existent
--
--    SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'echanges_clients'::regclass AND NOT tgisinternal;
--    -- attendu : echanges_clients_inject_org_id, trg_echanges_clients_updated_at
--
-- 2. La policy est bien la bonne, et pas un acces authentifie large
--
--    SELECT polname, pg_get_expr(polqual, polrelid) AS using_clause
--    FROM   pg_policy WHERE polrelid = 'echanges_clients'::regclass;
--    -- attendu : organisation_id = get_my_organisation_id()
--
-- 3. L'isolation se verifie par le TEST, jamais par lecture du SQL — une
--    analyse statique a deja donne un faux feu vert sur ce projet. A rejouer
--    avec un compte non-superadmin d'une autre organisation, une fois que le
--    front ecrira dedans.
--
-- RETOUR ARRIERE : DROP TABLE echanges_clients CASCADE;
-- Rien d'autre n'en depend tant que le front n'est pas deploye.
