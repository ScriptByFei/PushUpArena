-- Migration: challenge_fullday
-- ─────────────────────────────────────────────────────────────────────────────
-- Die Daily Live Challenge läuft von 00:00 bis 24:00 Berliner Zeit.
-- Vorher: Challenge war erst ab 05:00 "aktiv". Das führte dazu, dass die
-- Dashboard-Karte nach dem automatischen Tageswechsel-Refresh um Mitternacht
-- verschwand und bis 05:00 unsichtbar blieb (is_active = false).
--
-- Betroffene Funktionen:
--   1. get_daily_challenge_status  → is_active immer TRUE; starts_at = 00:00
--   2. join_daily_challenge        → 05:00-Sperre entfernt; nur 16:20-Deadline
--   3. log_challenge_set           → 05:00-Sperre entfernt
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. get_daily_challenge_status ────────────────────────────────────────────
-- is_active = TRUE den gesamten Tag; starts_at = 00:00 Berliner Zeit.

CREATE OR REPLACE FUNCTION public.get_daily_challenge_status(p_exercise_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_berlin_now               timestamp;
  v_berlin_time              time;
  v_berlin_date              date;
  v_join_deadline            time    := '16:20:00';
  v_challenge_date           date;
  v_starts_at                timestamptz;
  v_ends_at                  timestamptz;
  v_has_joined               boolean;
  v_secs_end                 integer;
  v_join_deadline_passed     boolean;
  v_secs_until_join_deadline integer;
BEGIN
  v_berlin_now   := now() AT TIME ZONE 'Europe/Berlin';
  v_berlin_time  := v_berlin_now::time;
  v_berlin_date  := v_berlin_now::date;

  v_challenge_date := v_berlin_date;

  -- Challenge läuft von 00:00 bis 24:00 (= nächster Tag 00:00)
  v_starts_at := (v_berlin_date || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Berlin';
  v_ends_at   := ((v_berlin_date + 1) || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Berlin';

  -- Countdown bis Mitternacht
  v_secs_end := GREATEST(0, EXTRACT(EPOCH FROM (v_ends_at - now()))::integer);

  -- Anmeldung bis 16:20 Uhr
  v_join_deadline_passed := v_berlin_time >= v_join_deadline;
  v_secs_until_join_deadline := EXTRACT(EPOCH FROM (
    (v_berlin_date || ' 16:20:00')::timestamp AT TIME ZONE 'Europe/Berlin' - now()
  ))::integer;

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
    'is_active',                    TRUE,          -- ganztägig aktiv
    'challenge_date',               v_challenge_date,
    'starts_at',                    v_starts_at,
    'ends_at',                      v_ends_at,
    'has_joined',                   v_has_joined,
    'server_now',                   now(),
    'seconds_until_start',          0,             -- bereits gestartet
    'seconds_until_end',            v_secs_end,
    'join_deadline_passed',         v_join_deadline_passed,
    'seconds_until_join_deadline',  v_secs_until_join_deadline
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_status(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_challenge_status(uuid) TO authenticated;


-- ── 2. join_daily_challenge ───────────────────────────────────────────────────
-- 05:00-Sperre entfernt. Beitritt ist von 00:00 bis 16:20 Uhr möglich.

DROP FUNCTION IF EXISTS public.join_daily_challenge(uuid);

CREATE FUNCTION public.join_daily_challenge(
  p_exercise_id uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id        uuid    := auth.uid();
  v_berlin_time    time;
  v_join_deadline  time    := '16:20:00';
  v_challenge_date date;
  v_part_id        uuid;
  v_imported_total integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  v_berlin_time    := (now() AT TIME ZONE 'Europe/Berlin')::time;
  v_challenge_date := (now() AT TIME ZONE 'Europe/Berlin')::date;

  -- Kein Zeitfenster-Check mehr: Challenge läuft 00:00–24:00.
  -- Nur die 16:20-Anmeldeschluss-Prüfung.

  -- Übung validieren
  IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = p_exercise_id) THEN
    RETURN jsonb_build_object('error', 'INVALID_EXERCISE');
  END IF;

  -- Anmeldeschluss 16:20 Uhr
  IF v_berlin_time >= v_join_deadline THEN
    RETURN jsonb_build_object('error', 'JOIN_DEADLINE_PASSED');
  END IF;

  -- Bereits teilgenommen?
  SELECT id INTO v_part_id
  FROM daily_challenge_participations
  WHERE user_id      = v_user_id
    AND exercise_id  = p_exercise_id
    AND challenge_date = v_challenge_date;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status',           'ALREADY_JOINED',
      'participation_id', v_part_id,
      'imported_amount',  0
    );
  END IF;

  -- Teilnahme anlegen
  INSERT INTO daily_challenge_participations
    (user_id, exercise_id, challenge_date, joined_at, imported_amount)
  VALUES
    (v_user_id, p_exercise_id, v_challenge_date, now(), 0)
  RETURNING id INTO v_part_id;

  -- Heutige workout_entries als individuelle verknüpfte Einträge importieren.
  -- Trigger feuert nur für NEW inserts → bestehende Einträge manuell verknüpfen.
  WITH inserted AS (
    INSERT INTO daily_challenge_entries (
      participation_id, user_id, exercise_id,
      challenge_date, repetitions, created_at,
      edit_until, is_imported, workout_entry_id
    )
    SELECT
      v_part_id, we.user_id, we.exercise_id,
      v_challenge_date, we.amount, we.created_at,
      NULL, FALSE, we.id
    FROM workout_entries we
    WHERE we.user_id     = v_user_id
      AND we.exercise_id = p_exercise_id
      AND (we.created_at AT TIME ZONE 'Europe/Berlin')::date = v_challenge_date
    ON CONFLICT (workout_entry_id) WHERE workout_entry_id IS NOT NULL DO NOTHING
    RETURNING repetitions
  )
  SELECT COALESCE(SUM(repetitions), 0)::integer INTO v_imported_total FROM inserted;

  UPDATE daily_challenge_participations
  SET imported_amount = v_imported_total
  WHERE id = v_part_id;

  RETURN jsonb_build_object(
    'status',           'JOINED',
    'participation_id', v_part_id,
    'imported_amount',  v_imported_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_daily_challenge(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_daily_challenge(uuid) TO authenticated;


-- ── 3. log_challenge_set ─────────────────────────────────────────────────────
-- 05:00-Sperre entfernt. Sätze sind ganztägig einzutragen.
-- Hinweis: Diese Funktion wird derzeit nicht direkt vom Frontend gerufen
-- (Sätze kommen via workout_entries → Trigger). Das Update ist prophylaktisch.

DROP FUNCTION IF EXISTS public.log_challenge_set(uuid, integer, uuid);

CREATE FUNCTION public.log_challenge_set(
  p_exercise_id      uuid,
  p_repetitions      integer,
  p_workout_entry_id uuid DEFAULT NULL
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
  v_edit_until      timestamptz;
  v_total           integer;
  v_set_count       integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF p_repetitions IS NULL OR p_repetitions != FLOOR(p_repetitions)
      OR p_repetitions < 10 OR p_repetitions > 100 THEN
    RETURN jsonb_build_object(
      'error',   'INVALID_REPETITIONS',
      'message', 'Repetitions must be a whole number between 10 and 100'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = p_exercise_id) THEN
    RETURN jsonb_build_object('error', 'INVALID_EXERCISE');
  END IF;

  v_berlin_time    := (now() AT TIME ZONE 'Europe/Berlin')::time;
  v_challenge_date := (now() AT TIME ZONE 'Europe/Berlin')::date;

  -- Kein 05:00-Check mehr: Sätze sind ganztägig erlaubt.

  SELECT * INTO v_participation
  FROM daily_challenge_participations
  WHERE user_id      = v_user_id
    AND exercise_id  = p_exercise_id
    AND challenge_date = v_challenge_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'NOT_JOINED');
  END IF;

  -- 30-Sekunden-Cooldown — Import-Einträge (is_imported=TRUE) ausschließen.
  SELECT created_at INTO v_last_entry_at
  FROM daily_challenge_entries
  WHERE participation_id = v_participation.id
    AND is_imported = FALSE
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

  -- Sicherheitscheck: workout_entry_id muss dem User gehören
  IF p_workout_entry_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM workout_entries
      WHERE id = p_workout_entry_id AND user_id = v_user_id
    ) THEN
      p_workout_entry_id := NULL;
    END IF;
  END IF;

  v_edit_until := now() + INTERVAL '30 minutes';

  INSERT INTO daily_challenge_entries (
    participation_id, user_id, exercise_id,
    challenge_date, repetitions, created_at, edit_until,
    is_imported, workout_entry_id
  ) VALUES (
    v_participation.id, v_user_id, p_exercise_id,
    v_challenge_date, p_repetitions, now(), v_edit_until,
    FALSE,
    p_workout_entry_id
  )
  RETURNING id INTO v_entry_id;

  SELECT
    SUM(repetitions)::integer,
    COUNT(*)::integer
  INTO v_total, v_set_count
  FROM daily_challenge_entries
  WHERE participation_id = v_participation.id;

  RETURN jsonb_build_object(
    'status',            'OK',
    'entry_id',          v_entry_id,
    'edit_until',        v_edit_until,
    'total_repetitions', v_total,
    'set_count',         v_set_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_challenge_set(uuid, integer, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.log_challenge_set(uuid, integer, uuid) TO authenticated;
