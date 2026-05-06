-- Migration 001 : Schema initial Lettrage Elise (section 4 du CDC)

-- Fonction trigger pour updated_at (syntaxe compatible Supabase)
create or replace function maj_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

-- TABLE clients (section 4.1)
create table if not exists clients (
  code_dso        text primary key,
  ancien_code     text,
  nom             text not null,
  statut          text check (statut in ('actif', 'resilie', 'defaillant', 'redressement', 'liquidation')),
  est_plateforme  boolean not null default false,
  est_groupement  boolean not null default false,
  parent_code_dso text references clients(code_dso),
  mode_paiement   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function maj_updated_at();

alter table clients enable row level security;
create policy "acces authentifie clients" on clients
  for all using (auth.uid() is not null);


-- TABLE factures (section 4.2)
create table if not exists factures (
  numero_piece      text primary key,
  code_client       text not null references clients(code_dso),
  date_emission     date not null,
  date_echeance     date,
  montant_ttc       numeric(12, 2) not null,
  est_provisionnee  boolean not null default false,
  est_avoir         boolean not null default false,
  commentaire       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

create index idx_factures_code_client on factures(code_client);
create index idx_factures_date_emission on factures(date_emission);

create trigger trg_factures_updated_at
  before update on factures
  for each row execute function maj_updated_at();

alter table factures enable row level security;
create policy "acces authentifie factures" on factures
  for all using (auth.uid() is not null);


-- TABLE imports (section 4.6) -- declaree avant lignes_bancaires car elle est referencee
create table if not exists imports (
  id                 uuid primary key default gen_random_uuid(),
  type               text not null check (type in ('csv_bancaire', 'xlsx_factures')),
  nom_fichier        text,
  hash_fichier       text unique,
  nb_lignes_total    int,
  nb_lignes_inserees int,
  nb_lignes_doublons int,
  cree_par           uuid,
  cree_le            timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz
);

create trigger trg_imports_updated_at
  before update on imports
  for each row execute function maj_updated_at();

alter table imports enable row level security;
create policy "acces authentifie imports" on imports
  for all using (auth.uid() is not null);


-- TABLE lignes_bancaires (section 4.3)
create table if not exists lignes_bancaires (
  id_operation        text primary key,
  date_operation      date not null,
  libelle             text not null,
  detail              text,
  debit               numeric(12, 2),
  credit              numeric(12, 2),
  code_client_propose text references clients(code_dso),
  score_suggestion    int check (score_suggestion between 0 and 100),
  import_id           uuid references imports(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz
);

create index idx_lignes_bancaires_date on lignes_bancaires(date_operation);
create index idx_lignes_bancaires_import on lignes_bancaires(import_id);

create trigger trg_lignes_bancaires_updated_at
  before update on lignes_bancaires
  for each row execute function maj_updated_at();

alter table lignes_bancaires enable row level security;
create policy "acces authentifie lignes" on lignes_bancaires
  for all using (auth.uid() is not null);


-- TABLE lettrages (section 4.4)
create table if not exists lettrages (
  id                uuid primary key default gen_random_uuid(),
  id_ligne_bancaire text references lignes_bancaires(id_operation),
  numero_facture    text not null references factures(numero_piece),
  code_client       text not null,
  montant           numeric(12, 2) not null,
  date_lettrage     date not null,
  mode              text not null check (mode in ('auto', 'semi', 'manuel')),
  commentaire       text,
  cree_par          uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

create index idx_lettrages_numero_facture on lettrages(numero_facture);
create index idx_lettrages_ligne_bancaire on lettrages(id_ligne_bancaire);
create index idx_lettrages_code_client on lettrages(code_client);
create index idx_lettrages_date on lettrages(date_lettrage);

create trigger trg_lettrages_updated_at
  before update on lettrages
  for each row execute function maj_updated_at();

alter table lettrages enable row level security;
create policy "acces authentifie lettrages" on lettrages
  for all using (auth.uid() is not null);


-- TABLE libelles_sepa (section 4.5) -- dictionnaire auto-apprenant
create table if not exists libelles_sepa (
  libelle         text primary key,
  code_client     text references clients(code_dso),
  nb_utilisations int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz
);

create index idx_libelles_sepa_code_client on libelles_sepa(code_client);
create index idx_libelles_sepa_utilisations on libelles_sepa(nb_utilisations desc);

create trigger trg_libelles_sepa_updated_at
  before update on libelles_sepa
  for each row execute function maj_updated_at();

alter table libelles_sepa enable row level security;
create policy "acces authentifie sepa" on libelles_sepa
  for all using (auth.uid() is not null);


-- TABLE audit_log (section 4.7)
create table if not exists audit_log (
  id              uuid primary key default gen_random_uuid(),
  table_concernee text not null,
  action          text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  payload_json    jsonb,
  user_id         uuid,
  timestamp       timestamptz not null default now()
);

create index idx_audit_log_table on audit_log(table_concernee);
create index idx_audit_log_timestamp on audit_log(timestamp desc);

alter table audit_log enable row level security;
create policy "lecture audit" on audit_log
  for select using (auth.uid() is not null);
create policy "insertion audit" on audit_log
  for insert with check (auth.uid() is not null);
