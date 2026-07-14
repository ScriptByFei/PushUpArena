-- Migration: Ranking fairness — "first to reach keeps the rank"
--
-- CANONICAL ranking rule (used everywhere):
--   ORDER BY daily_total DESC, MAX(performed_at for today) ASC
--   via ROW_NUMBER() (never RANK — no shared ranks)
--
-- BUGS FIXED:
--   1. maybe_create_workout_feed_events: RANK() → ROW_NUMBER() + tiebreaker (3 places)
--   2. get_friend_leaderboard: tiebreaker_at was all-time MAX → now today-only MAX
--   3. get_all_active_today: ORDER BY had no tiebreaker → added MAX(performed_at) ASC
--
-- NOT CHANGED (already correct):
--   get_global_daily_leaderboard — uses today-scoped MAX + ROW_NUMBER ✓
--   generate_daily_recaps        — uses ROW_NUMBER + MAX(performed_at) ASC ✓


-- ── 1. Feed trigger ────────────────────────────────────────────────────────────
-- Replace the three RANK() subqueries with ROW_NUMBER() + MAX(performed_at) tiebreaker.

CREATE OR REPLACE FUNCTION public.maybe_create_workout_feed_events()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_slug           text;
  v_today          date;
  v_daily_total    int;
  v_prev_best      int;
  v_all_total      int;
  v_streak         int;
  v_before_amt     int;
  v_berlin_hour    int;
  v_rank           int;
  v_rank_before    int;
  v_days_off       int;
  v_overtaken_name text;
