-- Migration 011 : Table remises (pré-lettrage Chèque / LCR)
-- Une remise = groupe de factures pré-lettrées avant encaissement physique.
-- statut 'en_attente' → modifiable. 'encaisse' → lecture seule.

create table if not exists remises (
  id                uuid        primary key default gen_random_uuid(),
  type              text        not null check (type in ('cheque', 'lcr')),
  numero            text        not null,
  -- CHQ : montant_total est NULL (calculé depuis les lettrages liés)
  -- LCR : montant_total est saisi par l'opérateur et contrôlé
  montant_total     numeric(12,2),
  statut            text        not null default 'en_attente'
                                check (statut in ('en_attente', 'encaisse')),
  id_ligne_bancaire text        references lignes_bancaires(id_operation),
  date_encaissement date,
  cree_par          uuid,
  nom_operateur     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);

create index idx_remises_statut      on remises(statut);
create index idx_remises_created_at  on remises(created_at desc);

create trigger trg_remises_updated_at
  before update on remises
  for each row execute function maj_updated_at();

alter table remises enable row level security;
create policy "acces authentifie remises" on remises
  for all using (auth.uid() is not null);


-- Ajout de remise_id dans lettrages (nullable — seuls les lettrages CHQ/LCR sont liés)
alter table lettrages
  add column if not exists remise_id uuid references remises(id);

create index if not exists idx_lettrages_remise_id on lettrages(remise_id);


-- Extension du check mode pour couvrir cheque et lcr
alter table lettrages drop constraint if exists lettrages_mode_check;
alter table lettrages
  add constraint lettrages_mode_check
  check (mode in ('auto', 'semi', 'manuel', 'cheque', 'lcr'));
