-- Migration: daily_live_auto_participation
-- ─────────────────────────────────────────────────────────────────────────────
-- "Daily Live Challenge" → "Daily Live": Teilnahme-Logik vollständig entfernt.
-- Jeder Nutzer (jede Zeile in public.profiles) ist ab 00:00 Uhr automatisch im
-- Daily Live, ohne Anmeldung. daily_challenge_participations bleibt als
-- internes Bookkeeping bestehen (FK-Ziel von daily_challenge_entries), wird
-- aber nirgendwo mehr als Sichtbarkeits-Gate verwendet — alle nutzerbezogenen
-- Abfragen basieren jetzt auf public.profiles.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Trigger: Teilnahme-Zeile automatisch anlegen statt zu verlangen ────────

CREATE OR REPLACE FUNCTION sync_challenge_entry_from_workout()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_part_id     uuid;
  v_berlin_date date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_berlin_date := (OLD.created_at AT TIME ZONE 'Europe/Berlin')::date;
  ELSE
    v_berlin_date := (NEW.created_at AT TIME ZONE 'Europe/Berlin')::date;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Teilnahme-Zeile automatisch anlegen (oder bestehende verwenden) —
    -- kein expliziter Beitritt mehr nötig, jeder Nutzer nimmt automatisch teil.
    INSERT INTO daily_challenge_participations (user_id, exercise_id, challenge_date, joined_at)
    VALUES (NEW.user_id, NEW.exercise_id, v_berlin_date, now())
    ON CONFLICT (user_id, exercise_id, challenge_date) DO NOTHING;

    SELECT id INTO v_part_id
    FROM daily_challenge_participations
    WHERE user_id      = NEW.user_id
      AND exercise_id  = NEW.exercise_id
      AND challenge_date = v_berlin_date;

    INSERT INTO daily_challenge_entries (
      participation_id, user_id, exercise_id,
      challenge_date, repetitions, created_at,
      edit_until, is_imported, workout_entry_id
    ) VALUES (
      v_part_id, NEW.user_id, NEW.exercise_id,
      v_berlin_date, NEW.amount, now(),
      NULL, FALSE, NEW.id
    )
    ON CONFLICT (workout_entry_id) WHERE workout_entry_id IS NOT NULL DO NOTHING;

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.amount IS DISTINCT FROM NEW.amount THEN
      UPDATE daily_challenge_entries
      SET repetitions = NEW.amount
      WHERE workout_entry_id = NEW.id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM daily_challenge_entries WHERE workout_entry_id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


-- ── 2. join_daily_challenge entfernen ─────────────────────────────────────────

DROP FUNCTION IF EXISTS public.join_daily_challenge(uuid);


-- ── 3. get_daily_challenge_leaderboard: Basis = alle Profile, nicht Teilnahmen ─
-- DROP nötig: Rückgabetyp ändert sich (Spalte joined_at entfällt), CREATE OR
-- REPLACE erlaubt keine Änderung des OUT-Parameter-Zeilentyps.

DROP FUNCTION IF EXISTS public.get_daily_challenge_leaderboard(uuid, date);