BEGIN
  SELECT slug INTO v_slug FROM exercises WHERE id = NEW.exercise_id;
  IF v_slug NOT IN ('pushups') THEN RETURN NEW; END IF;

  v_today       := (NEW.performed_at AT TIME ZONE 'Europe/Berlin')::date;
  v_berlin_hour := EXTRACT(hour FROM (NEW.performed_at AT TIME ZONE 'Europe/Berlin'))::int;

  SELECT COALESCE(SUM(amount), 0) INTO v_daily_total
  FROM workout_entries
  WHERE user_id = NEW.user_id AND exercise_id = NEW.exercise_id
    AND (performed_at AT TIME ZONE 'Europe/Berlin')::date = v_today;

  v_before_amt := v_daily_total - NEW.amount;

  SELECT COALESCE(MAX(day_total), 0) INTO v_prev_best
  FROM (
    SELECT SUM(amount) AS day_total
    FROM workout_entries
    WHERE user_id = NEW.user_id AND exercise_id = NEW.exercise_id
      AND (performed_at AT TIME ZONE 'Europe/Berlin')::date < v_today
    GROUP BY (performed_at AT TIME ZONE 'Europe/Berlin')::date
  ) sub;

  SELECT COALESCE(SUM(amount), 0) INTO v_all_total
  FROM workout_entries
  WHERE user_id = NEW.user_id AND exercise_id = NEW.exercise_id;

  -- ── Canonical rank AFTER insert ────────────────────────────────────────────
  -- Same logic as get_global_daily_leaderboard:
  --   equal daily total → whoever reached it first (earlier MAX performed_at) wins
  SELECT r.rnk INTO v_rank
  FROM (
    SELECT user_id,
           ROW_NUMBER() OVER (ORDER BY day_total DESC, max_ts ASC)::int AS rnk
    FROM (
      SELECT user_id,
             SUM(amount)       AS day_total,
             MAX(performed_at) AS max_ts
      FROM workout_entries
      WHERE exercise_id = NEW.exercise_id
        AND (performed_at AT TIME ZONE 'Europe/Berlin')::date = v_today
      GROUP BY user_id
    ) totals
  ) r
  WHERE r.user_id = NEW.user_id;

  -- ── Canonical rank BEFORE this insert (exclude this entry) ────────────────
  SELECT r.rnk INTO v_rank_before
  FROM (
    SELECT user_id,
           ROW_NUMBER() OVER (ORDER BY day_total DESC, max_ts ASC)::int AS rnk
    FROM (
      SELECT user_id,
             SUM(amount)       AS day_total,
             MAX(performed_at) AS max_ts
      FROM workout_entries
      WHERE exercise_id = NEW.exercise_id
        AND (performed_at AT TIME ZONE 'Europe/Berlin')::date = v_today
        AND id != NEW.id
      GROUP BY user_id
    ) totals
  ) r
  WHERE r.user_id = NEW.user_id;

  -- ── Daily milestones ───────────────────────────────────────────────────────
  IF v_daily_total >= 20 AND v_before_amt < 20 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'milestone_20', NEW.exercise_id, jsonb_build_object('today_total', v_daily_total), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  IF v_daily_total >= 100 AND v_before_amt < 100 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'milestone_100', NEW.exercise_id, jsonb_build_object('today_total', v_daily_total), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  IF v_daily_total >= 250 AND v_before_amt < 250 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'milestone_250', NEW.exercise_id, jsonb_build_object('today_total', v_daily_total), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  IF v_daily_total >= 500 AND v_before_amt < 500 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'milestone_500', NEW.exercise_id, jsonb_build_object('today_total', v_daily_total), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  IF v_daily_total >= 1000 AND v_before_amt < 1000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'milestone_1000', NEW.exercise_id, jsonb_build_object('today_total', v_daily_total), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  -- ── Personal daily record ──────────────────────────────────────────────────
  IF v_daily_total > v_prev_best AND v_prev_best > 0 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'daily_record', NEW.exercise_id,
            jsonb_build_object('reps', v_daily_total, 'prev_best', v_prev_best), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL
    DO UPDATE SET metadata = jsonb_build_object(
      'reps',      v_daily_total,
      'prev_best', (feed_events.metadata->>'prev_best')::int
    );
  END IF;

  -- ── First-ever 500-rep day ─────────────────────────────────────────────────
  IF v_daily_total >= 500 AND v_before_amt < 500 AND NOT EXISTS (
    SELECT 1 FROM feed_events
    WHERE user_id = NEW.user_id AND event_type = 'first_500_day' AND exercise_id = NEW.exercise_id
  ) THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'first_500_day', NEW.exercise_id, jsonb_build_object('reps', v_daily_total), v_today)
    ON CONFLICT (user_id, exercise_id, event_type) WHERE event_type IN ('top10_first','top3_first','first_500_day','first_1000_day') DO NOTHING;
  END IF;

  -- ── First-ever 1000-rep day ────────────────────────────────────────────────
  IF v_daily_total >= 1000 AND v_before_amt < 1000 AND NOT EXISTS (
    SELECT 1 FROM feed_events
    WHERE user_id = NEW.user_id AND event_type = 'first_1000_day' AND exercise_id = NEW.exercise_id
  ) THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'first_1000_day', NEW.exercise_id, jsonb_build_object('reps', v_daily_total), v_today)
    ON CONFLICT (user_id, exercise_id, event_type) WHERE event_type IN ('top10_first','top3_first','first_500_day','first_1000_day') DO NOTHING;
  END IF;

  -- ── Cumulative total milestones ────────────────────────────────────────────
  IF v_all_total >= 1000 AND (v_all_total - NEW.amount) < 1000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'total_1000', NEW.exercise_id, jsonb_build_object('total', v_all_total), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;
  IF v_all_total >= 5000 AND (v_all_total - NEW.amount) < 5000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'total_5000', NEW.exercise_id, jsonb_build_object('total', v_all_total), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;
  IF v_all_total >= 10000 AND (v_all_total - NEW.amount) < 10000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'total_10000', NEW.exercise_id, jsonb_build_object('total', v_all_total), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;
  IF v_all_total >= 25000 AND (v_all_total - NEW.amount) < 25000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'total_25000', NEW.exercise_id, jsonb_build_object('total', v_all_total), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;
  IF v_all_total >= 50000 AND (v_all_total - NEW.amount) < 50000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'total_50000', NEW.exercise_id, jsonb_build_object('total', v_all_total), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;
  IF v_all_total >= 100000 AND (v_all_total - NEW.amount) < 100000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'total_100000', NEW.exercise_id, jsonb_build_object('total', v_all_total), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  -- ── Streak milestones ──────────────────────────────────────────────────────
  v_streak := get_exercise_streak(NEW.user_id, NEW.exercise_id);
  IF v_streak IN (7, 30, 100, 365) THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'streak_' || v_streak, NEW.exercise_id, jsonb_build_object('days', v_streak), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  -- ── Comeback (≥7 days since last workout) ─────────────────────────────────
  IF v_before_amt = 0 THEN
    SELECT (v_today - MAX((performed_at AT TIME ZONE 'Europe/Berlin')::date))
    INTO v_days_off
    FROM workout_entries
    WHERE user_id = NEW.user_id AND exercise_id = NEW.exercise_id
      AND (performed_at AT TIME ZONE 'Europe/Berlin')::date < v_today;
    IF v_days_off IS NOT NULL AND v_days_off >= 7 THEN
      INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
      VALUES (NEW.user_id, 'comeback', NEW.exercise_id, jsonb_build_object('days_off', v_days_off), v_today)
      ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  -- ── Frühstarter: 100+ reps before 08:00 ───────────────────────────────────
  IF v_daily_total >= 100 AND v_before_amt < 100 AND v_berlin_hour < 8 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'quick_starter', NEW.exercise_id,
            jsonb_build_object('hour', v_berlin_hour, 'reps', v_daily_total), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  -- ── Nachteule: first entry between 00:00–05:00 ────────────────────────────
  IF v_berlin_hour < 5 AND v_before_amt = 0 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'night_owl', NEW.exercise_id, jsonb_build_object('hour', v_berlin_hour), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  -- ── Rank improved 5+ positions today ──────────────────────────────────────
  IF v_rank_before IS NOT NULL AND v_rank IS NOT NULL
     AND v_rank_before > v_rank AND (v_rank_before - v_rank) >= 5 THEN

    -- Find who was at this rank before — use canonical ordering (same as v_rank_before subquery)
    SELECT COALESCE(p.display_name, p.username)
    INTO v_overtaken_name
    FROM (
      SELECT user_id,
             ROW_NUMBER() OVER (ORDER BY day_total DESC, max_ts ASC)::int AS rnk
      FROM (
        SELECT user_id,
               SUM(amount)       AS day_total,
               MAX(performed_at) AS max_ts
        FROM workout_entries
        WHERE exercise_id = NEW.exercise_id
          AND (performed_at AT TIME ZONE 'Europe/Berlin')::date = v_today
          AND id != NEW.id
        GROUP BY user_id
      ) totals
    ) ranked
    JOIN profiles p ON p.id = ranked.user_id
    WHERE ranked.rnk = v_rank AND ranked.user_id != NEW.user_id
    LIMIT 1;

    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'rank_improved', NEW.exercise_id,
            jsonb_build_object(
              'old_rank',       v_rank_before,
              'new_rank',       v_rank,
              'improvement',    v_rank_before - v_rank,
              'overtaken_name', v_overtaken_name
            ), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL
    DO UPDATE SET metadata = CASE
      WHEN (feed_events.metadata->>'improvement')::int < (v_rank_before - v_rank)
      THEN jsonb_build_object(
             'old_rank',       v_rank_before,
             'new_rank',       v_rank,
             'improvement',    v_rank_before - v_rank,
             'overtaken_name', v_overtaken_name
           )
      ELSE feed_events.metadata
    END;
  END IF;

  -- ── Platz 1 today ─────────────────────────────────────────────────────────
  IF v_rank = 1 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'place1_new', NEW.exercise_id, jsonb_build_object('rank', 1), v_today)
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  -- ── Zum ersten Mal Top 3 (lifetime) ───────────────────────────────────────
  IF v_rank <= 3 AND NOT EXISTS (
    SELECT 1 FROM feed_events
    WHERE user_id = NEW.user_id AND event_type = 'top3_first' AND exercise_id = NEW.exercise_id
  ) THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'top3_first', NEW.exercise_id, jsonb_build_object('rank', v_rank), v_today)
    ON CONFLICT (user_id, exercise_id, event_type)
      WHERE event_type IN ('top10_first','top3_first','first_500_day','first_1000_day')
    DO UPDATE SET event_date = LEAST(EXCLUDED.event_date, feed_events.event_date);
  END IF;

  -- ── Zum ersten Mal Top 10 (lifetime) ──────────────────────────────────────
  IF v_rank <= 10 AND NOT EXISTS (
    SELECT 1 FROM feed_events
    WHERE user_id = NEW.user_id AND event_type = 'top10_first' AND exercise_id = NEW.exercise_id
  ) THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date)
    VALUES (NEW.user_id, 'top10_first', NEW.exercise_id, jsonb_build_object('rank', v_rank), v_today)
    ON CONFLICT (user_id, exercise_id, event_type)
      WHERE event_type IN ('top10_first','top3_first','first_500_day','first_1000_day')
    DO UPDATE SET event_date = LEAST(EXCLUDED.event_date, feed_events.event_date);
  END IF;

  RETURN NEW;
