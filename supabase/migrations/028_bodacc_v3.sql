-- Migration 028 : Infrastructure BODACC v3
-- 1. notifie_le sur alertes_risque (Phase 4 emails)
-- 2. Index SIREN sur clients (scan inversé scalable)
-- 3. RPC match_clients_par_siren (matching O(1) quel que soit le nb de clients)

-- Colonne pour tracking des notifications email (null = pas encore envoyé)
ALTER TABLE alertes_risque ADD COLUMN IF NOT EXISTS notifie_le TIMESTAMPTZ;

-- Index partiel : seules les alertes non notifiées (Phase 4 : requête WHERE notifie_le IS NULL)
CREATE INDEX IF NOT EXISTS alertes_risque_notifie_idx
  ON alertes_risque (organisation_id, cree_le)
  WHERE notifie_le IS NULL;

-- Index sur les 9 premiers caractères du SIRET = SIREN
-- Utilisé par match_clients_par_siren pour un matching instantané même à 10M de clients
CREATE INDEX IF NOT EXISTS clients_siren_idx
  ON clients (LEFT(siret, 9))
  WHERE siret IS NOT NULL AND siret != '';

-- Fonction RPC : retourne tous les clients (toutes orgs) dont le SIREN matche
-- Appelée avec la liste des SIRENs trouvés dans le batch BODACC du jour
-- Un même SIREN peut matcher plusieurs orgs → tous sont retournés (multi-tenant correct)
CREATE OR REPLACE FUNCTION match_clients_par_siren(sirens text[])
RETURNS TABLE(code_dso text, siret text, organisation_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT code_dso, siret, organisation_id
  FROM clients
  WHERE siret IS NOT NULL
    AND siret != ''
    AND LEFT(siret, 9) = ANY(sirens)
$$;
