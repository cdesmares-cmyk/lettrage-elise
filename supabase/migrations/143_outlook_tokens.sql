-- Table stockage tokens OAuth Outlook (même structure que gmail_tokens)
create table if not exists outlook_tokens (
  user_id       uuid primary key references utilisateurs(id) on delete cascade,
  access_token  text not null,
  refresh_token text,
  token_expiry  timestamptz not null,
  outlook_email text,
  mis_a_jour_le timestamptz default now()
);

alter table outlook_tokens enable row level security;

create policy "utilisateur voit son propre token outlook"
  on outlook_tokens for select
  using (user_id = auth.uid());

create policy "utilisateur modifie son propre token outlook"
  on outlook_tokens for all
  using (user_id = auth.uid());
