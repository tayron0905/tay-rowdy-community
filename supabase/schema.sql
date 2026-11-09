-- Tay Rowdy Community
-- Erstellt die Tabellen für Feed-Beiträge, Antworten, Likes, Fragen und Updates.
-- Das Skript kann erneut ausgeführt werden; vorhandene Inhalte werden nicht gelöscht.

create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;

do $admin_function$
begin
  if to_regprocedure('public.is_admin()') is null then
    execute $ddl$
      create function public.is_admin() returns boolean
      language sql stable security definer set search_path = '' as $body$
        select exists (
          select 1 from public.admins where user_id = (select auth.uid())
        )
      $body$;
    $ddl$;
  end if;
end
$admin_function$;

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  username text not null check (char_length(btrim(username)) between 2 and 24),
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  client_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  username text not null check (char_length(btrim(username)) between 2 and 24),
  content text not null check (char_length(btrim(content)) between 1 and 500),
  client_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  client_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, client_id)
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  username text check (username is null or char_length(btrim(username)) between 2 and 24),
  question text not null check (char_length(btrim(question)) between 1 and 500),
  answer text check (answer is null or char_length(btrim(answer)) between 1 and 2000),
  answered_at timestamptz,
  client_id uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- Der Inhaber-Status wird ausschließlich serverseitig aus der Admin-Tabelle abgeleitet.
alter table public.posts add column if not exists is_owner boolean not null default false;
alter table public.comments add column if not exists is_owner boolean not null default false;

create or replace function public.mark_community_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.is_owner := public.is_admin();
  return new;
end
$function$;

drop trigger if exists posts_mark_owner on public.posts;
create trigger posts_mark_owner before insert on public.posts
for each row execute function public.mark_community_owner();

drop trigger if exists comments_mark_owner on public.comments;
create trigger comments_mark_owner before insert on public.comments
for each row execute function public.mark_community_owner();

create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists comments_post_created_at_idx on public.comments (post_id, created_at);
create index if not exists questions_created_at_idx on public.questions (created_at desc);

do $rate_function$
begin
  if to_regprocedure('public.community_rate_limit()') is null then
    execute $ddl$
      create function public.community_rate_limit() returns trigger
      language plpgsql security definer set search_path = '' as $body$
      declare
        per_client int;
        total int;
      begin
        execute format(
          'select count(*) from public.%I where created_at > now() - interval ''1 minute''',
          tg_table_name
        ) into total;
        if total >= tg_argv[1]::int then
          raise exception 'Gerade ist viel los, bitte gleich nochmal versuchen.';
        end if;
        execute format(
          'select count(*) from public.%I where client_id = $1 and created_at > now() - interval ''1 minute''',
          tg_table_name
        ) into per_client using new.client_id;
        if per_client >= tg_argv[0]::int then
          raise exception 'Bitte nicht so schnell, warte kurz.';
        end if;
        return new;
      end
      $body$;
    $ddl$;
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'posts_rate' and tgrelid = 'public.posts'::regclass and not tgisinternal) then
    execute 'create trigger posts_rate before insert on public.posts for each row execute function public.community_rate_limit(3, 30)';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'comments_rate' and tgrelid = 'public.comments'::regclass and not tgisinternal) then
    execute 'create trigger comments_rate before insert on public.comments for each row execute function public.community_rate_limit(5, 60)';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'likes_rate' and tgrelid = 'public.likes'::regclass and not tgisinternal) then
    execute 'create trigger likes_rate before insert on public.likes for each row execute function public.community_rate_limit(30, 300)';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'questions_rate' and tgrelid = 'public.questions'::regclass and not tgisinternal) then
    execute 'create trigger questions_rate before insert on public.questions for each row execute function public.community_rate_limit(2, 20)';
  end if;
end
$rate_function$;

grant select on public.posts, public.comments, public.likes, public.questions, public.announcements to anon, authenticated;
grant insert (username, content, client_id) on public.posts to anon, authenticated;
grant insert (post_id, username, content, client_id) on public.comments to anon, authenticated;
grant insert (post_id, client_id) on public.likes to anon, authenticated;
grant insert (username, question, client_id) on public.questions to anon, authenticated;
grant insert (title, body) on public.announcements to authenticated;
grant update (answer, answered_at) on public.questions to authenticated;
grant delete on public.posts, public.comments, public.likes, public.questions, public.announcements to authenticated;

alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.questions enable row level security;
alter table public.announcements enable row level security;

do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'alle lesen') then
    execute $sql$create policy "alle lesen" on public.posts for select to anon, authenticated using (true)$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'alle lesen') then
    execute $sql$create policy "alle lesen" on public.comments for select to anon, authenticated using (true)$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'likes' and policyname = 'alle lesen') then
    execute $sql$create policy "alle lesen" on public.likes for select to anon, authenticated using (true)$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'questions' and policyname = 'alle lesen') then
    execute $sql$create policy "alle lesen" on public.questions for select to anon, authenticated using (true)$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcements' and policyname = 'alle lesen') then
    execute $sql$create policy "alle lesen" on public.announcements for select to anon, authenticated using (true)$sql$;
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'alle schreiben') then
    execute $sql$create policy "alle schreiben" on public.posts for insert to anon, authenticated with check (true)$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'alle schreiben') then
    execute $sql$create policy "alle schreiben" on public.comments for insert to anon, authenticated with check (true)$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'likes' and policyname = 'alle schreiben') then
    execute $sql$create policy "alle schreiben" on public.likes for insert to anon, authenticated with check (true)$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'questions' and policyname = 'frage stellen') then
    execute $sql$create policy "frage stellen" on public.questions for insert to anon, authenticated with check (answer is null and answered_at is null)$sql$;
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcements' and policyname = 'admin ankuendigen') then
    execute $sql$create policy "admin ankuendigen" on public.announcements for insert to authenticated with check (public.is_admin())$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'questions' and policyname = 'admin antworten') then
    execute $sql$create policy "admin antworten" on public.questions for update to authenticated using (public.is_admin()) with check (public.is_admin())$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'posts' and policyname = 'admin loescht') then
    execute $sql$create policy "admin loescht" on public.posts for delete to authenticated using (public.is_admin())$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'comments' and policyname = 'admin loescht') then
    execute $sql$create policy "admin loescht" on public.comments for delete to authenticated using (public.is_admin())$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'likes' and policyname = 'admin loescht') then
    execute $sql$create policy "admin loescht" on public.likes for delete to authenticated using (public.is_admin())$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'questions' and policyname = 'admin loescht') then
    execute $sql$create policy "admin loescht" on public.questions for delete to authenticated using (public.is_admin())$sql$;
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcements' and policyname = 'admin loescht') then
    execute $sql$create policy "admin loescht" on public.announcements for delete to authenticated using (public.is_admin())$sql$;
  end if;
end
$policies$;

-- Unbeantwortete Fragen sind privat und nur für Admins sichtbar.
drop policy if exists "alle lesen" on public.questions;
drop policy if exists "fragen lesen: beantwortet oder admin" on public.questions;
create policy "fragen lesen: beantwortet oder admin" on public.questions
  for select to anon, authenticated
  using (answered_at is not null or public.is_admin());

do $realtime$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts') then
    alter publication supabase_realtime add table public.posts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'likes') then
    alter publication supabase_realtime add table public.likes;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'questions') then
    alter publication supabase_realtime add table public.questions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcements') then
    alter publication supabase_realtime add table public.announcements;
  end if;
end
$realtime$;
