-- ============================================================
-- Fix: Challenge-Delete synchronisiert Dashboard nicht korrekt
--
-- Ursache 1 — REPLICA IDENTITY DEFAULT:
--   Ohne REPLICA IDENTITY FULL fehlen bei DELETE-Events im WAL die
--   alten Spaltenwerte. Supabase Realtime kann den Filter
--   `exercise_id=eq.${id}` bei DELETEs nicht auswerten →
--   der Dashboard-Hook bekommt kein DELETE-Event → Challenge-Karte
--   zeigt veraltete Werte.
--
-- Ursache 2 — kein Link zwischen workout_entries und daily_challenge_entries:
--   Wird ein Challenge-Satz gelöscht, bleibt der verknüpfte workout_entries-
--   Datensatz bestehen. get_my_stats gibt weiterhin den alten Wert zurück →
--   „Heute" bleibt stehen.
--
-- Fixes:
--   1. REPLICA IDENTITY FULL → DELETE-Events mit Filter korrekt zustellbar
--   2. workout_entry_id FK → atomisches Löschen beider Datensätze
--   3. log_challenge_set: optionaler Parameter p_workout_entry_id
--   4. delete_challenge_set: löscht auch workout_entry wenn verknüpft
-- ============================================================


-- ── 1. REPLICA IDENTITY FULL ──────────────────────────────────────────────
-- Ermöglicht Realtime DELETE-Events mit Filter-Evaluierung.

ALTER TABLE public.daily_challenge_entries REPLICA IDENTITY FULL;


-- ── 2. workout_entry_id Spalte ────────────────────────────────────────────
-- Link zum Dashboard-Eintrag. NULL = Challenge-only-Satz (direkt im Modal).
-- ON DELETE SET NULL: wenn workout_entry per Undo gelöscht wird,
--   bleibt der Challenge-Satz erhalten, wird aber entkoppelt.

ALTER TABLE public.daily_challenge_entries
  ADD COLUMN IF NOT EXISTS workout_entry_id uuid
    REFERENCES public.workout_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dce_workout_entry_id
  ON public.daily_challenge_entries (workout_entry_id)
  WHERE workout_entry_id IS NOT NULL;


-- ── 3. log_challenge_set — speichert optionale workout_entry_id ───────────

DROP FUNCTION IF EXISTS public.log_challenge_set(uuid, integer);

CREATE OR REPLACE FUNCTION public.log_challenge_set(
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

  IF v_berlin_time < '05:00:00'::time THEN
    RETURN jsonb_build_object('error', 'CHALLENGE_NOT_ACTIVE');
  END IF;

  SELECT * INTO v_participation
  FROM daily_challenge_participations
  WHERE user_id      = v_user_id
    AND exercise_id  = p_exercise_id
    AND challenge_date = v_challenge_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'NOT_JOINED');
  END IF;

  -- 30-Sekunden-Cooldown zwischen Sätzen
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

  -- Sicherheitscheck: workout_entry_id muss dem User gehören
  IF p_workout_entry_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM workout_entries
      WHERE id = p_workout_entry_id AND user_id = v_user_id
    ) THEN
      -- Unbekannte / fremde workout_entry_id → ignorieren, nicht ablehnen
      p_workout_entry_id := NULL;
    END IF;
  END IF;

  v_edit_until := now() + INTERVAL '30 minutes';

  INSERT INTO daily_challenge_entries (
    participation_id, user_id, exercise_id,
    challenge_date, repetitions, created_at, edit_until, workout_entry_id
  ) VALUES (
    v_participation.id, v_user_id, p_exercise_id,
    v_challenge_date, p_repetitions, now(), v_edit_until, p_workout_entry_id
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


-- ── 4. delete_challenge_set — löscht auch verknüpften workout_entry ───────

DROP FUNCTION IF EXISTS public.delete_challenge_set(uuid);

CREATE OR REPLACE FUNCTION public.delete_challenge_set(
  p_entry_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id          uuid;
  v_challenge_date   date;
  v_entry            public.daily_challenge_entries%ROWTYPE;
  v_participation_id uuid;
  v_total            integer;
  v_set_count        integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  v_challenge_date := (now() AT TIME ZONE 'Europe/Berlin')::date;

  -- Eintrag holen und sperren
  SELECT * INTO v_entry
  FROM daily_challenge_entries
  WHERE id           = p_entry_id
    AND user_id      = v_user_id
    AND challenge_date = v_challenge_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ENTRY_NOT_FOUND');
  END IF;

  -- Bearbeitungsfenster prüfen
  IF v_entry.edit_until IS NULL OR now() > v_entry.edit_until THEN
    RETURN jsonb_build_object(
      'error',   'EDIT_WINDOW_EXPIRED',
      'message', 'Das Bearbeitungsfenster für diesen Satz ist abgelaufen.'
    );
  END IF;

  v_participation_id := v_entry.participation_id;

  -- Challenge-Satz löschen
  DELETE FROM daily_challenge_entries WHERE id = p_entry_id;

  -- Verknüpften Workout-Eintrag löschen wenn vorhanden und sicher zuzuordnen.
  -- Sicherheitscheck: workout_entry muss dem User gehören (SECURITY DEFINER,
  -- daher explizit nochmals prüfen).
  IF v_entry.workout_entry_id IS NOT NULL THEN
    DELETE FROM workout_entries
    WHERE id      = v_entry.workout_entry_id
      AND user_id = v_user_id;
  END IF;

  -- Aktualisierte Challenge-Gesamtstatistik
  SELECT
    COALESCE(SUM(repetitions), 0)::integer,
    COUNT(*)::integer
  INTO v_total, v_set_count
  FROM daily_challenge_entries
  WHERE participation_id = v_participation_id;

  RETURN jsonb_build_object(
    'status',            'OK',
    'entry_id',          p_entry_id,
    'total_repetitions', v_total,
    'set_count',         v_set_count,
    'workout_entry_deleted', v_entry.workout_entry_id IS NOT NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_challenge_set(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_challenge_set(uuid) TO authenticated;
