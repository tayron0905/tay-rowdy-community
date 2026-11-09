-- Einmal im Supabase SQL Editor ausführen, um Serverbewertungen und
-- Serverkommentare für die öffentliche Website einzurichten.

create table if not exists public.server_ratings (
  id uuid primary key default gen_random_uuid(),
  username text not null check (char_length(btrim(username)) between 2 and 24),
  rating int not null check (rating between 1 and 5),
  client_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.server_comments (
  id uuid primary key default gen_random_uuid(),
  username text not null check (char_length(btrim(username)) between 2 and 24),
  content text not null check (char_length(btrim(content)) between 1 and 500),
  client_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists server_ratings_created_at_idx on public.server_ratings (created_at desc);
create index if not exists server_comments_created_at_idx on public.server_comments (created_at desc);

alter table public.server_ratings enable row level security;
alter table public.server_comments enable row level security;

grant select on public.server_ratings, public.server_comments to anon, authenticated;
grant insert (username, rating, client_id) on public.server_ratings to anon, authenticated;
grant insert (username, content, client_id) on public.server_comments to anon, authenticated;

drop policy if exists "server bewertungen lesen" on public.server_ratings;
create policy "server bewertungen lesen" on public.server_ratings
  for select to anon, authenticated using (true);
drop policy if exists "server bewertungen schreiben" on public.server_ratings;
create policy "server bewertungen schreiben" on public.server_ratings
  for insert to anon, authenticated with check (true);
drop policy if exists "server kommentare lesen" on public.server_comments;
create policy "server kommentare lesen" on public.server_comments
  for select to anon, authenticated using (true);
drop policy if exists "server kommentare schreiben" on public.server_comments;
create policy "server kommentare schreiben" on public.server_comments
  for insert to anon, authenticated with check (true);

-- Gemeinsame Spam-Bremse für anonyme Einträge.
create or replace function public.rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  per_client int;
  total int;
begin
  execute format('select count(*) from public.%I where created_at > now() - interval ''1 minute''', tg_table_name)
    into total;
  if total >= tg_argv[1]::int then
    raise exception 'Gerade ist viel los, bitte gleich nochmal versuchen.';
  end if;
  execute format('select count(*) from public.%I where client_id = $1 and created_at > now() - interval ''1 minute''', tg_table_name)
    using new.client_id into per_client;
  if per_client >= tg_argv[0]::int then
    raise exception 'Bitte nicht so schnell, warte kurz.';
  end if;
  return new;
end $$;

drop trigger if exists server_ratings_rate on public.server_ratings;
create trigger server_ratings_rate before insert on public.server_ratings
  for each row execute function public.rate_limit(2, 30);
drop trigger if exists server_comments_rate on public.server_comments;
create trigger server_comments_rate before insert on public.server_comments
  for each row execute function public.rate_limit(5, 60);

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'server_ratings') then
    alter publication supabase_realtime add table public.server_ratings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'server_comments') then
    alter publication supabase_realtime add table public.server_comments;
  end if;
end $$;
