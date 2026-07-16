-- Migration: Arena Feed V2
--   1. feed_events: priority / visibility / expires_at / target_user_id / group_key
--   2. live_activity table (realtime aggregate, replaces raw workout_entries realtime)
--   3. Data backfill: priority, visibility, expires_at, top10→top10_first, personal_record→daily_record
--   4. get_arena_feed RPC (N+1-frei, ersetzt get_feed_events)
--   5. maybe_create_workout_feed_events erweitert: priority/visibility/expires_at je Event,
--      live_activity upsert, milestone_20 friends-only, milestone_50, first_workout,
--      place1_new-Suppression für rank_improved

-- ── 1. Schema ──────────────────────────────────────────────────────────────────

ALTER TABLE public.feed_events
  ADD COLUMN IF NOT EXISTS priority      smallint    NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS visibility    text        NOT NULL DEFAULT 'global'
    CHECK (visibility IN ('global','friends','private')),
  ADD COLUMN IF NOT EXISTS expires_at    timestamptz,
  ADD COLUMN IF NOT EXISTS target_user_id uuid       REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS group_key     text
    GENERATED ALWAYS AS (user_id::text || '::' || COALESCE(exercise_id::text,'none') || '::' || event_date::text) STORED;

-- ── 2. Helper: canonical priority / visibility / TTL per event_type ───────────
-- Single source of truth for both the historical backfill below and the trigger.

CREATE OR REPLACE FUNCTION public.feed_event_priority(p_event_type text)
RETURNS smallint LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_event_type
    WHEN 'milestone_1000'       THEN 10
    WHEN 'first_1000_day'       THEN 10
    WHEN 'streak_365'           THEN 10
    WHEN 'total_100000'         THEN 10
    WHEN 'medal_gold'           THEN 9
    WHEN 'place1_new'           THEN 9
    WHEN 'milestone_500'        THEN 8
    WHEN 'first_500_day'        THEN 8
    WHEN 'streak_100'           THEN 8
    WHEN 'total_50000'          THEN 8
    WHEN 'medal_silver'         THEN 7
    WHEN 'daily_record'         THEN 7
    WHEN 'personal_record'      THEN 7
    WHEN 'top3_first'           THEN 7
    WHEN 'streak_30'            THEN 6
    WHEN 'comeback'             THEN 6
    WHEN 'total_25000'          THEN 6
    WHEN 'medal_bronze'         THEN 6
    WHEN 'milestone_250'        THEN 5
    WHEN 'milestone_100'        THEN 5
    WHEN 'total_10000'          THEN 5
    WHEN 'rank_improved'        THEN 5
    WHEN 'top10_first'          THEN 5
    WHEN 'streak_7'             THEN 4
    WHEN 'total_5000'           THEN 4
    WHEN 'total_1000'           THEN 4
    WHEN 'total_500'            THEN 4
    WHEN 'new_friend'           THEN 3
    WHEN 'friendship_confirmed' THEN 3
    WHEN 'milestone_50'         THEN 3
    WHEN 'first_workout'        THEN 3
    WHEN 'milestone_20'         THEN 2
    WHEN 'quick_starter'        THEN 2
    WHEN 'night_owl'            THEN 2
    ELSE 3
  END::smallint
$$;