CREATE FUNCTION public.get_daily_challenge_leaderboard(
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
  WITH
  running_totals AS (
    SELECT
      user_id,
      created_at,
      SUM(repetitions) OVER (
        PARTITION BY user_id
        ORDER BY created_at ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cumulative_reps
    FROM daily_challenge_entries
    WHERE exercise_id    = p_exercise_id
      AND challenge_date = v_challenge_date
      AND is_flagged     = false
  ),
  entries_agg AS (
    SELECT
      user_id,
      SUM(repetitions)::integer          AS total_repetitions,
      COUNT(*)::integer                  AS set_count,
      MAX(repetitions)                   AS max_set,
      MIN(repetitions)                   AS min_set,
      ROUND(AVG(repetitions), 2)         AS average_set,
      MIN(created_at)                    AS first_set_at,
      MAX(created_at)                    AS last_set_at
    FROM daily_challenge_entries
    WHERE exercise_id    = p_exercise_id
      AND challenge_date = v_challenge_date
      AND is_flagged     = false
    GROUP BY user_id
  ),
  total_reached_at AS (
    SELECT DISTINCT ON (rt.user_id)
      rt.user_id,
      rt.created_at AS reached_at
    FROM running_totals rt
    JOIN entries_agg a ON a.user_id = rt.user_id
    WHERE rt.cumulative_reps >= a.total_repetitions
    ORDER BY rt.user_id, rt.created_at ASC
  )
  SELECT
    pr.id,
    COALESCE(pr.display_name, pr.username, 'Unbekannt')  AS display_name,
    pr.avatar_url,
    COALESCE(a.total_repetitions, 0)                     AS total_repetitions,
    COALESCE(a.set_count, 0)                             AS set_count,
    a.max_set,
    a.min_set,
    a.average_set,
    a.first_set_at,
    a.last_set_at,
    RANK() OVER (
      ORDER BY
        COALESCE(a.total_repetitions, 0)                   DESC,
        COALESCE(tr.reached_at, 'infinity'::timestamptz)    ASC,
        pr.id                                               ASC
    )                                                    AS rank,
    pr.id = auth.uid()                                   AS is_me
  FROM public.profiles pr
  LEFT JOIN entries_agg       a  ON a.user_id  = pr.id
  LEFT JOIN total_reached_at  tr ON tr.user_id = pr.id
  ORDER BY rank, pr.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_leaderboard(uuid, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_challenge_leaderboard(uuid, date) TO authenticated;


-- ── 4. finalize_challenge_day: gleiche Umstellung auf public.profiles ─────────

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
  IF p_date >= (now() AT TIME ZONE 'Europe/Berlin')::date THEN
    RETURN;
  END IF;

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
  WITH
  running_totals AS (
    SELECT
      e.user_id,
      e.created_at,
      SUM(e.repetitions) OVER (
        PARTITION BY e.user_id
        ORDER BY e.created_at ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cumulative_reps
    FROM daily_challenge_entries e
    WHERE e.exercise_id    = p_exercise_id
      AND e.challenge_date = p_date
      AND e.is_flagged     = false
  ),
  entries_agg AS (
    SELECT
      e.user_id,
      SUM(e.repetitions)::integer          AS total_repetitions,
      COUNT(*)::integer                    AS set_count,
      MAX(e.repetitions)                   AS max_set,
      MIN(e.repetitions)                   AS min_set,
      ROUND(AVG(e.repetitions), 2)         AS avg_set,
      MIN(e.created_at)                    AS first_set_at,
      MAX(e.created_at)                    AS last_set_at
    FROM daily_challenge_entries e
    WHERE e.exercise_id    = p_exercise_id
      AND e.challenge_date = p_date
      AND e.is_flagged     = false
    GROUP BY e.user_id
  ),
  total_reached_at AS (
    SELECT DISTINCT ON (rt.user_id)
      rt.user_id,
      rt.created_at AS reached_at
    FROM running_totals rt
    JOIN entries_agg a ON a.user_id = rt.user_id
    WHERE rt.cumulative_reps >= a.total_repetitions
    ORDER BY rt.user_id, rt.created_at ASC
  ),
  participant_count_cte AS (
    SELECT COUNT(*)::integer AS cnt FROM public.profiles
  ),
  ranked AS (
    SELECT
      pr.id AS user_id,
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
          COALESCE(a.total_repetitions, 0)                                DESC,
          COALESCE(tr.reached_at, 'infinity'::timestamptz)                ASC,
          pr.id                                                           ASC
      )::integer AS rank
    FROM public.profiles pr
    LEFT JOIN entries_agg       a  ON a.user_id  = pr.id
    LEFT JOIN total_reached_at  tr ON tr.user_id = pr.id
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

REVOKE ALL     ON FUNCTION public.finalize_challenge_day(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_challenge_day(uuid, date) FROM anon, authenticated;


-- ── 5. get_daily_challenge_status: keine Anmeldung/Deadline mehr ──────────────

CREATE OR REPLACE FUNCTION public.get_daily_challenge_status(p_exercise_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_berlin_now     timestamp;
  v_berlin_date    date;
  v_challenge_date date;
  v_starts_at      timestamptz;
  v_ends_at        timestamptz;
  v_secs_end       integer;
BEGIN
  v_berlin_now   := now() AT TIME ZONE 'Europe/Berlin';
  v_berlin_date  := v_berlin_now::date;
  v_challenge_date := v_berlin_date;

  v_starts_at := (v_berlin_date || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Berlin';
  v_ends_at   := ((v_berlin_date + 1) || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Berlin';

  v_secs_end := GREATEST(0, EXTRACT(EPOCH FROM (v_ends_at - now()))::integer);

  RETURN jsonb_build_object(
    'is_active',           TRUE,
    'challenge_date',      v_challenge_date,
    'starts_at',           v_starts_at,
    'ends_at',             v_ends_at,
    'server_now',          now(),
    'seconds_until_start', 0,
    'seconds_until_end',   v_secs_end
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_status(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_challenge_status(uuid) TO authenticated;


-- ── 6. get_challenge_history: Lazy-Finalisierung ohne Teilnahme-Bezug ─────────

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
VOLATILE
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

  FOR v_past_date IN
    SELECT d::date
    FROM generate_series(v_today - p_limit, v_today - 1, interval '1 day') AS d
    WHERE NOT EXISTS (
      SELECT 1 FROM daily_challenge_results r
      WHERE r.exercise_id    = p_exercise_id
        AND r.challenge_date = d::date
      LIMIT 1
    )
    ORDER BY d DESC
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


-- ── 7. get_daily_challenge_day_details: NO_PARTICIPANTS-Gate entfernen ────────

CREATE OR REPLACE FUNCTION public.get_daily_challenge_day_details(
  p_exercise_id uuid,
  p_date        date
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid;
  v_today    date;
  v_result   jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  v_today := (now() AT TIME ZONE 'Europe/Berlin')::date;
  IF p_date >= v_today THEN
    RETURN jsonb_build_object('error', 'DAY_NOT_CLOSED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = p_exercise_id) THEN
    RETURN jsonb_build_object('error', 'INVALID_EXERCISE');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM daily_challenge_results
    WHERE exercise_id = p_exercise_id AND challenge_date = p_date
    LIMIT 1
  ) THEN
    PERFORM finalize_challenge_day(p_exercise_id, p_date);
  END IF;

  SELECT
    jsonb_build_object(
      'summary', jsonb_build_object(
        'challenge_date',           p_date,
        'participant_count',        MAX(r.participant_count),
        'total_repetitions',        SUM(r.total_repetitions)::integer,
        'total_sets',               SUM(r.set_count)::integer,
        'max_set',                  MAX(r.max_set),
        'winner_user_id',
          (ARRAY_AGG(r.user_id            ORDER BY r.rank, r.user_id))[1],
        'winner_display_name',
          (ARRAY_AGG(r.display_name       ORDER BY r.rank, r.user_id))[1],
        'winner_avatar_url',
          (ARRAY_AGG(r.avatar_url         ORDER BY r.rank, r.user_id))[1],
        'winner_total_repetitions',
          (ARRAY_AGG(r.total_repetitions  ORDER BY r.rank, r.user_id))[1]
      ),
      'leaderboard', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'rank',              r.rank,
            'user_id',           r.user_id,
            'display_name',      r.display_name,
            'avatar_url',        r.avatar_url,
            'total_repetitions', r.total_repetitions,
            'set_count',         r.set_count,
            'max_set',           r.max_set,
            'min_set',           r.min_set,
            'avg_set',           r.avg_set,
            'first_set_at',      r.first_set_at,
            'last_set_at',       r.last_set_at,
            'is_me',             (r.user_id = v_user_id)
          )
          ORDER BY r.rank, r.user_id
        ),
        '[]'::jsonb
      )
    )
  INTO v_result
  FROM daily_challenge_results r
  WHERE r.exercise_id    = p_exercise_id
    AND r.challenge_date = p_date;

  RETURN COALESCE(v_result, jsonb_build_object('error', 'NOT_FOUND'));
END;
$$;

REVOKE ALL      ON FUNCTION public.get_daily_challenge_day_details(uuid, date) FROM PUBLIC;
REVOKE EXECUTE  ON FUNCTION public.get_daily_challenge_day_details(uuid, date) FROM anon;
GRANT  EXECUTE  ON FUNCTION public.get_daily_challenge_day_details(uuid, date) TO authenticated;
