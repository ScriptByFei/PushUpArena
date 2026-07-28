-- Füge daily_challenge_entries zur supabase_realtime Publication hinzu.
-- Idempotent: schlägt nicht fehl, wenn die Tabelle bereits enthalten ist.
-- Verändert keine anderen Tabellen der Publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_publication_tables
    WHERE  pubname    = 'supabase_realtime'
      AND  schemaname = 'public'
      AND  tablename  = 'daily_challenge_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_challenge_entries;
  END IF;
END;
$$;
