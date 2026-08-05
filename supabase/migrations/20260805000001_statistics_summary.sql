-- 0001_statistics_summary.sql
-- Neue Statistik-Seite (ersetzt "Erfolge" im Menü): Übersicht- und
-- Rekorde-Tab brauchen All-Time-Kennzahlen, die keine bestehende RPC liefert.
-- get_my_stats() liefert nur today/week/total_amount + Level + current_streak
-- (kein total_sets, keine Tages-/Satz-Rekorde, kein longest_streak).
--
-- SECURITY INVOKER + auth.uid() (wie get_my_stats) statt SECURITY DEFINER:
-- kein p_user_id-Parameter, RLS bleibt in Kraft, Aufrufer sieht ausschließlich
-- eigene aggregierte Daten.
--
-- Streak-Logik dupliziert bewusst das gap-basierte chain_lengths-Muster aus
-- get_user_public_stats() (0010_user_public_stats.sql) — dieselbe Ruhetag-
-- Regel (gap=2 → Brücke, gap>=3 → Bruch), hier aber SECURITY INVOKER für
-- die eigenen Daten statt SECURITY DEFINER für fremde.

CREATE OR REPLACE FUNCTION public.get_my_statistics_summary(p_exercise uuid)
RETURNS TABLE (
  total_amount        bigint,
  total_sets          bigint,
  training_days       bigint,
  current_streak      integer,
  longest_streak      integer,
  avg_per_set         numeric,
  avg_per_training    numeric,
  best_day_amount     bigint,
  best_day_date       date,
  best_set_amount     integer,
  best_set_date       date,
  most_sets_in_day    integer,
  most_sets_day_date  date,
  best_avg_per_day    numeric,
  best_avg_per_day_date date
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH entries AS (
    SELECT
      amount,
      performed_at,
      (performed_at AT TIME ZONE 'Europe/Berlin')::date AS d
    FROM public.workout_entries
    WHERE user_id = auth.uid() AND exercise_id = p_exercise
  ),
  by_day AS (
    SELECT
      d,
      SUM(amount)   AS day_amount,
      COUNT(*)      AS day_sets,
      AVG(amount)   AS day_avg
    FROM entries
    GROUP BY d
  ),
  totals AS (
    SELECT
      COALESCE(SUM(amount), 0)::bigint AS total_amount,
      COUNT(*)::bigint                 AS total_sets
    FROM entries
  ),
  day_count AS (
    SELECT COUNT(*)::bigint AS training_days FROM by_day
  ),
  best_day AS (
    SELECT day_amount, d FROM by_day ORDER BY day_amount DESC, d DESC LIMIT 1
  ),
  best_set AS (
    SELECT amount, d FROM entries ORDER BY amount DESC, performed_at DESC LIMIT 1
  ),
  most_sets AS (
    SELECT day_sets, d FROM by_day ORDER BY day_sets DESC, d DESC LIMIT 1
  ),
  best_avg AS (
    SELECT day_avg, d FROM by_day ORDER BY day_avg DESC, d DESC LIMIT 1
  ),
  -- Längste Streak: gap=1 aufeinanderfolgend, gap=2 Ruhetag-Brücke (zählt
  -- nicht zur Länge), gap>=3 Kette bricht. Identisch zur Regel in
  -- get_user_public_stats() / compute_streak().
  training_gaps AS (
    SELECT
      d,
      COALESCE(d - LAG(d) OVER (ORDER BY d), 1) AS gap_from_prev
    FROM by_day
  ),
  chain_grouped AS (
    SELECT
      d,
      SUM(CASE WHEN gap_from_prev >= 3 THEN 1 ELSE 0 END)
        OVER (ORDER BY d ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS chain_id
    FROM training_gaps
  ),
  chain_lengths AS (
    SELECT COUNT(*)::int AS len FROM chain_grouped GROUP BY chain_id
  )
  SELECT
    t.total_amount,
    t.total_sets,
    dc.training_days,
    public.compute_streak(auth.uid(), p_exercise) AS current_streak,
    COALESCE((SELECT MAX(len) FROM chain_lengths), 0) AS longest_streak,
    CASE WHEN t.total_sets > 0
      THEN ROUND(t.total_amount::numeric / t.total_sets, 1) ELSE 0 END,
    CASE WHEN dc.training_days > 0
      THEN ROUND(t.total_amount::numeric / dc.training_days, 1) ELSE 0 END,
    (SELECT day_amount FROM best_day),
    (SELECT d FROM best_day),
    (SELECT amount FROM best_set),
    (SELECT d FROM best_set),
    (SELECT day_sets FROM most_sets),
    (SELECT d FROM most_sets),
    (SELECT ROUND(day_avg, 1) FROM best_avg),
    (SELECT d FROM best_avg)
  FROM totals t, day_count dc;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_statistics_summary(uuid) TO authenticated;
