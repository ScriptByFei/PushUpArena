-- ============================================================
-- Daily Challenge — Phase 1: Database Foundation
--
-- Tables:
--   daily_challenge_participations
--   daily_challenge_entries
--   daily_challenge_results         (snapshot for history integrity)
--
-- Internal RPCs:
--   finalize_challenge_day          (lazy snapshot, not exposed to client)
--
-- Client RPCs:
--   get_daily_challenge_status      (time context + join state)
--   join_daily_challenge            (confirm participation)
--   log_challenge_set               (record a set, fully server-validated)
--   get_daily_challenge_leaderboard (live ranking incl. 0-rep participants)
--   get_my_challenge_sets           (own sets for today or a given date)
--   get_challenge_history           (past days, snapshot-based)
--
-- Design notes:
--   - exercise_id uuid FK matches existing project convention (workout_entries,
--     exercise_enrollments, all RPCs use uuid for exercises)
--   - Timestamps: all server-generated (now()), no client time accepted
--   - Timezone: all checks use AT TIME ZONE 'Europe/Berlin'
--   - Challenge window: 05:00:00–23:59:59 Berlin time (00:00–04:59 is dead zone)
--   - History integrity: daily_challenge_results snapshots display_name + avatar_url
--     at finalization time; profile changes cannot alter historical records
--   - RLS: no direct INSERT/UPDATE/DELETE by clients; only via SECURITY DEFINER RPCs
--   - Parallel safety: log_challenge_set uses FOR UPDATE on participation row
--   - All RPCs: REVOKE from PUBLIC, GRANT only to authenticated
-- ============================================================


-- ──────────────────────────────────────────────────────────────────────────────
-- TABLE: daily_challenge_participations
-- One row per user per exercise per day when they confirm participation.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_challenge_participations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  exercise_id     uuid        NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  challenge_date  date        NOT NULL,
  joined_at       timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_dcp_user_exercise_date
    UNIQUE (user_id, exercise_id, challenge_date)
);

-- Lookup by user for their own history / status checks
CREATE INDEX IF NOT EXISTS idx_dcp_user_exercise_date
  ON public.daily_challenge_participations (user_id, exercise_id, challenge_date);

-- Lookup for leaderboard (all participants on a given day)
CREATE INDEX IF NOT EXISTS idx_dcp_exercise_date
  ON public.daily_challenge_participations (exercise_id, challenge_date);

ALTER TABLE public.daily_challenge_participations ENABLE ROW LEVEL SECURITY;

-- Users may read their own rows (for status / history UI)
CREATE POLICY "dcp_select_own"
  ON public.daily_challenge_participations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- For leaderboard: all authenticated users may read participations
CREATE POLICY "dcp_select_all_authenticated"
  ON public.daily_challenge_participations
  FOR SELECT TO authenticated
  USING (true);

