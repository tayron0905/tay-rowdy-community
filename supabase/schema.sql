-- ============================================================
-- Tay Rowdy Community: Schema, Sicherheit (RLS), Realtime
-- ============================================================

-- Admins: nur diese User-IDs gelten als Administrator.
create table public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
-- Absichtlich KEINE Policies: ueber die API ist die Tabelle unsichtbar.

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;

-- Tabellen --------------------------------------------------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  username text not null check (char_length(btrim(username)) between 2 and 24),
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  client_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  username text not null check (char_length(btrim(username)) between 2 and 24),
  content text not null check (char_length(btrim(content)) between 1 and 500),
  client_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  client_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (post_id, client_id)
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  username text check (username is null or char_length(btrim(username)) between 2 and 24),
  question text not null check (char_length(btrim(question)) between 1 and 500),
  answer text check (answer is null or char_length(btrim(answer)) between 1 and 2000),
  answered_at timestamptz,
  client_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index on public.posts (created_at desc);
create index on public.comments (post_id, created_at);
create index on public.questions (created_at desc);

-- Spam-Bremse: max. Eintraege pro Minute (pro Browser und gesamt) --
create function public.rate_limit() returns trigger
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

create trigger posts_rate     before insert on public.posts     for each row execute function public.rate_limit(3, 30);
create trigger comments_rate  before insert on public.comments  for each row execute function public.rate_limit(5, 60);
create trigger likes_rate     before insert on public.likes     for each row execute function public.rate_limit(30, 300);
create trigger questions_rate before insert on public.questions for each row execute function public.rate_limit(2, 20);

-- Rechte: erst alles entziehen, dann gezielt vergeben ---------
revoke all on public.posts, public.comments, public.likes,
              public.questions, public.announcements
  from anon, authenticated;

grant select on public.posts, public.comments, public.likes,
                public.questions, public.announcements
  to anon, authenticated;

grant insert (username, content, client_id)            on public.posts     to anon, authenticated;
grant insert (post_id, username, content, client_id)   on public.comments  to anon, authenticated;
grant insert (post_id, client_id)                      on public.likes     to anon, authenticated;
grant insert (username, question, client_id)           on public.questions to anon, authenticated;

-- nur eingeloggte Admins (zusaetzlich per Policy geprueft)
grant insert (title, body)         on public.announcements to authenticated;
grant update (answer, answered_at) on public.questions     to authenticated;
grant delete on public.posts, public.comments, public.likes,
                public.questions, public.announcements to authenticated;

-- Row Level Security ----------------------------------------
alter table public.posts         enable row level security;
alter table public.comments      enable row level security;
alter table public.likes         enable row level security;
alter table public.questions     enable row level security;
alter table public.announcements enable row level security;

create policy "alle lesen"  on public.posts         for select to anon, authenticated using (true);
create policy "alle lesen"  on public.comments      for select to anon, authenticated using (true);
create policy "alle lesen"  on public.likes         for select to anon, authenticated using (true);
create policy "alle lesen"  on public.questions     for select to anon, authenticated using (true);
create policy "alle lesen"  on public.announcements for select to anon, authenticated using (true);

create policy "alle schreiben" on public.posts     for insert to anon, authenticated with check (true);
create policy "alle schreiben" on public.comments  for insert to anon, authenticated with check (true);
create policy "alle schreiben" on public.likes     for insert to anon, authenticated with check (true);
create policy "frage stellen"  on public.questions for insert to anon, authenticated
  with check (answer is null and answered_at is null);

create policy "admin ankuendigen" on public.announcements for insert to authenticated with check (public.is_admin());
create policy "admin antworten"   on public.questions     for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "admin loescht" on public.posts         for delete to authenticated using (public.is_admin());
create policy "admin loescht" on public.comments      for delete to authenticated using (public.is_admin());
create policy "admin loescht" on public.likes         for delete to authenticated using (public.is_admin());
create policy "admin loescht" on public.questions     for delete to authenticated using (public.is_admin());
create policy "admin loescht" on public.announcements for delete to authenticated using (public.is_admin());

-- Realtime ---------------------------------------------------
alter publication supabase_realtime add table
  public.posts, public.comments, public.likes, public.questions, public.announcements;

-- Minecraft-Serverseite -------------------------------------
create table public.server_ratings (
  id uuid primary key default gen_random_uuid(),
  username text not null check (char_length(btrim(username)) between 2 and 24),
  rating int not null check (rating between 1 and 5),
  client_id uuid not null,
  created_at timestamptz not null default now()
);
create table public.server_comments (
  id uuid primary key default gen_random_uuid(),
  username text not null check (char_length(btrim(username)) between 2 and 24),
  content text not null check (char_length(btrim(content)) between 1 and 500),
  client_id uuid not null,
  created_at timestamptz not null default now()
);
create index on public.server_ratings (created_at desc);
create index on public.server_comments (created_at desc);
alter table public.server_ratings enable row level security;
alter table public.server_comments enable row level security;
grant select on public.server_ratings, public.server_comments to anon, authenticated;
grant insert (username, rating, client_id) on public.server_ratings to anon, authenticated;
grant insert (username, content, client_id) on public.server_comments to anon, authenticated;
create policy "server bewertungen lesen" on public.server_ratings for select to anon, authenticated using (true);
create policy "server bewertungen schreiben" on public.server_ratings for insert to anon, authenticated with check (true);
create policy "server kommentare lesen" on public.server_comments for select to anon, authenticated using (true);
create policy "server kommentare schreiben" on public.server_comments for insert to anon, authenticated with check (true);
create trigger server_ratings_rate before insert on public.server_ratings for each row execute function public.rate_limit(2, 30);
create trigger server_comments_rate before insert on public.server_comments for each row execute function public.rate_limit(5, 60);
alter publication supabase_realtime add table public.server_ratings, public.server_comments;
