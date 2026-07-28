-- get_my_daily_rank: returns the calling user's position in today's global ranking.
-- Uses identical canonical ranking logic as get_global_daily_leaderboard:
--   ROW_NUMBER() OVER (ORDER BY day_total DESC, max_performed_at ASC)
-- Returns no rows if the user has not trained today → daily_rank = null client-side.

CREATE OR REPLACE FUNCTION public.get_my_daily_rank(p_exercise uuid)
RETURNS TABLE(daily_rank bigint, today_amount bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH v_today AS (
    SELECT (NOW() AT TIME ZONE 'Europe/Berlin')::date AS today
  ),
  totals AS (
    SELECT
      user_id,
      SUM(amount)::bigint AS day_total,
      MAX(performed_at)   AS max_ts
    FROM public.workout_entries
    WHERE exercise_id = p_exercise
      AND (performed_at AT TIME ZONE 'Europe/Berlin')::date = (SELECT today FROM v_today)
    GROUP BY user_id
  ),
  ranked AS (
    SELECT
      user_id,
      day_total,
      ROW_NUMBER() OVER (ORDER BY day_total DESC, max_ts ASC)::bigint AS rnk
    FROM totals
  )
  SELECT rnk, day_total
  FROM ranked
  WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_daily_rank(uuid) TO authenticated;