-- No INSERT / UPDATE / DELETE policy → direct writes blocked for everyone
-- (Supabase anon + authenticated can't insert; only SECURITY DEFINER RPCs can)


-- ──────────────────────────────────────────────────────────────────────────────
-- TABLE: daily_challenge_entries
-- One row per logged set. Immutable once written.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_challenge_entries (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  participation_id uuid        NOT NULL
    REFERENCES public.daily_challenge_participations(id) ON DELETE CASCADE,
  user_id          uuid        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  exercise_id      uuid        NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  challenge_date   date        NOT NULL,
  repetitions      integer     NOT NULL
    CONSTRAINT dce_reps_min CHECK (repetitions >= 10)
    CONSTRAINT dce_reps_max CHECK (repetitions <= 100),
  created_at       timestamptz NOT NULL DEFAULT now(),
  is_flagged       boolean     NOT NULL DEFAULT false,
  flag_reason      text
);

-- Fast lookup of a participation's entries (cooldown check, aggregation)
CREATE INDEX IF NOT EXISTS idx_dce_participation_created
  ON public.daily_challenge_entries (participation_id, created_at DESC);

-- Leaderboard aggregation by day
CREATE INDEX IF NOT EXISTS idx_dce_exercise_date
  ON public.daily_challenge_entries (exercise_id, challenge_date);

-- User's own sets (get_my_challenge_sets)
CREATE INDEX IF NOT EXISTS idx_dce_user_exercise_date
  ON public.daily_challenge_entries (user_id, exercise_id, challenge_date, created_at DESC);

ALTER TABLE public.daily_challenge_entries ENABLE ROW LEVEL SECURITY;

-- All authenticated users may read entries (required for leaderboard)
CREATE POLICY "dce_select_all_authenticated"
  ON public.daily_challenge_entries
  FOR SELECT TO authenticated
  USING (true);

-- No INSERT / UPDATE / DELETE policy → direct writes blocked


-- ──────────────────────────────────────────────────────────────────────────────
-- TABLE: daily_challenge_results
-- Immutable snapshot created once a challenge day closes.
-- Stores display_name + avatar_url at snapshot time so profile changes
-- never retroactively alter historical leaderboard entries.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_challenge_results (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  exercise_id       uuid        NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  challenge_date    date        NOT NULL,
  rank              integer     NOT NULL,
  participant_count integer     NOT NULL,
  -- Profile snapshot (frozen at finalization time)
  display_name      text        NOT NULL,
  avatar_url        text,
  -- Aggregated stats
  total_repetitions integer     NOT NULL DEFAULT 0,
  set_count         integer     NOT NULL DEFAULT 0,
  max_set           integer,
  min_set           integer,
  avg_set           numeric(6, 2),
  first_set_at      timestamptz,
  last_set_at       timestamptz,
  finalized_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_dcr_user_exercise_date
    UNIQUE (user_id, exercise_id, challenge_date)
);

CREATE INDEX IF NOT EXISTS idx_dcr_user_exercise_date
  ON public.daily_challenge_results (user_id, exercise_id, challenge_date DESC);

ALTER TABLE public.daily_challenge_results ENABLE ROW LEVEL SECURITY;

-- Users may read their own historical results
CREATE POLICY "dcr_select_own"
  ON public.daily_challenge_results
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No INSERT / UPDATE / DELETE policy


-- ──────────────────────────────────────────────────────────────────────────────
-- INTERNAL: finalize_challenge_day
-- Called lazily by get_challenge_history for past unfinalized days.
-- Not exposed to authenticated users directly.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_challenge_day(
  p_exercise_id uuid,
  p_date        date
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: only finalize days that have fully closed
  IF p_date >= (now() AT TIME ZONE 'Europe/Berlin')::date THEN
    RETURN;
  END IF;

  -- Guard: already finalized (ON CONFLICT below also handles races, but skip early)
  IF EXISTS (
    SELECT 1 FROM daily_challenge_results
    WHERE exercise_id = p_exercise_id AND challenge_date = p_date
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  INSERT INTO daily_challenge_results (
    user_id, exercise_id, challenge_date,
    rank, participant_count,
    display_name, avatar_url,
    total_repetitions, set_count,
    max_set, min_set, avg_set,
    first_set_at, last_set_at,
    finalized_at
  )
  WITH entries_agg AS (
    SELECT
      e.participation_id,
      SUM(e.repetitions)::integer          AS total_repetitions,
      COUNT(*)::integer                    AS set_count,
      MAX(e.repetitions)                   AS max_set,
      MIN(e.repetitions)                   AS min_set,
      ROUND(AVG(e.repetitions), 2)         AS avg_set,
      MIN(e.created_at)                    AS first_set_at,
      MAX(e.created_at)                    AS last_set_at
    FROM daily_challenge_entries e
    WHERE e.exercise_id = p_exercise_id
      AND e.challenge_date = p_date
      AND e.is_flagged = false
    GROUP BY e.participation_id
  ),
  participant_count_cte AS (
    SELECT COUNT(*)::integer AS cnt
    FROM daily_challenge_participations
    WHERE exercise_id = p_exercise_id AND challenge_date = p_date
  ),
  ranked AS (
    SELECT
      p.user_id,
      -- Snapshot profile at finalization time
      COALESCE(pr.display_name, pr.username, 'Unbekannt') AS display_name,
      pr.avatar_url,
      COALESCE(a.total_repetitions, 0)     AS total_repetitions,
      COALESCE(a.set_count, 0)             AS set_count,
      a.max_set,
      a.min_set,
      a.avg_set,
      a.first_set_at,
      a.last_set_at,
      RANK() OVER (
        ORDER BY
          COALESCE(a.total_repetitions, 0) DESC,
          -- Tiebreaker 1: fewer sets needed is better (same total with fewer sets = bigger sets)
          COALESCE(a.set_count, 2147483647) ASC,
          -- Tiebreaker 2: reached total earlier
          a.last_set_at ASC NULLS LAST,
          -- Tiebreaker 3: joined earlier
          p.joined_at ASC,
          -- Tiebreaker 4: deterministic
          p.user_id ASC
      )::integer AS rank
    FROM daily_challenge_participations p
    JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN entries_agg a ON a.participation_id = p.id
    WHERE p.exercise_id = p_exercise_id
      AND p.challenge_date = p_date
  )
  SELECT
    r.user_id,
    p_exercise_id,
    p_date,
    r.rank,
    pc.cnt,
    r.display_name,
    r.avatar_url,
    r.total_repetitions,
    r.set_count,
    r.max_set,
    r.min_set,
    r.avg_set,
    r.first_set_at,
    r.last_set_at,
    now()
  FROM ranked r
  CROSS JOIN participant_count_cte pc
  ON CONFLICT (user_id, exercise_id, challenge_date) DO NOTHING;
END;
$$;

-- Internal only — Supabase pre-grants anon+authenticated on all new functions,
-- so we must explicitly revoke both PUBLIC and the individual roles.
REVOKE ALL      ON FUNCTION public.finalize_challenge_day(uuid, date) FROM PUBLIC;
REVOKE EXECUTE  ON FUNCTION public.finalize_challenge_day(uuid, date) FROM anon, authenticated;


-- ──────────────────────────────────────────────────────────────────────────────
-- RPC 1: get_daily_challenge_status
-- Returns time context + whether the calling user has joined today.
-- Safe to call unauthenticated (has_joined will be false).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_daily_challenge_status(p_exercise_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_berlin_now    timestamp;      -- local Berlin wall-clock time (no tz)
  v_berlin_time   time;
  v_berlin_date   date;
  v_is_active     boolean;
  v_challenge_date date;
  v_starts_at     timestamptz;
  v_ends_at       timestamptz;
  v_has_joined    boolean;
  v_secs_start    integer;
  v_secs_end      integer;
BEGIN
  -- All time reasoning in Berlin wall-clock
  v_berlin_now   := now() AT TIME ZONE 'Europe/Berlin';
  v_berlin_time  := v_berlin_now::time;
  v_berlin_date  := v_berlin_now::date;

  -- Active: 05:00:00 ≤ time ≤ 23:59:59 (00:00–04:59 is dead zone between days)
  v_is_active    := v_berlin_time >= '05:00:00'::time;
  v_challenge_date := v_berlin_date;

  -- starts_at = today 05:00 Berlin → converted to UTC timestamptz
  v_starts_at := (v_berlin_date || ' 05:00:00')::timestamp AT TIME ZONE 'Europe/Berlin';
  -- ends_at = tomorrow 00:00 Berlin
  v_ends_at   := ((v_berlin_date + 1) || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Berlin';

  -- Seconds until next boundary
  v_secs_start := GREATEST(0, EXTRACT(EPOCH FROM (v_starts_at - now()))::integer);
  v_secs_end   := GREATEST(0, EXTRACT(EPOCH FROM (v_ends_at   - now()))::integer);

  -- Has user joined today?
  v_has_joined := false;
  IF auth.uid() IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM daily_challenge_participations
      WHERE user_id      = auth.uid()
        AND exercise_id  = p_exercise_id
        AND challenge_date = v_challenge_date
    ) INTO v_has_joined;
  END IF;

  RETURN jsonb_build_object(
    'is_active',            v_is_active,
    'challenge_date',       v_challenge_date,
    'starts_at',            v_starts_at,
    'ends_at',              v_ends_at,
    'has_joined',           v_has_joined,
    'server_now',           now(),
    'seconds_until_start',  v_secs_start,
    'seconds_until_end',    v_secs_end
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_status(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_challenge_status(uuid) TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────────
-- RPC 2: join_daily_challenge
-- Confirms participation for today's challenge.
-- Idempotent: calling twice returns ALREADY_JOINED, not an error.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.join_daily_challenge(p_exercise_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid;
  v_berlin_time    time;
  v_challenge_date date;
  v_part_id        uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  -- Validate exercise
  IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = p_exercise_id) THEN
    RETURN jsonb_build_object('error', 'INVALID_EXERCISE');
  END IF;

  v_berlin_time    := (now() AT TIME ZONE 'Europe/Berlin')::time;
  v_challenge_date := (now() AT TIME ZONE 'Europe/Berlin')::date;

  -- Challenge window: 05:00 to 23:59:59 (midnight = dead zone)
  IF v_berlin_time < '05:00:00'::time THEN
    RETURN jsonb_build_object('error', 'CHALLENGE_NOT_ACTIVE');
  END IF;

  -- Upsert — UNIQUE constraint prevents double rows; ON CONFLICT returns cleanly
  INSERT INTO daily_challenge_participations
    (user_id, exercise_id, challenge_date, joined_at, created_at)
  VALUES
    (v_user_id, p_exercise_id, v_challenge_date, now(), now())
  ON CONFLICT (user_id, exercise_id, challenge_date) DO NOTHING
  RETURNING id INTO v_part_id;

  IF v_part_id IS NULL THEN
    -- Already existed
    SELECT id INTO v_part_id
    FROM daily_challenge_participations
    WHERE user_id      = v_user_id
      AND exercise_id  = p_exercise_id
      AND challenge_date = v_challenge_date;
    RETURN jsonb_build_object('status', 'ALREADY_JOINED', 'participation_id', v_part_id);
  END IF;

  RETURN jsonb_build_object('status', 'JOINED', 'participation_id', v_part_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_daily_challenge(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_daily_challenge(uuid) TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────────
-- RPC 3: log_challenge_set
-- Records a single set. All validation is server-side.
-- FOR UPDATE on participation row serialises concurrent requests (same user).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_challenge_set(
  p_exercise_id uuid,
  p_repetitions integer
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id         uuid;
  v_berlin_time     time;
  v_challenge_date  date;
  v_participation   public.daily_challenge_participations%ROWTYPE;
  v_last_entry_at   timestamptz;
  v_secs_since      numeric;
  v_entry_id        uuid;
  v_total           integer;
  v_set_count       integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  -- Validate repetitions (integers only — the CHECK constraint guards the DB,
  -- but we want a friendly error code before hitting the table)
  IF p_repetitions IS NULL OR p_repetitions != FLOOR(p_repetitions)
      OR p_repetitions < 10 OR p_repetitions > 100 THEN
    RETURN jsonb_build_object(
      'error',   'INVALID_REPETITIONS',
      'message', 'Repetitions must be a whole number between 10 and 100'
    );
  END IF;

  -- Validate exercise
  IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = p_exercise_id) THEN
    RETURN jsonb_build_object('error', 'INVALID_EXERCISE');
  END IF;

  v_berlin_time    := (now() AT TIME ZONE 'Europe/Berlin')::time;
  v_challenge_date := (now() AT TIME ZONE 'Europe/Berlin')::date;

  -- Challenge window check
  IF v_berlin_time < '05:00:00'::time THEN
    RETURN jsonb_build_object('error', 'CHALLENGE_NOT_ACTIVE');
  END IF;

  -- Acquire row-level lock on participation — serialises concurrent requests
  -- from the same user so that the cooldown check is race-free.
  SELECT * INTO v_participation
  FROM daily_challenge_participations
  WHERE user_id      = v_user_id
    AND exercise_id  = p_exercise_id
    AND challenge_date = v_challenge_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'NOT_JOINED');
  END IF;

  -- 30-second cooldown
  SELECT created_at INTO v_last_entry_at
  FROM daily_challenge_entries
  WHERE participation_id = v_participation.id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_entry_at IS NOT NULL THEN
    v_secs_since := EXTRACT(EPOCH FROM (now() - v_last_entry_at));
    IF v_secs_since < 30 THEN
      RETURN jsonb_build_object(
        'error',             'COOLDOWN_ACTIVE',
        'seconds_remaining', CEIL(30 - v_secs_since)::integer
      );
    END IF;
  END IF;

  -- All checks passed — insert the set
  INSERT INTO daily_challenge_entries (
    participation_id, user_id, exercise_id,
    challenge_date, repetitions, created_at
  ) VALUES (
    v_participation.id, v_user_id, p_exercise_id,
    v_challenge_date, p_repetitions, now()
  )
  RETURNING id INTO v_entry_id;

  -- Return updated totals
  SELECT
    SUM(repetitions)::integer,
    COUNT(*)::integer
  INTO v_total, v_set_count
  FROM daily_challenge_entries
  WHERE participation_id = v_participation.id;

  RETURN jsonb_build_object(
    'status',            'OK',
    'entry_id',          v_entry_id,
    'total_repetitions', v_total,
    'set_count',         v_set_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_challenge_set(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.log_challenge_set(uuid, integer) TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────────
-- RPC 4: get_daily_challenge_leaderboard
-- Live ranking. Includes participants with 0 sets (joined but not logged yet).
-- Sortierung:
--   1. total_repetitions DESC
--   2. set_count ASC        (same total with fewer sets = larger average set)
--   3. last_set_at ASC NULLS LAST (reached total earlier)
--   4. joined_at ASC
--   5. user_id ASC          (fully deterministic tiebreaker)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_daily_challenge_leaderboard(
  p_exercise_id uuid,
  p_date        date DEFAULT NULL
)
RETURNS TABLE (
  user_id            uuid,
  display_name       text,
  avatar_url         text,
  total_repetitions  integer,
  set_count          integer,
  max_set            integer,
  min_set            integer,
  average_set        numeric,
  first_set_at       timestamptz,
  last_set_at        timestamptz,
  joined_at          timestamptz,
  rank               bigint,
  is_me              boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge_date date;
BEGIN
  IF p_date IS NULL THEN
    v_challenge_date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  ELSE
    v_challenge_date := p_date;
  END IF;

  RETURN QUERY
  WITH entries_agg AS (
    SELECT
      e.participation_id,
      SUM(e.repetitions)::integer          AS total_repetitions,
      COUNT(*)::integer                    AS set_count,
      MAX(e.repetitions)                   AS max_set,
      MIN(e.repetitions)                   AS min_set,
      ROUND(AVG(e.repetitions), 2)         AS average_set,
      MIN(e.created_at)                    AS first_set_at,
      MAX(e.created_at)                    AS last_set_at
    FROM daily_challenge_entries e
    WHERE e.exercise_id   = p_exercise_id
      AND e.challenge_date = v_challenge_date
      AND e.is_flagged     = false
    GROUP BY e.participation_id
  )
  SELECT
    p.user_id,
    COALESCE(pr.display_name, pr.username, 'Unbekannt')  AS display_name,
    pr.avatar_url,
    COALESCE(a.total_repetitions, 0)                     AS total_repetitions,
    COALESCE(a.set_count, 0)                             AS set_count,
    a.max_set,
    a.min_set,
    a.average_set,
    a.first_set_at,
    a.last_set_at,
    p.joined_at,
    RANK() OVER (
      ORDER BY
        COALESCE(a.total_repetitions, 0)        DESC,
        COALESCE(a.set_count, 2147483647)       ASC,
        a.last_set_at                           ASC NULLS LAST,
        p.joined_at                             ASC,
        p.user_id                               ASC
    )                                                    AS rank,
    p.user_id = auth.uid()                               AS is_me
  FROM daily_challenge_participations p
  JOIN profiles pr ON pr.id = p.user_id
  LEFT JOIN entries_agg a ON a.participation_id = p.id
  WHERE p.exercise_id   = p_exercise_id
    AND p.challenge_date = v_challenge_date
  ORDER BY rank, p.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_leaderboard(uuid, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_challenge_leaderboard(uuid, date) TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────────
-- RPC 5: get_my_challenge_sets
-- Returns the calling user's own sets for the specified day (default = today).
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_challenge_sets(
  p_exercise_id uuid,
  p_date        date DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  repetitions  integer,
  created_at   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id        uuid;
  v_challenge_date date;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  IF p_date IS NULL THEN
    v_challenge_date := (now() AT TIME ZONE 'Europe/Berlin')::date;
  ELSE
    v_challenge_date := p_date;
  END IF;

  RETURN QUERY
  SELECT e.id, e.repetitions, e.created_at
  FROM daily_challenge_entries e
  WHERE e.user_id       = v_user_id
    AND e.exercise_id   = p_exercise_id
    AND e.challenge_date = v_challenge_date
  ORDER BY e.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_challenge_sets(uuid, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_challenge_sets(uuid, date) TO authenticated;


-- ──────────────────────────────────────────────────────────────────────────────
-- RPC 6: get_challenge_history
-- Returns past closed challenge days for the calling user.
-- Triggers lazy finalization for any past day not yet snapshotted.
-- Snapshot ensures historical display_name/avatar_url are frozen at
-- finalization time and immune to future profile edits.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_challenge_history(
  p_exercise_id uuid,
  p_limit       integer DEFAULT 14
)
RETURNS TABLE (
  challenge_date     date,
  rank               integer,
  participant_count  integer,
  display_name       text,
  avatar_url         text,
  total_repetitions  integer,
  set_count          integer,
  max_set            integer,
  min_set            integer,
  avg_set            numeric,
  first_set_at       timestamptz,
  last_set_at        timestamptz
)
LANGUAGE plpgsql
VOLATILE                  -- VOLATILE because finalize_challenge_day does DML
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_today     date;
  v_past_date date;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  v_today := (now() AT TIME ZONE 'Europe/Berlin')::date;

  -- Lazy finalization: for any past day where the user participated
  -- but no snapshot exists yet, compute and persist results now.
  FOR v_past_date IN
    SELECT p.challenge_date
    FROM daily_challenge_participations p
    WHERE p.user_id      = v_user_id
      AND p.exercise_id  = p_exercise_id
      AND p.challenge_date < v_today
      AND NOT EXISTS (
        SELECT 1 FROM daily_challenge_results r
        WHERE r.user_id      = v_user_id
          AND r.exercise_id  = p_exercise_id
          AND r.challenge_date = p.challenge_date
      )
    ORDER BY p.challenge_date DESC
    LIMIT p_limit
  LOOP
    PERFORM finalize_challenge_day(p_exercise_id, v_past_date);
  END LOOP;

  RETURN QUERY
  SELECT
    r.challenge_date,
    r.rank,
    r.participant_count,
    r.display_name,
    r.avatar_url,
    r.total_repetitions,
    r.set_count,
    r.max_set,
    r.min_set,
    r.avg_set,
    r.first_set_at,
    r.last_set_at
  FROM daily_challenge_results r
  WHERE r.user_id     = v_user_id
    AND r.exercise_id = p_exercise_id
    AND r.challenge_date < v_today
  ORDER BY r.challenge_date DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_challenge_history(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_challenge_history(uuid, integer) TO authenticated;
