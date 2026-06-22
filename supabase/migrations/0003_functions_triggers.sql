-- =============================================================================
-- PushupArena · 0003 · Funktionen & Trigger
-- -----------------------------------------------------------------------------
-- Gamification-Berechnung, Profil-Anlage bei Registrierung, Freundschaftslogik
-- und das sichere (aggregierte) Freundes-Leaderboard.
-- =============================================================================

-- updated_at automatisch pflegen ---------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.profiles;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.workout_entries;
create trigger set_updated_at before update on public.workout_entries
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.user_goals;
create trigger set_updated_at before update on public.user_goals
  for each row execute function public.set_updated_at();

drop trigger if exists set_updated_at on public.friend_requests;
create trigger set_updated_at before update on public.friend_requests
  for each row execute function public.set_updated_at();

-- =============================================================================
-- Gamification-Helfer
-- =============================================================================

-- Level aus XP (= Summe aller Wiederholungen).
-- Benötigtes Gesamt-XP für Level L = 50 * L * (L-1).
-- Umkehrung:  level = floor((1 + sqrt(1 + xp/12.5)) / 2)
create or replace function public.compute_level(xp integer)
returns integer language sql immutable as $$
  select greatest(1, floor((1 + sqrt(1 + greatest(xp, 0)::numeric / 12.5)) / 2))::int;
$$;

-- Aktuelle Serie (aufeinanderfolgende Tage mit Eintrag, endend heute/gestern, UTC).
create or replace function public.compute_streak(p_user uuid, p_exercise uuid)
returns integer language sql stable as $$
  with days as (
    select distinct ((performed_at at time zone 'UTC')::date) as d
    from public.workout_entries
    where user_id = p_user and exercise_id = p_exercise
  ),
  grouped as (
    select d, (d - (row_number() over (order by d))::int) as grp
    from days
  ),
  islands as (
    select grp, count(*) as len, max(d) as last_day
    from grouped
    group by grp
  )
  select coalesce((
    select len::int
    from islands
    where last_day >= (current_date - 1)   -- nur aktive Serie (heute oder gestern)
    order by last_day desc
    limit 1
  ), 0);
$$;

grant execute on function public.compute_level(integer)   to authenticated;
grant execute on function public.compute_streak(uuid, uuid) to authenticated;

-- Eigene Statistik fürs Dashboard (läuft als aufrufender Nutzer -> nur eigene Daten).
create or replace function public.get_my_stats(p_exercise uuid)
returns table (
  today_amount   bigint,
  week_amount    bigint,
  total_amount   bigint,
  level          integer,
  current_streak integer
)
language sql stable security invoker set search_path = public as $$
  select
    coalesce(sum(w.amount) filter (
      where (w.performed_at at time zone 'UTC')::date = current_date), 0)::bigint,
    coalesce(sum(w.amount) filter (
      where (w.performed_at at time zone 'UTC')::date
            >= date_trunc('week', current_date::timestamp)::date), 0)::bigint,
    coalesce(sum(w.amount), 0)::bigint,
    public.compute_level(coalesce(sum(w.amount), 0)::int),
    public.compute_streak(auth.uid(), p_exercise)
  from public.workout_entries w
  where w.user_id = auth.uid() and w.exercise_id = p_exercise;
$$;

grant execute on function public.get_my_stats(uuid) to authenticated;

-- =============================================================================
-- Profil-Anlage bei Registrierung (E-Mail- und Google-Login)
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base      text;
  candidate text;
  suffix    int := 0;
begin
  base := lower(coalesce(
    new.raw_user_meta_data ->> 'user_name',
    new.raw_user_meta_data ->> 'preferred_username',
    split_part(coalesce(new.email, ''), '@', 1),
    'athlet'
  ));
  base := regexp_replace(base, '[^a-z0-9_]', '', 'g');
  if base is null or char_length(base) < 3 then
    base := 'athlet';
  end if;
  base := left(base, 16);

  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    suffix := suffix + 1;
    candidate := left(base, 14) || suffix::text;
    if suffix > 9999 then
      candidate := left(base, 10) || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
      exit;
    end if;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    candidate,
    -- Auf die Spalten-Constraints kürzen, damit der Signup nie am Profil scheitert.
    left(coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      candidate
    ), 50),
    left(new.raw_user_meta_data ->> 'avatar_url', 500)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Freundschaftslogik
-- =============================================================================

