-- Migration: Arena Live — get_arena_live_activity RPC
--
-- Reine Read-Projektion für den kompakten Live-Ticker (Arena Live, Phase 3).
-- Liefert JEDEN heutigen workout_entries-Satz (nicht nur Meilenstein-Events aus
-- feed_events) inkl. laufender Tagessumme zum Zeitpunkt des Satzes.
-- Kein neuer Trigger, keine neue Tabelle — bei UPDATE/DELETE von workout_entries
-- ist das Ergebnis beim nächsten Aufruf automatisch korrekt, da nichts persistiert
-- wird. Filter- und Sichtbarkeitslogik spiegelt get_arena_feed (my_friends CTE).

CREATE OR REPLACE FUNCTION public.get_arena_live_activity(
  p_filter text DEFAULT 'global',
  p_limit  int  DEFAULT 40
) RETURNS TABLE (
  entry_id      uuid,
  user_id       uuid,
  display_name  text,
  username      text,
  avatar_url    text,
  exercise_id   uuid,
  exercise_name text,
  amount        integer,
  running_total integer,
  performed_at  timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH my_friends AS (
    SELECT friend_id FROM public.friendships WHERE user_id = auth.uid()
    UNION ALL SELECT auth.uid()
  ),
  today_entries AS (
    SELECT
      we.id,
      we.user_id,
      we.exercise_id,
      we.amount,
      we.performed_at,
      SUM(we.amount) OVER (
        PARTITION BY we.user_id, we.exercise_id
        ORDER BY we.performed_at, we.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      )::integer AS running_total
    FROM public.workout_entries we
    JOIN public.exercises ex ON ex.id = we.exercise_id
    WHERE ex.slug = 'pushups'
      AND (we.performed_at AT TIME ZONE 'Europe/Berlin')::date = (now() AT TIME ZONE 'Europe/Berlin')::date
      AND CASE
        WHEN p_filter = 'global'  THEN true
        WHEN p_filter = 'friends' THEN we.user_id IN (SELECT friend_id FROM my_friends)
        ELSE false
      END
  )
  SELECT
    te.id,
    te.user_id,
    COALESCE(p.display_name, p.username::text),
    p.username::text,
    p.avatar_url,
    te.exercise_id,
    ex.name,
    te.amount,
    te.running_total,
    te.performed_at
  FROM today_entries te
  JOIN public.profiles p  ON p.id  = te.user_id
  JOIN public.exercises ex ON ex.id = te.exercise_id
  ORDER BY te.performed_at DESC
  LIMIT LEAST(p_limit, 100);
$$;

GRANT EXECUTE ON FUNCTION public.get_arena_live_activity(text, int) TO authenticated;
