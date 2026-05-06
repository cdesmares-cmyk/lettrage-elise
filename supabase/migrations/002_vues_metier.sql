-- Migration 002 : Vues metier (sections 4.2, 4.4, 5.3 du CDC)
-- A executer APRES la migration 001

-- Vue : factures avec reste du et statut de paiement
-- Le reste du n'est jamais stocke, toujours recalcule (section 6 du CDC)
create or replace view v_factures_avec_reste_du as
select
  f.numero_piece,
  f.code_client,
  f.date_emission,
  f.date_echeance,
  f.montant_ttc,
  f.est_avoir,
  f.est_provisionnee,
  f.commentaire,
  coalesce(sum(l.montant), 0) as montant_lettre,
  f.montant_ttc - coalesce(sum(l.montant), 0) as reste_du,
  case
    when f.est_avoir then 'avoir'
    when coalesce(sum(l.montant), 0) = 0 then 'impaye'
    when coalesce(sum(l.montant), 0) > f.montant_ttc and f.montant_ttc > 0 then 'sur-lettre'
    when coalesce(sum(l.montant), 0) >= f.montant_ttc and f.montant_ttc > 0 then 'paye'
    else 'partiel'
  end as statut_paiement
from factures f
left join lettrages l on l.numero_facture = f.numero_piece
group by
  f.numero_piece, f.code_client, f.date_emission, f.date_echeance,
  f.montant_ttc, f.est_avoir, f.est_provisionnee, f.commentaire;


-- Vue : lignes bancaires avec statut de lettrage
-- Entierement lettree si SUM(lettrages) = credit - debit (section 4.4 du CDC)
create or replace view v_lignes_bancaires_avec_statut as
select
  lb.id_operation,
  lb.date_operation,
  lb.libelle,
  lb.detail,
  lb.debit,
  lb.credit,
  lb.code_client_propose,
  lb.score_suggestion,
  lb.import_id,
  lb.created_at,
  coalesce(sum(l.montant), 0) as montant_lettre,
  coalesce(lb.credit, 0) - coalesce(lb.debit, 0) - coalesce(sum(l.montant), 0) as reste_a_lettrer,
  case
    when coalesce(sum(l.montant), 0) = 0 then 'non_lettree'
    when abs(coalesce(sum(l.montant), 0) - (coalesce(lb.credit, 0) - coalesce(lb.debit, 0))) < 0.01 then 'lettree'
    else 'partielle'
  end as statut_lettrage
from lignes_bancaires lb
left join lettrages l on l.id_ligne_bancaire = lb.id_operation
group by
  lb.id_operation, lb.date_operation, lb.libelle, lb.detail,
  lb.debit, lb.credit, lb.code_client_propose, lb.score_suggestion,
  lb.import_id, lb.created_at;


-- Vue : statistiques par client (onglet Compte Client et Tableau de bord)
create or replace view v_stats_clients as
select
  c.code_dso,
  c.nom,
  c.statut,
  c.mode_paiement,
  c.est_plateforme,
  c.est_groupement,
  c.parent_code_dso,
  coalesce(sum(case when v.statut_paiement in ('impaye', 'partiel') then v.reste_du else 0 end), 0) as encours_total,
  count(case when v.statut_paiement in ('impaye', 'partiel') then 1 end) as nb_factures_impayees
from clients c
left join v_factures_avec_reste_du v on v.code_client = c.code_dso
group by
  c.code_dso, c.nom, c.statut, c.mode_paiement,
  c.est_plateforme, c.est_groupement, c.parent_code_dso;
