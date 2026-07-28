-- ============================================================
-- Bugfix: get_my_stats — Timezone UTC → Europe/Berlin
--
-- Problem:
--   today_amount und week_amount wurden mit UTC-Datum gefiltert:
--     (performed_at at time zone 'UTC')::date = current_date
--   current_date = PostgreSQL-Server-Datum (= UTC auf Supabase).
--   Einträge zwischen 23:00–00:59 Berliner Zeit (UTC+1 / UTC+2 im Sommer)
--   landeten dadurch auf dem falschen Tag.
--
-- Fix:
--   Beide Filter auf Europe/Berlin umstellen, analog zu get_my_daily_rank
--   und compute_streak (0008_streak_rest_days.sql).
--
-- Risiko:
--   Einträge die bisher auf dem "falschen" UTC-Tag lagen, werden jetzt
--   korrekt auf den Berliner Tag gezählt. Minimale Differenz nur für
--   Nutzer, die zwischen 22:00 UTC und 23:00 UTC geloggt haben.
--   Die Gesamtsumme (total_amount) ist nicht betroffen.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_stats(p_exercise uuid)
RETURNS TABLE (
  today_amount   bigint,
  week_amount    bigint,
  total_amount   bigint,
  level          integer,
  current_streak integer
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT
    -- Heute (Berliner Datum)
    COALESCE(SUM(w.amount) FILTER (
      WHERE (w.performed_at AT TIME ZONE 'Europe/Berlin')::date
            = (now() AT TIME ZONE 'Europe/Berlin')::date
    ), 0)::bigint,

    -- Diese Woche (Berliner Kalenderwoche, Montag als erster Tag)
    COALESCE(SUM(w.amount) FILTER (
      WHERE (w.performed_at AT TIME ZONE 'Europe/Berlin')::date
            >= date_trunc('week', (now() AT TIME ZONE 'Europe/Berlin')::timestamp)::date
    ), 0)::bigint,

    -- Gesamt (kein Datumfilter)
    COALESCE(SUM(w.amount), 0)::bigint,

    -- Level aus Gesamt-XP
    public.compute_level(COALESCE(SUM(w.amount), 0)::int),

    -- Streak (eigene Funktion, bereits Berlin-korrekt seit 0008_streak_rest_days.sql)
    public.compute_streak(auth.uid(), p_exercise)

  FROM public.workout_entries w
  WHERE w.user_id = auth.uid()
    AND w.exercise_id = p_exercise;
$$;