END;
$$;


-- ── 2. get_friend_leaderboard: tiebreaker_at = today's MAX ────────────────────
-- Was: MAX(performed_at) across all time → wrong tiebreaker for "today" sort
-- Now: MAX(performed_at) for today only → correct "first to reach" tiebreaker

CREATE OR REPLACE FUNCTION public.get_friend_leaderboard(p_exercise uuid)
RETURNS TABLE(
  user_id              uuid,
  username             citext,
  display_name         text,
  avatar_url           text,
  today_amount         bigint,
  total_amount         bigint,
  level                integer,
  current_streak       integer,
  rest_days_remaining  integer,
  is_me                boolean,
  tiebreaker_at        timestamp with time zone
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH friend_ids AS (
    SELECT auth.uid() AS uid
    UNION
    SELECT friend_id FROM public.friendships WHERE user_id = auth.uid()
  ),
  berlin_now AS (
    SELECT
      (NOW() AT TIME ZONE 'Europe/Berlin')::date AS today,
      date_trunc('week', (NOW() AT TIME ZONE 'Europe/Berlin')::date)::date AS week_start
  ),
  -- tiebreaker = when you first reached your current today score
  -- = MAX(performed_at for today) — same logic as get_global_daily_leaderboard
  today_tiebreaker AS (
    SELECT
      w.user_id,
      MAX(w.performed_at) AS tiebreaker_at
    FROM public.workout_entries w
    JOIN berlin_now bn ON true
    WHERE w.exercise_id = p_exercise
      AND (w.performed_at AT TIME ZONE 'Europe/Berlin')::date = bn.today
    GROUP BY w.user_id
  )
  SELECT
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    COALESCE((
      SELECT SUM(w.amount) FROM public.workout_entries w
      WHERE w.user_id = p.id AND w.exercise_id = p_exercise
        AND (w.performed_at AT TIME ZONE 'Europe/Berlin')::date = bn.today
    ), 0)::bigint AS today_amount,
    COALESCE((
      SELECT SUM(w.amount) FROM public.workout_entries w
      WHERE w.user_id = p.id AND w.exercise_id = p_exercise
    ), 0)::bigint AS total_amount,
    public.compute_level(COALESCE((
      SELECT SUM(w.amount)::int FROM public.workout_entries w
      WHERE w.user_id = p.id AND w.exercise_id = p_exercise
    ), 0)) AS level,
    public.compute_streak(p.id, p_exercise) AS current_streak,
    GREATEST(0,
      2 - GREATEST(0,
        (bn.today - COALESCE(
          (SELECT MIN((w.performed_at AT TIME ZONE 'Europe/Berlin')::date)
           FROM public.workout_entries w
           WHERE w.user_id = p.id AND w.exercise_id = p_exercise
             AND (w.performed_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN bn.week_start AND bn.today),
          bn.today + 1
        ))
        - COALESCE((
            SELECT COUNT(DISTINCT (w.performed_at AT TIME ZONE 'Europe/Berlin')::date)
            FROM public.workout_entries w
            WHERE w.user_id = p.id AND w.exercise_id = p_exercise
              AND (w.performed_at AT TIME ZONE 'Europe/Berlin')::date BETWEEN bn.week_start AND bn.today
          ), 0)
      )
    )::integer AS rest_days_remaining,
    (p.id = auth.uid()) AS is_me,
    -- NULL for users with no today entries; frontend filters them out in today-sort view
    tt.tiebreaker_at
  FROM public.profiles p
  JOIN berlin_now bn ON true
  LEFT JOIN today_tiebreaker tt ON tt.user_id = p.id
  WHERE auth.uid() IS NOT NULL
    AND p.id IN (SELECT uid FROM friend_ids)
    AND EXISTS (
      SELECT 1 FROM public.exercise_enrollments ee
      WHERE ee.user_id = p.id AND ee.exercise_id = p_exercise AND ee.status = 'enrolled'
    )
  ORDER BY total_amount DESC, tt.tiebreaker_at ASC NULLS LAST;
$$;


-- ── 3. get_all_active_today: add tiebreaker to ORDER BY ───────────────────────
-- Was: ORDER BY today_amount DESC (equal scores → arbitrary order)
-- Now: ORDER BY today_amount DESC, MAX(performed_at) ASC (canonical tiebreaker)

CREATE OR REPLACE FUNCTION public.get_all_active_today(p_exercise uuid)
RETURNS TABLE(
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  today_amount integer,
  is_me        boolean,
  is_friend    boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date;
BEGIN
  v_today := (NOW() AT TIME ZONE 'Europe/Berlin')::date;
  RETURN QUERY
  SELECT
    p.id                                        AS user_id,
    p.username::text,
    p.display_name::text,
    p.avatar_url::text,
    COALESCE(SUM(w.amount), 0)::integer         AS today_amount,
    (p.id = auth.uid())                         AS is_me,
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.user_id = auth.uid() AND f.friend_id = p.id
    )                                           AS is_friend
  FROM public.profiles p
  JOIN public.workout_entries w
    ON w.user_id = p.id
   AND w.exercise_id = p_exercise
   AND (w.performed_at AT TIME ZONE 'Europe/Berlin')::date = v_today
  GROUP BY p.id, p.username, p.display_name, p.avatar_url
  HAVING COALESCE(SUM(w.amount), 0) > 0
  ORDER BY today_amount DESC, MAX(w.performed_at) ASC;
END;
$$;
