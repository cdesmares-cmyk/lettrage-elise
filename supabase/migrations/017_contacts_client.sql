-- 017 : table contacts_client
-- Un client peut avoir plusieurs contacts avec des rôles différents

create table if not exists contacts_client (
  id            uuid primary key default gen_random_uuid(),
  code_client   text not null,
  prenom        text,
  nom           text not null,
  email         text not null,
  telephone     text,
  role_contact  text not null default 'comptabilite'
                  check (role_contact in ('comptabilite', 'relance', 'direction', 'terrain', 'autre')),
  actif         boolean not null default true,
  cree_le       timestamptz default now(),
  mis_a_jour_le timestamptz default now()
);

create index if not exists contacts_client_code_idx on contacts_client(code_client);
create index if not exists contacts_client_email_idx on contacts_client(email);

create trigger contacts_client_maj_ts
  before update on contacts_client
  for each row execute function maj_timestamp();

-- RLS
alter table contacts_client enable row level security;

-- Lecture : tous les utilisateurs authentifiés (commercial inclus)
create policy "contacts_select_authenticated" on contacts_client
  for select using (auth.role() = 'authenticated');

-- Écriture : admin + responsable_poste_client uniquement
create policy "contacts_insert_operateurs" on contacts_client
  for insert with check (get_my_role() in ('admin', 'responsable_poste_client'));

create policy "contacts_update_operateurs" on contacts_client
  for update using (get_my_role() in ('admin', 'responsable_poste_client'));

create policy "contacts_delete_admin" on contacts_client
  for delete using (get_my_role() = 'admin');
