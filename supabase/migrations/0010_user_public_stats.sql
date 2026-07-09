-- 0010_user_public_stats.sql
-- Adds a public RPC to fetch stats for any user (used by UserInfoSheet on the Friends page).
-- SECURITY DEFINER so it can bypass RLS; only exposes aggregate workout data.
-- week_days: boolean[7] für Mo–So der aktuellen Woche (index 0 = Montag).

CREATE OR REPLACE FUNCTION public.get_user_public_stats(
  p_user_id uuid,
  p_exercise uuid
)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  monday AS (
    SELECT date_trunc('week', CURRENT_DATE)::date AS mon
  ),
  workout_dates AS (
    SELECT DISTINCT (performed_at AT TIME ZONE 'UTC')::date AS d
    FROM public.workout_entries
    WHERE user_id = p_user_id AND exercise_id = p_exercise
  ),
  totals AS (
    SELECT
      COALESCE(SUM(amount), 0)::bigint AS total_amount,
      COUNT(DISTINCT (performed_at AT TIME ZONE 'UTC')::date)::bigint AS training_days
    FROM public.workout_entries
    WHERE user_id = p_user_id AND exercise_id = p_exercise
  ),
  -- best streak (gaps-and-islands)
  dated_ranked AS (
    SELECT d, ROW_NUMBER() OVER (ORDER BY d)::int AS rn
    FROM workout_dates
  ),
  streak_groups AS (
    SELECT d - rn AS grp, COUNT(*)::int AS len
    FROM dated_ranked
    GROUP BY grp
  ),
  -- current streak
  recent_ranked AS (
    SELECT d, ROW_NUMBER() OVER (ORDER BY d DESC)::int AS rn
    FROM workout_dates
  ),
  -- aktuelle Woche Mo–So (gs 0=Mo … 6=So)
  week_data AS (
    SELECT
      gs,
      EXISTS (
        SELECT 1 FROM public.workout_entries
        WHERE user_id = p_user_id
          AND exercise_id = p_exercise
          AND (performed_at AT TIME ZONE 'UTC')::date = (SELECT mon FROM monday) + gs
      ) AS active
    FROM generate_series(0, 6) AS gs
  )
  SELECT json_build_object(
    'total_amount',   t.total_amount,
    'training_days',  t.training_days,
    'avg_per_day',    CASE WHEN t.training_days > 0
                        THEN ROUND(t.total_amount::numeric / t.training_days, 1)
                        ELSE 0 END,
    'best_streak',    COALESCE((SELECT MAX(len) FROM streak_groups), 0),
    'current_streak', COALESCE(
      CASE WHEN EXISTS (SELECT 1 FROM recent_ranked WHERE rn = 1 AND d >= CURRENT_DATE - 1)
        THEN (SELECT COUNT(*)::int FROM recent_ranked WHERE d = CURRENT_DATE - (rn - 1))
        ELSE 0
      END, 0),
    'days_member',    (CURRENT_DATE - (
      SELECT (created_at AT TIME ZONE 'UTC')::date FROM public.profiles WHERE id = p_user_id
    )),
    'week_days',      (SELECT jsonb_agg(active ORDER BY gs) FROM week_data)
  )
  FROM totals t;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_public_stats(uuid, uuid) TO authenticated;
