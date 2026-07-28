-- =============================================================================
-- PushupArena · 0001 · Schema
-- -----------------------------------------------------------------------------
-- Generisches Übungs-Modell (nicht auf Pushups hart verdrahtet), Profile, Ziele,
-- Freundschaften und Achievements. RLS wird hier aktiviert; Policies folgen in 0002.
-- =============================================================================

-- Erweiterungen ---------------------------------------------------------------
create extension if not exists "citext";      -- case-insensitive usernames
create extension if not exists "pgcrypto";     -- gen_random_uuid()

-- Enum für Freundschaftsanfragen ----------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'friend_request_status') then
    create type public.friend_request_status as enum ('pending', 'accepted', 'declined');
  end if;
end$$;

-- profiles --------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      citext unique not null
                  check (username ~* '^[a-z0-9_]{3,20}$'),
  display_name  text check (char_length(display_name) <= 50),
  avatar_url    text check (char_length(avatar_url) <= 500),
  bio           text check (char_length(bio) <= 280),
  is_searchable boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'Öffentliches Profil je Nutzer. Enthält bewusst KEINE E-Mail (Datenminimierung).';

-- exercises (Katalog) ---------------------------------------------------------
create table if not exists public.exercises (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null check (slug ~* '^[a-z0-9-]+$'),
  unit        text not null default 'reps',
  created_at  timestamptz not null default now()
);

comment on table public.exercises is 'Generischer Übungs-Katalog. Pushups ist nur der erste Seed-Eintrag.';

-- workout_entries -------------------------------------------------------------
create table if not exists public.workout_entries (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  exercise_id  uuid not null references public.exercises (id) on delete restrict,
  amount       integer not null check (amount > 0 and amount <= 100000),
  note         text check (char_length(note) <= 500),
  performed_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists workout_entries_user_exercise_time_idx
  on public.workout_entries (user_id, exercise_id, performed_at desc);

-- user_goals ------------------------------------------------------------------
create table if not exists public.user_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  daily_goal  integer not null default 0 check (daily_goal  >= 0 and daily_goal  <= 100000),
  weekly_goal integer not null default 0 check (weekly_goal >= 0 and weekly_goal <= 700000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, exercise_id)
);

-- friend_requests -------------------------------------------------------------
-- FKs zeigen bewusst auf profiles(id) (= auth.users.id), damit PostgREST die
-- Profildaten direkt mitladen kann. Lösch-Kaskade läuft über profiles -> auth.users.
create table if not exists public.friend_requests (
  id          uuid primary key default gen_random_uuid(),
  sender_id   uuid not null,
  receiver_id uuid not null,
  status      public.friend_request_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint friend_requests_sender_fkey
    foreign key (sender_id) references public.profiles (id) on delete cascade,
  constraint friend_requests_receiver_fkey
    foreign key (receiver_id) references public.profiles (id) on delete cascade,
  check (sender_id <> receiver_id),
  unique (sender_id, receiver_id)
);

create index if not exists friend_requests_receiver_idx
  on public.friend_requests (receiver_id, status);
create index if not exists friend_requests_sender_idx
  on public.friend_requests (sender_id, status);

-- friendships (bidirektional, per Trigger gepflegt) ---------------------------
create table if not exists public.friendships (
  user_id    uuid not null,
  friend_id  uuid not null,
  created_at timestamptz not null default now(),
  constraint friendships_user_fkey
    foreign key (user_id) references public.profiles (id) on delete cascade,
  constraint friendships_friend_fkey
    foreign key (friend_id) references public.profiles (id) on delete cascade,
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists friendships_user_idx on public.friendships (user_id);

-- achievements (Katalog) ------------------------------------------------------
create table if not exists public.achievements (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text not null,
  icon        text not null default '🏅',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- user_achievements -----------------------------------------------------------
create table if not exists public.user_achievements (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create index if not exists user_achievements_user_idx on public.user_achievements (user_id);

-- =============================================================================
-- RLS auf ALLEN Tabellen aktivieren (Policies folgen in 0002).
-- Ohne Policy ist standardmäßig alles verboten -> sicherer Default.
-- =============================================================================
alter table public.profiles          enable row level security;
alter table public.exercises         enable row level security;
alter table public.workout_entries   enable row level security;
alter table public.user_goals        enable row level security;
alter table public.friend_requests   enable row level security;
alter table public.friendships       enable row level security;
alter table public.achievements      enable row level security;
alter table public.user_achievements enable row level security;