-- Bei Annahme einer Anfrage bidirektionale Freundschaft anlegen.
create or replace function public.handle_friend_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and (old.status is distinct from 'accepted') then
    insert into public.friendships (user_id, friend_id)
    values (new.sender_id, new.receiver_id),
           (new.receiver_id, new.sender_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_friend_request_accepted on public.friend_requests;
create trigger on_friend_request_accepted
  after update on public.friend_requests
  for each row execute function public.handle_friend_accepted();

-- Anfrage senden (mit Auto-Accept bei vorhandener Gegenanfrage).
create or replace function public.send_friend_request(p_receiver uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_uid = p_receiver then raise exception 'cannot add yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_receiver) then
    raise exception 'user not found';
  end if;

  if exists (select 1 from public.friendships
             where user_id = v_uid and friend_id = p_receiver) then
    return 'already_friends';
  end if;

  -- Gegenanfrage vorhanden? -> direkt annehmen.
  if exists (select 1 from public.friend_requests
             where sender_id = p_receiver and receiver_id = v_uid and status = 'pending') then
    update public.friend_requests set status = 'accepted'
     where sender_id = p_receiver and receiver_id = v_uid;
    return 'accepted';
  end if;

  insert into public.friend_requests (sender_id, receiver_id, status)
  values (v_uid, p_receiver, 'pending')
  on conflict (sender_id, receiver_id)
    do update set status = 'pending', updated_at = now();

  return 'sent';
end;
$$;

-- Anfrage beantworten (nur Empfänger).
create or replace function public.respond_friend_request(p_request uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  update public.friend_requests
     set status = case when p_accept then 'accepted'::public.friend_request_status
                       else 'declined'::public.friend_request_status end
   where id = p_request and receiver_id = v_uid and status = 'pending';
end;
$$;

-- Freund entfernen (beide Richtungen + offene Anfragen aufräumen).
create or replace function public.remove_friend(p_friend uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  delete from public.friendships
   where (user_id = v_uid and friend_id = p_friend)
      or (user_id = p_friend and friend_id = v_uid);
  delete from public.friend_requests
   where (sender_id = v_uid and receiver_id = p_friend)
      or (sender_id = p_friend and receiver_id = v_uid);
end;
$$;

grant execute on function public.send_friend_request(uuid)            to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;
grant execute on function public.remove_friend(uuid)                  to authenticated;

-- =============================================================================
-- Sicheres Freundes-Leaderboard (aggregiert, KEINE Rohdaten/E-Mails)
-- SECURITY DEFINER: liest übergreifend, gibt aber nur Caller + bestätigte Freunde
-- und nur unkritische Vergleichsfelder zurück.
-- =============================================================================
create or replace function public.get_friend_leaderboard(p_exercise uuid)
returns table (
  user_id        uuid,
  username       citext,
  display_name   text,
  avatar_url     text,
  today_amount   bigint,
  total_amount   bigint,
  level          integer,
  current_streak integer,
  is_me          boolean
)
language sql stable security definer set search_path = public as $$
  with friend_ids as (
    select auth.uid() as uid
    union
    select friend_id from public.friendships where user_id = auth.uid()
  )
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce((
      select sum(w.amount) from public.workout_entries w
      where w.user_id = p.id and w.exercise_id = p_exercise
        and (w.performed_at at time zone 'UTC')::date = current_date
    ), 0)::bigint as today_amount,
    coalesce((
      select sum(w.amount) from public.workout_entries w
      where w.user_id = p.id and w.exercise_id = p_exercise
    ), 0)::bigint as total_amount,
    public.compute_level(coalesce((
      select sum(w.amount)::int from public.workout_entries w
      where w.user_id = p.id and w.exercise_id = p_exercise
    ), 0)) as level,
    public.compute_streak(p.id, p_exercise) as current_streak,
    (p.id = auth.uid()) as is_me
  from public.profiles p
  where auth.uid() is not null
    and p.id in (select uid from friend_ids)
  order by total_amount desc;
$$;

grant execute on function public.get_friend_leaderboard(uuid) to authenticated;

-- =============================================================================
-- Achievements serverseitig auswerten (verhindert gefälschte Freischaltungen).
-- Gibt die in diesem Aufruf NEU freigeschalteten Badges zurück.
-- =============================================================================
create or replace function public.evaluate_achievements(p_exercise uuid)
returns table (slug text, name text, icon text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid         uuid := auth.uid();
  v_total       int := 0;
  v_today       int := 0;
  v_week        int := 0;
  v_max         int := 0;
  v_count       int := 0;
  v_streak      int := 0;
  v_daily_goal  int := 0;
  v_weekly_goal int := 0;
  v_latest      int := 0;
begin
  if v_uid is null then return; end if;

  select
    coalesce(sum(amount), 0),
    coalesce(sum(amount) filter (
      where (performed_at at time zone 'UTC')::date = current_date), 0),
    coalesce(sum(amount) filter (
      where (performed_at at time zone 'UTC')::date
            >= date_trunc('week', current_date::timestamp)::date), 0),
    coalesce(max(amount), 0),
    count(*)
  into v_total, v_today, v_week, v_max, v_count
  from public.workout_entries
  where user_id = v_uid and exercise_id = p_exercise;

  v_streak := public.compute_streak(v_uid, p_exercise);

  select coalesce(daily_goal, 0), coalesce(weekly_goal, 0)
  into v_daily_goal, v_weekly_goal
  from public.user_goals
  where user_id = v_uid and exercise_id = p_exercise;
  v_daily_goal  := coalesce(v_daily_goal, 0);
  v_weekly_goal := coalesce(v_weekly_goal, 0);

  select amount into v_latest
  from public.workout_entries
  where user_id = v_uid and exercise_id = p_exercise
  order by performed_at desc
  limit 1;
  v_latest := coalesce(v_latest, 0);

  return query
  with conditions(slug, met) as (
    values
      ('first-10',        v_total >= 10),
      ('century',         v_total >= 100),
      ('streak-7',        v_streak >= 7),
      ('daily-goal',      v_daily_goal > 0 and v_today >= v_daily_goal),
      ('weekly-goal',     v_weekly_goal > 0 and v_week >= v_weekly_goal),
      ('personal-record', v_count > 1 and v_latest = v_max and v_max > 0)
  ),
  to_unlock as (
    select a.id, a.slug, a.name, a.icon
    from public.achievements a
    join conditions c on c.slug = a.slug
    where c.met
      and not exists (
        select 1 from public.user_achievements ua
        where ua.user_id = v_uid and ua.achievement_id = a.id
      )
  ),
  ins as (
    insert into public.user_achievements (user_id, achievement_id)
    select v_uid, id from to_unlock
    on conflict do nothing
    returning achievement_id
  )
  select t.slug, t.name, t.icon
  from to_unlock t
  join ins on ins.achievement_id = t.id;
end;
$$;

grant execute on function public.evaluate_achievements(uuid) to authenticated;
