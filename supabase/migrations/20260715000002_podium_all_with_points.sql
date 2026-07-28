-- Migration: Medaillenrangliste zeigt alle Nutzer mit medal_points >= 1
--
-- PROBLEM:
--   1. JOIN medal_counts (INNER) schloss Nutzer aus, die nur hundred_plus_days
--      haben (keine Medaille, aber trotzdem Punkte).
--   2. WHERE prüfte nur gold/silver/bronze, ignorierte hundred_plus_days.
--
-- FIX:
--   - JOIN medal_counts → LEFT JOIN
--   - WHERE: medal_points-Formel >= 1

CREATE OR REPLACE FUNCTION public.get_global_podium_history(p_exercise uuid)
RETURNS TABLE(
  user_id          uuid,
  username         text,
  display_name     text,
  avatar_url       text,
  gold_count       bigint,
  silver_count     bigint,
  bronze_count     bigint,
  half_gold        integer,
  half_silver      integer,
  half_bronze      integer,
  hundred_plus_days bigint,
  medal_points     bigint,
  total_reps       bigint,
  is_me            boolean,
  is_friend        boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH medal_counts AS (
    SELECT
      dr.user_id,
      COUNT(*) FILTER (WHERE dr.yesterday_medal = 'gold')::bigint   AS gold_count,
      COUNT(*) FILTER (WHERE dr.yesterday_medal = 'silver')::bigint AS silver_count,
      COUNT(*) FILTER (WHERE dr.yesterday_medal = 'bronze')::bigint AS bronze_count
    FROM daily_recaps dr
    WHERE dr.exercise_id = p_exercise
      AND dr.yesterday_medal IS NOT NULL
    GROUP BY dr.user_id
  ),
  half_coins AS (
    SELECT
      hc.user_id,
      COALESCE(MAX(hc.count) FILTER (WHERE hc.type = 'gold'),   0)::integer AS half_gold,
      COALESCE(MAX(hc.count) FILTER (WHERE hc.type = 'silver'), 0)::integer AS half_silver,
      COALESCE(MAX(hc.count) FILTER (WHERE hc.type = 'bronze'), 0)::integer AS half_bronze
    FROM user_half_coins hc
    WHERE hc.exercise_id = p_exercise
    GROUP BY hc.user_id
  ),
  hundred_plus AS (
    SELECT user_id, COUNT(*)::bigint AS days_count
    FROM (
      SELECT
        we.user_id,
        DATE(we.performed_at AT TIME ZONE 'Europe/Berlin') AS day
      FROM workout_entries we
      WHERE we.exercise_id = p_exercise
        AND DATE(we.performed_at AT TIME ZONE 'Europe/Berlin') >= '2026-07-06'
      GROUP BY we.user_id, DATE(we.performed_at AT TIME ZONE 'Europe/Berlin')
      HAVING SUM(we.amount) >= 100
    ) sub
    GROUP BY user_id
  ),
  total_reps AS (
    SELECT user_id, COALESCE(SUM(amount), 0)::bigint AS reps
    FROM workout_entries
    WHERE exercise_id = p_exercise
    GROUP BY user_id
  ),
  friend_ids AS (
    SELECT friend_id FROM friendships WHERE user_id = auth.uid()
  )
  SELECT
    p.id                                                    AS user_id,
    p.username::text,
    p.display_name,
    p.avatar_url,
    COALESCE(mc.gold_count,   0)                            AS gold_count,
    COALESCE(mc.silver_count, 0)                            AS silver_count,
    COALESCE(mc.bronze_count, 0)                            AS bronze_count,
    COALESCE(hc.half_gold,    0)                            AS half_gold,
    COALESCE(hc.half_silver,  0)                            AS half_silver,
    COALESCE(hc.half_bronze,  0)                            AS half_bronze,
    COALESCE(hp.days_count,   0)                            AS hundred_plus_days,
    (COALESCE(mc.gold_count,   0) * 4
     + COALESCE(mc.silver_count, 0) * 2
     + COALESCE(mc.bronze_count, 0) * 1
     + COALESCE(hp.days_count,   0) * 1)                   AS medal_points,
    COALESCE(tr.reps, 0)                                    AS total_reps,
    (p.id = auth.uid())                                     AS is_me,
    (p.id IN (SELECT friend_id FROM friend_ids))            AS is_friend
  FROM profiles p
  LEFT JOIN medal_counts mc ON mc.user_id = p.id
  LEFT JOIN half_coins   hc ON hc.user_id = p.id
  LEFT JOIN hundred_plus hp ON hp.user_id = p.id
  LEFT JOIN total_reps   tr ON tr.user_id = p.id
  WHERE (
    COALESCE(mc.gold_count,   0) * 4
    + COALESCE(mc.silver_count, 0) * 2
    + COALESCE(mc.bronze_count, 0) * 1
    + COALESCE(hp.days_count,   0) * 1
  ) >= 1
  ORDER BY
    (COALESCE(mc.gold_count,   0) * 4
     + COALESCE(mc.silver_count, 0) * 2
     + COALESCE(mc.bronze_count, 0) * 1
     + COALESCE(hp.days_count,   0) * 1) DESC,
    COALESCE(mc.gold_count,   0) DESC,
    COALESCE(mc.silver_count, 0) DESC,
    COALESCE(mc.bronze_count, 0) DESC,
    COALESCE(tr.reps, 0) DESC;
$$;
