-- Migration: daily_live_realtime_via_live_activity
-- ─────────────────────────────────────────────────────────────────────────────
-- Korrektur zu 20260727_daily_live_single_source.sql:
--
-- workout_entries hat RLS "nur eigene Zeilen" (workout_select_own). Supabase
-- Realtime erzwingt RLS bei Postgres-Changes-Subscriptions für authenticated-
-- Clients — ein Client hätte also NIE die INSERT/UPDATE/DELETE-Events anderer
-- Nutzer erhalten, nur seine eigenen. Für eine gemeinsame Live-Rangliste ist
-- das nutzlos (kein Datenleck, aber funktionslos für den Zweck).
--
-- Die App hat für genau dieses Problem bereits eine Lösung: public.live_activity
-- (siehe 20260716_arena_feed_v2.sql) — eine öffentlich lesbare Aggregat-Tabelle
-- (RLS: SELECT true für alle authenticated), die bei jedem workout_entries-
-- Insert/Update/Delete automatisch per Trigger aktualisiert wird und bereits
-- in der supabase_realtime-Publikation ist. Daily Live nutzt sie ab jetzt als
-- Realtime-Signal ("irgendwas hat sich geändert → Rangliste neu laden"), ohne
-- workout_entries selbst breiter zu exponieren.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'workout_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.workout_entries;
  END IF;
END $$;
