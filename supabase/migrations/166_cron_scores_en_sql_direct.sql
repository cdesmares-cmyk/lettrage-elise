-- Migration 166 : le calcul des scores passe en SQL direct, la nuit
--
-- POURQUOI. Le cron appelait la fonction Edge score-calc par HTTP. Ce detour
--   ramasse trois contraintes de delai en chemin, dont la pire : toute requete
--   passant par l'API PostgREST est coupee a 8 SECONDES (statement_timeout du
--   role authenticator). Le 2026-09-23 au soir, deux organisations sur quatre
--   ont echoue sur "canceling statement due to statement timeout" — les deux
--   plus grosses. Le lendemain matin les quatre sont passees : la marge depend
--   de la charge de la machine, donc l'echec est intermittent et silencieux.
--
--   Le calcul se fait entierement dans la base. En sortir pour y revenir
--   aussitot n'apporte rien et ajoute trois facons de casser.
--
-- CE QUI CHANGE.
--   1. Une procedure calculer_scores_toutes_orgs() qui parcourt les
--      organisations UNE PAR UNE et valide apres chacune.
--      - sequentiel : chaque organisation a la machine pour elle, au lieu des
--        six appels simultanes de la fonction Edge qui se genaient entre eux ;
--      - validation par organisation : a 100 organisations, une transaction
--        unique de plusieurs minutes empecherait le nettoyage de la base ;
--      - une organisation en echec n'interrompt pas les suivantes ;
--      - garde-fou de 10 minutes par organisation, pour qu'un calcul parti en
--        vrille n'immobilise pas la tache jusqu'au lendemain.
--   2. Chaque passage est ecrit dans cron_runs — une ligne par organisation,
--      plus une ligne de synthese. La panne du 20 au 23 septembre n'a laisse
--      AUCUNE trace : cron.job_run_details affichait "succeeded" parce que
--      pg_cron ne juge que l'envoi de la requete, jamais la reponse.
--      cron_runs existait deja (migration 050), alimentee par sept fonctions.
--      score-calc n'y ecrivait pas. C'est corrige ici.
--   3. La tache passe de 06:00 a 02:00 UTC, soit 03:00 ou 04:00 a Paris selon
--      la saison. Six heures de marge avant la journee de travail, meme si le
--      traitement s'allonge avec le nombre de clients.
--
-- CE QUI DISPARAIT. Le passage par HTTP, la fonction Edge, et l'en-tete
--   x-cron-secret — donc le 401 qui a tue le calcul pendant quatre jours, et
--   le piege du modele 037. La commande planifiee ne contient plus aucun
--   secret : cette migration est rejouable telle quelle.
--
-- CE QUI NE CHANGE PAS. Le calcul lui-meme : memes scores, memes niveaux.
--   La fonction Edge score-calc reste en place, inutilisee par le cron, comme
--   declenchement manuel possible. Le bouton "Calculer maintenant" appelle
--   deja le SQL directement, il n'est pas concerne. score-digest non plus.
--
-- SECURITE. La procedure ecrit pour TOUTES les organisations : elle ne doit
--   etre appelable que par le planificateur. D'ou le REVOKE sur PUBLIC, sans
--   lequel n'importe quel compte authentifie pourrait declencher un recalcul
--   global — une ecriture inter-organisations.
--
-- RETOUR ARRIERE : voir le bloc commente en fin de fichier.

-- ── 1. La procedure ───────────────────────────────────────────────────────────
CREATE OR REPLACE PROCEDURE calculer_scores_toutes_orgs()
LANGUAGE plpgsql AS $$
DECLARE
  o        RECORD;
  v_nb     INT;
  v_erreur TEXT;
  v_debut  timestamptz;
  v_duree  INT;
  v_total  INT := 0;
  v_ok     INT := 0;
  v_echecs INT := 0;
