-- Migration: daily_live_drop_workout_entries_publication
-- ─────────────────────────────────────────────────────────────────────────────
-- Re-run von 20260727_daily_live_realtime_via_live_activity.sql mit eindeutigem
-- Versions-Präfix: die ursprüngliche Datei teilte sich den Datums-Präfix
-- "20260727" mit 20260727_daily_live_single_source.sql, wodurch die Supabase-
-- CLI die Migrations-Historie nicht eindeutig zuordnen konnte und das
-- eigentliche DROP TABLE nie ausgeführt hat (nur fälschlich als "applied"
-- vermerkt). Per Live-Diagnose bestätigt: workout_entries war weiterhin in
-- der Publikation. Dieser Fix führt das DROP TABLE tatsächlich aus.
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
