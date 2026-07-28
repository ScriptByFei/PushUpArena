-- =============================================================================
-- PushupArena · 0002 · Row Level Security Policies
-- -----------------------------------------------------------------------------
-- Grundsätze:
--   * Nutzer sehen/ändern nur EIGENE private Daten (workouts, goals).
--   * Profile sind nur eingeschränkt sichtbar (eigenes, suchbare, Freunde).
--   * Freundschaftsdaten nur für Beteiligte.
--   * Vergleichsdaten kommen ausschließlich aggregiert über get_friend_leaderboard().
--   * friendships werden NICHT direkt geschrieben, sondern per Trigger/RPC (0003).
-- =============================================================================

-- Grants: Tabellen-Zugriff nur für eingeloggte Nutzer (anon bleibt außen vor).
grant usage on schema public to authenticated;

-- profiles --------------------------------------------------------------------
grant select, insert, update, delete on public.profiles to authenticated;

create policy "profiles_select_visible"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or is_searchable = true
    or id in (select friend_id from public.friendships where user_id = auth.uid())
  );

create policy "profiles_insert_self"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_delete_self"
  on public.profiles for delete to authenticated
  using (id = auth.uid());

-- exercises (nur lesbar; Pflege erfolgt über Migrationen/Service-Role) ---------
grant select on public.exercises to authenticated;

create policy "exercises_select_all"
  on public.exercises for select to authenticated
  using (true);

-- workout_entries (streng privat) ---------------------------------------------
grant select, insert, update, delete on public.workout_entries to authenticated;

create policy "workout_select_own"
  on public.workout_entries for select to authenticated
  using (user_id = auth.uid());

create policy "workout_insert_own"
  on public.workout_entries for insert to authenticated
  with check (user_id = auth.uid());

create policy "workout_update_own"
  on public.workout_entries for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "workout_delete_own"
  on public.workout_entries for delete to authenticated
  using (user_id = auth.uid());

-- user_goals (streng privat) --------------------------------------------------
grant select, insert, update, delete on public.user_goals to authenticated;

create policy "goals_select_own"
  on public.user_goals for select to authenticated
  using (user_id = auth.uid());

create policy "goals_insert_own"
  on public.user_goals for insert to authenticated
  with check (user_id = auth.uid());

create policy "goals_update_own"
  on public.user_goals for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "goals_delete_own"
  on public.user_goals for delete to authenticated
  using (user_id = auth.uid());

-- friend_requests (nur Beteiligte) --------------------------------------------
grant select, insert, update, delete on public.friend_requests to authenticated;

create policy "friend_requests_select_involved"
  on public.friend_requests for select to authenticated
  using (auth.uid() in (sender_id, receiver_id));

create policy "friend_requests_insert_as_sender"
  on public.friend_requests for insert to authenticated
  with check (sender_id = auth.uid());

-- Empfänger darf annehmen/ablehnen (Status setzen).
create policy "friend_requests_update_as_receiver"
  on public.friend_requests for update to authenticated
  using (receiver_id = auth.uid())
  with check (receiver_id = auth.uid());

-- Beide Beteiligten dürfen Anfrage entfernen (zurückziehen/aufräumen).
create policy "friend_requests_delete_involved"
  on public.friend_requests for delete to authenticated
  using (auth.uid() in (sender_id, receiver_id));

-- friendships (nur lesbar; Schreiben ausschließlich über Trigger/RPC) ----------
grant select on public.friendships to authenticated;

create policy "friendships_select_own"
  on public.friendships for select to authenticated
  using (auth.uid() in (user_id, friend_id));

-- achievements (Katalog, nur lesbar) ------------------------------------------
grant select on public.achievements to authenticated;

create policy "achievements_select_all"
  on public.achievements for select to authenticated
  using (true);

-- user_achievements (eigene Badges) -------------------------------------------
grant select, insert, delete on public.user_achievements to authenticated;

create policy "user_achievements_select_own"
  on public.user_achievements for select to authenticated
  using (user_id = auth.uid());

-- Direktes Einfügen erlaubt (eigene), die robuste Freischaltung erfolgt jedoch
-- serverseitig per evaluate_achievements() (0003), das echte Bedingungen prüft.
create policy "user_achievements_insert_own"
  on public.user_achievements for insert to authenticated
  with check (user_id = auth.uid());

create policy "user_achievements_delete_own"
  on public.user_achievements for delete to authenticated
  using (user_id = auth.uid());
