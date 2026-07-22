-- Migration 106 : suppression de la contrainte factures_client_fk
-- Les pseudo-factures (411_ATTENTE, 411_CLIENT...) utilisent des code_client techniques
-- (ATTENTE, codes DSO) qui n'ont pas forcément de ligne dans la table clients.
-- La contrainte bloquait l'upsert de la facture 411_ATTENTE → FK violation en cascade sur lettrages.
-- Les vraies factures sont importées par des flux contrôlés qui garantissent un code_client valide.
ALTER TABLE factures DROP CONSTRAINT IF EXISTS factures_client_fk;
