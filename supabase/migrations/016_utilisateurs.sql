-- 016 : table utilisateurs + rôles
-- Rôles : admin | responsable_poste_client | commercial
-- À exécuter dans Supabase Studio > SQL Editor

-- Fonction utilitaire anti-récursion pour les policies RLS
create or replace function get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from utilisateurs where id = auth.uid();
$$;

create table if not exists utilisateurs (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text not null,
  nom_affiche           text not null,
  role                  text not null default 'responsable_poste_client'
                          check (role in ('admin', 'responsable_poste_client', 'commercial')),
  gmail_refresh_token   text,
  cree_le               timestamptz default now(),
  mis_a_jour_le         timestamptz default now()
);

-- Trigger : mise à jour automatique de mis_a_jour_le
create or replace function maj_timestamp()
returns trigger language plpgsql as $$
begin new.mis_a_jour_le = now(); return new; end;
$$;

create trigger utilisateurs_maj_ts
  before update on utilisateurs
  for each row execute function maj_timestamp();

-- Trigger : création automatique d'une ligne utilisateurs à l'inscription
create or replace function on_auth_user_created()
returns trigger language plpgsql security definer as $$
begin
  insert into utilisateurs (id, email, nom_affiche)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function on_auth_user_created();

-- RLS
alter table utilisateurs enable row level security;

-- Chaque utilisateur voit sa propre ligne
create policy "utilisateurs_select_own" on utilisateurs
  for select using (auth.uid() = id);

-- Admin voit toutes les lignes (via fonction security definer pour éviter la récursion)
create policy "utilisateurs_select_admin" on utilisateurs
  for select using (get_my_role() = 'admin');

-- Seul l'admin peut modifier les rôles
create policy "utilisateurs_update_admin" on utilisateurs
  for update using (get_my_role() = 'admin');

-- ── Seed : insère l'admin existant si absent ──────────────────────────────
-- Remplacer l'uuid par celui visible dans Supabase > Authentication > Users
-- insert into utilisateurs (id, email, nom_affiche, role)
-- values ('<uuid-admin>', 'cdesmares@elise.com.fr', 'C. Desmares', 'admin')
-- on conflict (id) do update set role = 'admin';
