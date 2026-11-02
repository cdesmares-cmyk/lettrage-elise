-- Migration 179 : declencher relance-auto depuis l'editeur SQL
--
-- POURQUOI. Verifier la relance automatique obligeait a sortir de Supabase :
-- recuperer CRON_SECRET, construire un curl, le lancer depuis un terminal.
-- Cette fonction fait la meme chose depuis l'editeur SQL, ou l'on travaille
-- deja quand on regarde les donnees.
--
-- LE DEFAUT EST LA SIMULATION. lancer_relance_auto() sans argument appelle la
-- fonction avec ?dry_run=1 : elle fait tout le travail — selection des
-- organisations, eligibilite client par client, choix du scenario, construction
-- des emails — puis s'arrete avant l'envoi. Aucun email, aucune ecriture.
-- Envoyer pour de vrai demande d'ecrire explicitement lancer_relance_auto(false).
-- Ce choix est deliberement asymetrique : le geste anodin doit etre le geste sur.
--
-- A RENSEIGNER AVANT EXECUTION. Remplacer COLLER_ICI_LE_CRON_SECRET par la
-- valeur lisible dans Dashboard > Edge Functions > Secrets > CRON_SECRET.
--
-- LIMITE ASSUMEE. Le secret est ecrit dans le corps de la fonction, donc
-- lisible par qui peut lire sa definition. C'est la convention deja en place
-- dans ce projet (voir migration 073b) : ALTER DATABASE SET n'est pas autorise
-- dans l'editeur SQL de Supabase, donc current_setting() n'est pas une option.
-- Le Vault de Supabase serait plus propre si vous l'activez un jour.
--
-- PREREQUIS : extension pg_net activee (Database > Extensions).

CREATE OR REPLACE FUNCTION lancer_relance_auto(p_dry_run boolean DEFAULT true)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url    text := 'https://aqxsqmgtmenjpfrblqoe.supabase.co/functions/v1/relance-auto';
  v_secret text := 'COLLER_ICI_LE_CRON_SECRET';
  v_req_id bigint;
BEGIN
  IF p_dry_run THEN
    v_url := v_url || '?dry_run=1';
  END IF;

  -- x-cron-secret et non Authorization : la fonction porte son propre controle
  -- d'acces et compare cet en-tete a CRON_SECRET avant toute autre chose. La
  -- verification de jeton de la plateforme est desactivee pour cette fonction
  -- (voir supabase/config.toml), sinon elle rejetterait l'appel avant d'y
  -- arriver — c'est la panne du 24 septembre.
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', v_secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  ) INTO v_req_id;

  RETURN v_req_id;
END;
$$;

-- Cette fonction peut envoyer de vrais emails a de vrais clients.
REVOKE ALL ON FUNCTION lancer_relance_auto(boolean) FROM PUBLIC;


-- ═══════════════════════════════════════════════════════════════════════════
--  MODE D'EMPLOI
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 1. Lancer la simulation. Renvoie un identifiant de requete.
--
--    SELECT lancer_relance_auto();
--
-- 2. Attendre deux ou trois secondes : pg_net est asynchrone, la reponse
--    arrive dans une table a part. Puis lire le resume.
--
--    SELECT status_code,
--           content::jsonb -> 'partiraient' AS partiraient,
--           content::jsonb -> 'ecartes'     AS ecartes
--    FROM   net._http_response
--    ORDER  BY id DESC
--    LIMIT  1;
--
-- 3. Lire le detail, une ligne par client examine. C'est la reponse a la
--    question que le journal ne sait pas traiter : pourquoi ce client a-t-il
--    ete ecarte ?
--
--    SELECT d->>'org'      AS organisation,
--           d->>'client'   AS code_client,
--           d->>'nom'      AS nom,
--           d->>'decision' AS decision,
--           d->>'detail'   AS motif
--    FROM   net._http_response r,
--           LATERAL jsonb_array_elements(r.content::jsonb -> 'detail') d
--    WHERE  r.id = (SELECT MAX(id) FROM net._http_response)
--    ORDER  BY decision, organisation, nom;
--
-- 4. Envoyer pour de vrai, une fois la simulation relue :
--
--    SELECT lancer_relance_auto(false);
--
--
-- LECTURE DES ERREURS. Deux 401 se ressemblent et ne disent pas la meme chose.
--
--   {"code":"UNAUTHORIZED_NO_AUTH_HEADER"}  la plateforme a bloque avant le
--                                           code : la verification de jeton
--                                           s'est rallumee sur la fonction.
--   {"error":"unauthorized"}                la fonction a tourne : c'est
--                                           v_secret qui ne correspond pas.
