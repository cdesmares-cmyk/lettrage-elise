-- Migration 003 : Ajout de champs metier (corrections Sprint 1)
-- A executer APRES la migration 002

-- factures : nom du client (denormalise pour audit), montant HT
alter table factures
  add column if not exists nom_client text,
  add column if not exists montant_ht numeric(12, 2);

-- lignes_bancaires : informations complementaires visibles par l'operateur
alter table lignes_bancaires
  add column if not exists infos_complementaires text;
