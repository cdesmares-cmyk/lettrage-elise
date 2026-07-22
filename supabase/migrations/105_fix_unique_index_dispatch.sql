-- Migration 105 : fix unique index — exclure aussi mode='dispatch'
--
-- Problème : la migration 103 exclut mode='correction' de l'index unique
-- (idx_lettrages_no_doublon) mais pas mode='dispatch'. Or le dispatch_411
-- peut légitimement créer un lettrage (id_ligne_bancaire, numero_facture)
-- sur une paire déjà couverte par un lettrage manuel ou auto existant.
--
-- Exemple : ligne bancaire LB1 est lettrée manuellement sur FACT001 (mode='manuel').
-- La même ligne LB1 est aussi affectée à un compte 411_CLIENT.
-- Lors du dispatch, on crée un lettrage (LB1, FACT001, mode='dispatch'),
-- ce qui viole l'index unique car (LB1, FACT001, annule=false) existe déjà.
--
-- Fix : exclure aussi mode='dispatch' de l'index unique.
-- La protection contre les sur-dispatches est assurée dans dispatch_411
-- par le contrôle v_credit_net (crédit net disponible).

DROP INDEX IF EXISTS idx_lettrages_no_doublon;

CREATE UNIQUE INDEX idx_lettrages_no_doublon
  ON lettrages (id_ligne_bancaire, numero_facture)
  WHERE id_ligne_bancaire IS NOT NULL
    AND numero_facture    IS NOT NULL
    AND annule            = false
    AND mode              NOT IN ('correction', 'dispatch');