BEGIN
  FOR o IN SELECT id, nom FROM organisations ORDER BY id LOOP

    -- Garde-fou, valable pour la transaction en cours donc pour cette seule
    -- organisation : le COMMIT de fin de boucle le remet a zero.
    PERFORM set_config('statement_timeout', '600000', true);
    v_debut := clock_timestamp();

    -- Le bloc EXCEPTION isole l'organisation : si son calcul echoue, lui seul
    -- est annule. Aucune ecriture ne peut avoir lieu ici, sinon le COMMIT plus
    -- bas serait refuse (on ne valide pas depuis une sous-transaction).
    BEGIN
      SELECT alertes_inserees INTO v_nb FROM calculer_scores_org(o.id);
      v_erreur := NULL;
    EXCEPTION WHEN OTHERS THEN
      v_nb     := 0;
      v_erreur := SQLERRM;
    END;

    v_duree := (EXTRACT(EPOCH FROM (clock_timestamp() - v_debut)) * 1000)::int;

    INSERT INTO cron_runs (fonction, organisation_id, statut, nb_traite, message, duree_ms)
    VALUES (
      'score-calc',
      o.id,
      CASE WHEN v_erreur IS NULL THEN 'ok' ELSE 'erreur' END,
      COALESCE(v_nb, 0),
      COALESCE(v_erreur, COALESCE(v_nb, 0) || ' ligne(s) ecrite(s)'),
      v_duree
    );

    IF v_erreur IS NULL THEN
      v_total  := v_total + COALESCE(v_nb, 0);
      v_ok     := v_ok + 1;
    ELSE
      v_echecs := v_echecs + 1;
    END IF;

    COMMIT;
  END LOOP;

  -- Ligne de synthese, organisation_id NULL : c'est la convention de la
  -- migration 050 pour un passage global.
  INSERT INTO cron_runs (fonction, statut, nb_traite, message)
  VALUES (
    'score-calc',
    CASE WHEN v_echecs = 0 THEN 'ok' ELSE 'partiel' END,
    v_total,
    v_ok || ' organisation(s) calculee(s), ' || v_echecs || ' en echec'
  );
  COMMIT;
END;
$$;

-- ── 2. Verrou d'acces ─────────────────────────────────────────────────────────
-- Par defaut PostgreSQL autorise PUBLIC a executer une procedure nouvellement
-- creee. Ici cela laisserait n'importe quel compte authentifie declencher un
-- recalcul de toutes les organisations.
REVOKE ALL ON PROCEDURE calculer_scores_toutes_orgs() FROM PUBLIC;

-- ── 3. La tache planifiee ─────────────────────────────────────────────────────
-- Relancer cron.schedule sous un nom existant ECRASE la tache en gardant son
-- identifiant. C'est voulu : on remplace l'appel HTTP par l'appel SQL.
-- Doit renvoyer 21, l'identifiant actuel de score-calc-daily.
SELECT cron.schedule(
  'score-calc-daily',
  '0 2 * * *',
  $cmd$ CALL calculer_scores_toutes_orgs(); $cmd$
);

-- ── 4. Verification, sans afficher de secret ──────────────────────────────────
-- Attendu : jobid 21, schedule '0 2 * * *', active true, envoie_le_secret false
-- (il n'y a plus de secret a envoyer, l'appel ne sort plus de la base).
SELECT jobid, jobname, schedule, active,
       command ILIKE '%x-cron-secret%' AS envoie_le_secret,
       left(command, 60) AS commande
FROM cron.job
WHERE jobname = 'score-calc-daily';


-- ═══════════════════════════════════════════════════════════════════════════
--  RETOUR ARRIERE — ne pas executer maintenant
-- ═══════════════════════════════════════════════════════════════════════════
-- Remet l'appel HTTP d'avant. La valeur du secret se trouve dans
-- Dashboard > Edge Functions > Secrets > CRON_SECRET.
--
-- SELECT cron.schedule(
--   'score-calc-daily',
--   '0 6 * * *',
--   $$
--   SELECT net.http_post(
--     url     := 'https://PROJECT_REF.supabase.co/functions/v1/score-calc',
--     headers := '{"x-cron-secret": "CRON_SECRET_VALUE", "Content-Type": "application/json"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $$
-- );
--
-- DROP PROCEDURE IF EXISTS calculer_scores_toutes_orgs();


-- ═══════════════════════════════════════════════════════════════════════════
--  LIRE LES PASSAGES
-- ═══════════════════════════════════════════════════════════════════════════
-- SELECT to_char(cree_le AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI') AS quand,
--        statut, nb_traite, duree_ms, message
-- FROM cron_runs
-- WHERE fonction = 'score-calc'
-- ORDER BY cree_le DESC
-- LIMIT 20;