CREATE OR REPLACE FUNCTION public.feed_event_visibility(p_event_type text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_event_type IN ('milestone_20','milestone_50','first_workout','new_friend','friendship_confirmed','friend_overtaken','night_owl','quick_starter') THEN 'friends'
    WHEN p_event_type IN ('streak_broken') THEN 'private'
    ELSE 'global'
  END
$$;

CREATE OR REPLACE FUNCTION public.feed_event_ttl(p_event_type text)
RETURNS interval LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_event_type IN ('milestone_20','milestone_50','first_workout','rank_improved','quick_starter','night_owl','comeback') THEN INTERVAL '1 day'
    WHEN p_event_type IN ('milestone_100','milestone_250','daily_record','place1_new','top3_first','top10_first','streak_7','total_1000','total_500') THEN INTERVAL '3 days'
    WHEN p_event_type IN ('medal_gold','medal_silver','medal_bronze','milestone_500','first_500_day','streak_30','total_5000','total_10000') THEN INTERVAL '7 days'
    WHEN p_event_type IN ('milestone_1000','first_1000_day','streak_100','streak_365','total_25000','total_50000','total_100000') THEN INTERVAL '14 days'
    ELSE INTERVAL '2 days'
  END
$$;

-- ── 3. Historical backfill ─────────────────────────────────────────────────────

UPDATE public.feed_events SET priority = public.feed_event_priority(event_type);

UPDATE public.feed_events SET visibility = public.feed_event_visibility(event_type);

UPDATE public.feed_events
SET expires_at = (event_date::timestamptz AT TIME ZONE 'Europe/Berlin') + public.feed_event_ttl(event_type)
WHERE expires_at IS NULL;

-- Alte top10-Events auf top10_first migrieren (falls kein top10_first für denselben user+exercise existiert)
INSERT INTO public.feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
SELECT user_id, 'top10_first', exercise_id, metadata, event_date,
       public.feed_event_priority('top10_first'), 'global',
       (event_date::timestamptz AT TIME ZONE 'Europe/Berlin') + public.feed_event_ttl('top10_first')
FROM public.feed_events
WHERE event_type = 'top10'
  AND NOT EXISTS (
    SELECT 1 FROM public.feed_events f2
    WHERE f2.user_id = feed_events.user_id
      AND f2.exercise_id = feed_events.exercise_id
      AND f2.event_type = 'top10_first'
  );

-- Alte top10-Events als veraltet markieren (nicht löschen, um Reaktionen zu erhalten)
UPDATE public.feed_events SET expires_at = NOW() - INTERVAL '1 second'
WHERE event_type = 'top10';

-- personal_record → daily_record umbenennen (falls kein daily_record für denselben user+exercise+date)
UPDATE public.feed_events SET event_type = 'daily_record'
WHERE event_type = 'personal_record'
  AND NOT EXISTS (
    SELECT 1 FROM public.feed_events f2
    WHERE f2.user_id = feed_events.user_id
      AND f2.exercise_id = feed_events.exercise_id
      AND f2.event_date = feed_events.event_date
      AND f2.event_type = 'daily_record'
  );

-- ── 4. live_activity ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.live_activity (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  exercise_id  uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  today_total  integer NOT NULL DEFAULT 0,
  last_delta   integer NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  event_date   date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Berlin')::date
);

ALTER TABLE public.live_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "live_activity_select_all" ON public.live_activity;
CREATE POLICY "live_activity_select_all" ON public.live_activity
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "live_activity_service_write" ON public.live_activity;
CREATE POLICY "live_activity_service_write" ON public.live_activity
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'live_activity'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_activity;
  END IF;
END $$;

-- ── 5. Indizes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_feed_events_expires ON public.feed_events (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_feed_events_visibility_priority ON public.feed_events (visibility, priority DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_events_group_key ON public.feed_events (group_key, priority DESC);
CREATE INDEX IF NOT EXISTS idx_workout_entries_exercise_date ON public.workout_entries (exercise_id, (performed_at AT TIME ZONE 'Europe/Berlin')::date, user_id, amount);

-- ── 6. get_arena_feed RPC ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_arena_feed(
  p_filter      text DEFAULT 'global',
  p_cursor      timestamptz DEFAULT NULL,
  p_limit       int DEFAULT 20,
  p_exercise_id uuid DEFAULT NULL
) RETURNS TABLE (
  id              uuid,
  user_id         uuid,
  display_name    text,
  username        text,
  avatar_url      text,
  event_type      text,
  exercise_id     uuid,
  exercise_name   text,
  exercise_unit   text,
  metadata        jsonb,
  priority        smallint,
  visibility      text,
  target_user_id  uuid,
  target_name     text,
  group_key       text,
  event_date      date,
  created_at      timestamptz,
  expires_at      timestamptz,
  reactions       jsonb
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH my_friends AS (
    SELECT friend_id FROM public.friendships WHERE user_id = auth.uid()
    UNION ALL SELECT auth.uid()
  ),
  visible AS (
    SELECT fe.*
    FROM public.feed_events fe
    WHERE
      (fe.expires_at IS NULL OR fe.expires_at > now())
      AND (p_cursor IS NULL OR fe.created_at < p_cursor)
      AND (p_exercise_id IS NULL OR fe.exercise_id = p_exercise_id OR fe.exercise_id IS NULL)
      AND CASE
        WHEN p_filter = 'global' THEN fe.visibility = 'global'
        WHEN p_filter = 'friends' THEN
          fe.visibility IN ('global','friends')
          AND fe.user_id IN (SELECT friend_id FROM my_friends)
        ELSE false
      END
    ORDER BY fe.priority DESC, fe.created_at DESC
    LIMIT LEAST(p_limit, 50)
  ),
  reactions_agg AS (
    SELECT
      fr.event_id,
      jsonb_object_agg(
        fr.reaction,
        jsonb_build_object(
          'count',   COUNT(*)::int,
          'reacted', bool_or(fr.user_id = auth.uid())
        )
      ) AS agg
    FROM public.feed_reactions fr
    WHERE fr.event_id IN (SELECT id FROM visible)
    GROUP BY fr.event_id
  )
  SELECT
    v.id,
    v.user_id,
    COALESCE(p.display_name, p.username::text),
    p.username::text,
    p.avatar_url,
    v.event_type,
    v.exercise_id,
    e.name,
    e.unit,
    v.metadata,
    v.priority,
    v.visibility,
    v.target_user_id,
    COALESCE(tp.display_name, tp.username::text),
    v.group_key,
    v.event_date,
    v.created_at,
    v.expires_at,
    COALESCE(ra.agg, '{}'::jsonb)
  FROM visible v
  JOIN public.profiles p ON p.id = v.user_id
  LEFT JOIN public.exercises e ON e.id = v.exercise_id
  LEFT JOIN public.profiles tp ON tp.id = v.target_user_id
  LEFT JOIN reactions_agg ra ON ra.event_id = v.id
  ORDER BY v.priority DESC, v.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_arena_feed(text, timestamptz, int, uuid) TO authenticated;

-- ── 7. Trigger erweitern ───────────────────────────────────────────────────────
-- Basiert auf 20260715_ranking_fairness.sql (aktuellster bekannter Stand).
-- Neu: priority/visibility/expires_at auf jedem INSERT, live_activity upsert,
--      milestone_50, first_workout, place1_new-Suppression für rank_improved.

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
  v_is_first_entry boolean;
  v_has_place1     boolean;
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

  v_is_first_entry := (v_all_total - NEW.amount) = 0;

  -- ── live_activity upsert ────────────────────────────────────────────────────
  INSERT INTO live_activity (user_id, exercise_id, today_total, last_delta, last_updated, event_date)
  VALUES (NEW.user_id, NEW.exercise_id, v_daily_total, NEW.amount, now(), v_today)
  ON CONFLICT (user_id) DO UPDATE SET
    exercise_id  = EXCLUDED.exercise_id,
    today_total  = CASE WHEN live_activity.event_date = EXCLUDED.event_date
                        THEN EXCLUDED.today_total ELSE EXCLUDED.today_total END,
    last_delta   = NEW.amount,
    last_updated = now(),
    event_date   = EXCLUDED.event_date;

  -- ── Canonical rank AFTER insert ────────────────────────────────────────────
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

  -- ── First-ever workout for this exercise ──────────────────────────────────
  IF v_is_first_entry THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'first_workout', NEW.exercise_id, jsonb_build_object('reps', NEW.amount), v_today,
            feed_event_priority('first_workout'), feed_event_visibility('first_workout'),
            now() + feed_event_ttl('first_workout'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  -- ── Daily milestones ───────────────────────────────────────────────────────
  IF v_daily_total >= 20 AND v_before_amt < 20 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'milestone_20', NEW.exercise_id, jsonb_build_object('today_total', v_daily_total), v_today,
            feed_event_priority('milestone_20'), feed_event_visibility('milestone_20'), now() + feed_event_ttl('milestone_20'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  IF v_daily_total >= 50 AND v_before_amt < 50 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'milestone_50', NEW.exercise_id, jsonb_build_object('today_total', v_daily_total), v_today,
            feed_event_priority('milestone_50'), feed_event_visibility('milestone_50'), now() + feed_event_ttl('milestone_50'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  IF v_daily_total >= 100 AND v_before_amt < 100 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'milestone_100', NEW.exercise_id, jsonb_build_object('today_total', v_daily_total), v_today,
            feed_event_priority('milestone_100'), feed_event_visibility('milestone_100'), now() + feed_event_ttl('milestone_100'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  IF v_daily_total >= 250 AND v_before_amt < 250 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'milestone_250', NEW.exercise_id, jsonb_build_object('today_total', v_daily_total), v_today,
            feed_event_priority('milestone_250'), feed_event_visibility('milestone_250'), now() + feed_event_ttl('milestone_250'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  IF v_daily_total >= 500 AND v_before_amt < 500 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'milestone_500', NEW.exercise_id, jsonb_build_object('today_total', v_daily_total), v_today,
            feed_event_priority('milestone_500'), feed_event_visibility('milestone_500'), now() + feed_event_ttl('milestone_500'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  IF v_daily_total >= 1000 AND v_before_amt < 1000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'milestone_1000', NEW.exercise_id, jsonb_build_object('today_total', v_daily_total), v_today,
            feed_event_priority('milestone_1000'), feed_event_visibility('milestone_1000'), now() + feed_event_ttl('milestone_1000'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  -- ── Personal daily record ──────────────────────────────────────────────────
  IF v_daily_total > v_prev_best AND v_prev_best > 0 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'daily_record', NEW.exercise_id,
            jsonb_build_object('reps', v_daily_total, 'prev_best', v_prev_best), v_today,
            feed_event_priority('daily_record'), feed_event_visibility('daily_record'), now() + feed_event_ttl('daily_record'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL
    DO UPDATE SET
      metadata   = jsonb_build_object('reps', v_daily_total, 'prev_best', (feed_events.metadata->>'prev_best')::int),
      expires_at = now() + feed_event_ttl('daily_record');
  END IF;

  -- ── First-ever 500-rep day ─────────────────────────────────────────────────
  IF v_daily_total >= 500 AND v_before_amt < 500 AND NOT EXISTS (
    SELECT 1 FROM feed_events
    WHERE user_id = NEW.user_id AND event_type = 'first_500_day' AND exercise_id = NEW.exercise_id
  ) THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'first_500_day', NEW.exercise_id, jsonb_build_object('reps', v_daily_total), v_today,
            feed_event_priority('first_500_day'), feed_event_visibility('first_500_day'), now() + feed_event_ttl('first_500_day'))
    ON CONFLICT (user_id, exercise_id, event_type) WHERE event_type IN ('top10_first','top3_first','first_500_day','first_1000_day') DO NOTHING;
  END IF;

  -- ── First-ever 1000-rep day ────────────────────────────────────────────────
  IF v_daily_total >= 1000 AND v_before_amt < 1000 AND NOT EXISTS (
    SELECT 1 FROM feed_events
    WHERE user_id = NEW.user_id AND event_type = 'first_1000_day' AND exercise_id = NEW.exercise_id
  ) THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'first_1000_day', NEW.exercise_id, jsonb_build_object('reps', v_daily_total), v_today,
            feed_event_priority('first_1000_day'), feed_event_visibility('first_1000_day'), now() + feed_event_ttl('first_1000_day'))
    ON CONFLICT (user_id, exercise_id, event_type) WHERE event_type IN ('top10_first','top3_first','first_500_day','first_1000_day') DO NOTHING;
  END IF;

  -- ── Cumulative total milestones ────────────────────────────────────────────
  IF v_all_total >= 1000 AND (v_all_total - NEW.amount) < 1000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'total_1000', NEW.exercise_id, jsonb_build_object('total', v_all_total), v_today,
            feed_event_priority('total_1000'), feed_event_visibility('total_1000'), now() + feed_event_ttl('total_1000'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;
  IF v_all_total >= 5000 AND (v_all_total - NEW.amount) < 5000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'total_5000', NEW.exercise_id, jsonb_build_object('total', v_all_total), v_today,
            feed_event_priority('total_5000'), feed_event_visibility('total_5000'), now() + feed_event_ttl('total_5000'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;
  IF v_all_total >= 10000 AND (v_all_total - NEW.amount) < 10000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'total_10000', NEW.exercise_id, jsonb_build_object('total', v_all_total), v_today,
            feed_event_priority('total_10000'), feed_event_visibility('total_10000'), now() + feed_event_ttl('total_10000'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;
  IF v_all_total >= 25000 AND (v_all_total - NEW.amount) < 25000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'total_25000', NEW.exercise_id, jsonb_build_object('total', v_all_total), v_today,
            feed_event_priority('total_25000'), feed_event_visibility('total_25000'), now() + feed_event_ttl('total_25000'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;
  IF v_all_total >= 50000 AND (v_all_total - NEW.amount) < 50000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'total_50000', NEW.exercise_id, jsonb_build_object('total', v_all_total), v_today,
            feed_event_priority('total_50000'), feed_event_visibility('total_50000'), now() + feed_event_ttl('total_50000'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;
  IF v_all_total >= 100000 AND (v_all_total - NEW.amount) < 100000 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'total_100000', NEW.exercise_id, jsonb_build_object('total', v_all_total), v_today,
            feed_event_priority('total_100000'), feed_event_visibility('total_100000'), now() + feed_event_ttl('total_100000'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  -- ── Streak milestones ──────────────────────────────────────────────────────
  v_streak := get_exercise_streak(NEW.user_id, NEW.exercise_id);
  IF v_streak IN (7, 30, 100, 365) THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'streak_' || v_streak, NEW.exercise_id, jsonb_build_object('days', v_streak), v_today,
            feed_event_priority('streak_' || v_streak), feed_event_visibility('streak_' || v_streak),
            now() + feed_event_ttl('streak_' || v_streak))
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
      INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
      VALUES (NEW.user_id, 'comeback', NEW.exercise_id, jsonb_build_object('days_off', v_days_off), v_today,
              feed_event_priority('comeback'), feed_event_visibility('comeback'), now() + feed_event_ttl('comeback'))
      ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
    END IF;
  END IF;

  -- ── Frühstarter: 100+ reps before 08:00 ───────────────────────────────────
  IF v_daily_total >= 100 AND v_before_amt < 100 AND v_berlin_hour < 8 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'quick_starter', NEW.exercise_id,
            jsonb_build_object('hour', v_berlin_hour, 'reps', v_daily_total), v_today,
            feed_event_priority('quick_starter'), feed_event_visibility('quick_starter'), now() + feed_event_ttl('quick_starter'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  -- ── Nachteule: first entry between 00:00–05:00 ────────────────────────────
  IF v_berlin_hour < 5 AND v_before_amt = 0 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'night_owl', NEW.exercise_id, jsonb_build_object('hour', v_berlin_hour), v_today,
            feed_event_priority('night_owl'), feed_event_visibility('night_owl'), now() + feed_event_ttl('night_owl'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  -- ── Rank improved 5+ positions today ──────────────────────────────────────
  -- Suppressed if this insert already produced place1_new for the same user+exercise+day
  -- (a fresh #1 headline is more informative than an incidental rank jump).
  v_has_place1 := (v_rank = 1);

  IF v_rank_before IS NOT NULL AND v_rank IS NOT NULL
     AND v_rank_before > v_rank AND (v_rank_before - v_rank) >= 5
     AND NOT v_has_place1 THEN

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

    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'rank_improved', NEW.exercise_id,
            jsonb_build_object(
              'old_rank',       v_rank_before,
              'new_rank',       v_rank,
              'improvement',    v_rank_before - v_rank,
              'overtaken_name', v_overtaken_name
            ), v_today,
            feed_event_priority('rank_improved'), feed_event_visibility('rank_improved'), now() + feed_event_ttl('rank_improved'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL
    DO UPDATE SET
      metadata = CASE
        WHEN (feed_events.metadata->>'improvement')::int < (v_rank_before - v_rank)
        THEN jsonb_build_object(
               'old_rank',       v_rank_before,
               'new_rank',       v_rank,
               'improvement',    v_rank_before - v_rank,
               'overtaken_name', v_overtaken_name
             )
        ELSE feed_events.metadata
      END,
      expires_at = now() + feed_event_ttl('rank_improved');
  END IF;

  -- ── Platz 1 today ─────────────────────────────────────────────────────────
  IF v_rank = 1 THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'place1_new', NEW.exercise_id, jsonb_build_object('rank', 1), v_today,
            feed_event_priority('place1_new'), feed_event_visibility('place1_new'), now() + feed_event_ttl('place1_new'))
    ON CONFLICT (user_id, event_type, exercise_id, event_date) WHERE exercise_id IS NOT NULL DO NOTHING;
  END IF;

  -- ── Zum ersten Mal Top 3 (lifetime) ───────────────────────────────────────
  IF v_rank <= 3 AND NOT EXISTS (
    SELECT 1 FROM feed_events
    WHERE user_id = NEW.user_id AND event_type = 'top3_first' AND exercise_id = NEW.exercise_id
  ) THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'top3_first', NEW.exercise_id, jsonb_build_object('rank', v_rank), v_today,
            feed_event_priority('top3_first'), feed_event_visibility('top3_first'), now() + feed_event_ttl('top3_first'))
    ON CONFLICT (user_id, exercise_id, event_type)
      WHERE event_type IN ('top10_first','top3_first','first_500_day','first_1000_day')
    DO UPDATE SET event_date = LEAST(EXCLUDED.event_date, feed_events.event_date);
  END IF;

  -- ── Zum ersten Mal Top 10 (lifetime) ──────────────────────────────────────
  IF v_rank <= 10 AND NOT EXISTS (
    SELECT 1 FROM feed_events
    WHERE user_id = NEW.user_id AND event_type = 'top10_first' AND exercise_id = NEW.exercise_id
  ) THEN
    INSERT INTO feed_events (user_id, event_type, exercise_id, metadata, event_date, priority, visibility, expires_at)
    VALUES (NEW.user_id, 'top10_first', NEW.exercise_id, jsonb_build_object('rank', v_rank), v_today,
            feed_event_priority('top10_first'), feed_event_visibility('top10_first'), now() + feed_event_ttl('top10_first'))
    ON CONFLICT (user_id, exercise_id, event_type)
      WHERE event_type IN ('top10_first','top3_first','first_500_day','first_1000_day')
    DO UPDATE SET event_date = LEAST(EXCLUDED.event_date, feed_events.event_date);
  END IF;

  RETURN NEW;
END;
$$;
