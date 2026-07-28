-- =============================================================================
-- PushupArena · 0005 · Security-Hardening (Supabase Advisor)
-- -----------------------------------------------------------------------------
-- 1. search_path der restlichen Funktionen fixieren (function_search_path_mutable).
-- 2. EXECUTE von PUBLIC entziehen, damit anonyme Aufrufer SECURITY-DEFINER-Funktionen
--    nicht aufrufen können; gewünschte Rechte für `authenticated` explizit setzen.
--    Trigger-Funktionen werden für alle Rollen gesperrt (Trigger laufen ohnehin
--    mit Owner-Rechten, unabhängig von EXECUTE-Grants).
-- =============================================================================

-- 1) search_path fixieren -----------------------------------------------------
alter function public.set_updated_at()                set search_path = public;
alter function public.compute_level(integer)          set search_path = public;
alter function public.compute_streak(uuid, uuid)      set search_path = public;

-- 2) EXECUTE entziehen --------------------------------------------------------
--    Supabase grantet EXECUTE nicht nur an PUBLIC, sondern auch explizit an
--    anon/authenticated -> daher müssen diese Rollen ausdrücklich genannt werden.

-- Trigger-Funktionen: für alle App-Rollen sperren (Trigger laufen mit Owner-Rechten).
revoke execute on function public.set_updated_at()         from public, anon, authenticated;
revoke execute on function public.handle_new_user()        from public, anon, authenticated;
revoke execute on function public.handle_friend_accepted() from public, anon, authenticated;

-- Helfer & RPCs: anon entfernen, authenticated behält (s. u.).
revoke execute on function public.compute_level(integer)                 from public, anon;
revoke execute on function public.compute_streak(uuid, uuid)             from public, anon;
revoke execute on function public.get_my_stats(uuid)                     from public, anon;
revoke execute on function public.send_friend_request(uuid)              from public, anon;
revoke execute on function public.respond_friend_request(uuid, boolean)  from public, anon;
revoke execute on function public.remove_friend(uuid)                    from public, anon;
revoke execute on function public.get_friend_leaderboard(uuid)           from public, anon;
revoke execute on function public.evaluate_achievements(uuid)            from public, anon;

-- 3) Gewünschte Rechte für eingeloggte Nutzer (erneut) explizit setzen --------
--    (Trigger-Funktionen set_updated_at/handle_* erhalten BEWUSST keinen Grant.)
grant execute on function public.compute_level(integer)                 to authenticated;
grant execute on function public.compute_streak(uuid, uuid)             to authenticated;
grant execute on function public.get_my_stats(uuid)                     to authenticated;
grant execute on function public.send_friend_request(uuid)              to authenticated;
grant execute on function public.respond_friend_request(uuid, boolean)  to authenticated;
grant execute on function public.remove_friend(uuid)                    to authenticated;
grant execute on function public.get_friend_leaderboard(uuid)           to authenticated;
grant execute on function public.evaluate_achievements(uuid)            to authenticated;
