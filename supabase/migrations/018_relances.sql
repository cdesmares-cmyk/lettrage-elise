-- 018 : table relances
-- Une relance = un email de recouvrement envoyé à un ou plusieurs contacts d'un client

create table if not exists relances (
  id               uuid primary key default gen_random_uuid(),
  code_client      text not null,
  operateur_id     uuid not null references utilisateurs(id) on delete restrict,
  contacts_ids     uuid[] not null default '{}',
  factures_ids     text[] not null default '{}',   -- numéros_piece
  objet            text not null,
  corps_html       text not null,
  statut           text not null default 'brouillon'
                     check (statut in ('brouillon', 'envoyee', 'repondue', 'sans_reponse', 'payee')),
  gmail_thread_id  text,
  points_attribues int not null default 0,
  cree_le          timestamptz default now(),
  envoyee_le       timestamptz,
  mis_a_jour_le    timestamptz default now()
);

create index if not exists relances_code_client_idx  on relances(code_client);
create index if not exists relances_operateur_idx    on relances(operateur_id);
create index if not exists relances_statut_idx       on relances(statut);
create index if not exists relances_envoyee_le_idx   on relances(envoyee_le);

create trigger relances_maj_ts
  before update on relances
  for each row execute function maj_timestamp();

-- RLS
alter table relances enable row level security;

-- Lecture : chaque opérateur voit ses propres relances, l'admin voit tout
create policy "relances_select_own" on relances
  for select using (operateur_id = auth.uid());

create policy "relances_select_admin" on relances
  for select using (get_my_role() = 'admin');

-- Écriture : admin + responsable_poste_client uniquement
create policy "relances_insert" on relances
  for insert with check (
    get_my_role() in ('admin', 'responsable_poste_client')
    and operateur_id = auth.uid()
  );

create policy "relances_update_own" on relances
  for update using (
    operateur_id = auth.uid()
    and get_my_role() in ('admin', 'responsable_poste_client')
  );

create policy "relances_delete_own" on relances
  for delete using (
    operateur_id = auth.uid()
    and statut = 'brouillon'
  );

-- Vue agrégée des scores par opérateur (utilisée par le dashboard)
create or replace view scores_relance as
select
  u.id                                                          as operateur_id,
  u.nom_affiche,
  u.role,
  coalesce(sum(r.points_attribues) filter (
    where r.envoyee_le >= date_trunc('month', now())
  ), 0)                                                         as score_mois,
  count(*) filter (
    where r.envoyee_le >= date_trunc('month', now())
      and r.statut != 'brouillon'
  )                                                             as nb_relances_mois,
  round(
    count(*) filter (
      where r.statut in ('repondue', 'payee')
        and r.envoyee_le >= date_trunc('month', now())
    )::numeric
    / nullif(count(*) filter (
      where r.statut != 'brouillon'
        and r.envoyee_le >= date_trunc('month', now())
    ), 0) * 100
  , 1)                                                          as taux_reponse_pct
from utilisateurs u
left join relances r on r.operateur_id = u.id
where u.role in ('admin', 'responsable_poste_client')
group by u.id, u.nom_affiche, u.role;
