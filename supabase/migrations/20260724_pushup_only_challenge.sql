-- Migration: pushup_only_challenge
-- ─────────────────────────────────────────────────────────────────────────────
-- Die Daily Live Challenge ist ausschließlich für Push-ups (slug = 'pushups').
-- Andere Übungen erhalten bei Bedarf später eigene Challenges mit separaten
-- Ranglisten. Architektur: is_challenge_enabled-Flag auf exercises → einfache
-- Erweiterung ohne Änderung bestehender Challenge-Logik.

-- ── 1. Spalte hinzufügen ──────────────────────────────────────────────────────

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS is_challenge_enabled boolean NOT NULL DEFAULT FALSE;

-- ── 2. Push-up als Challenge-Übung aktivieren ─────────────────────────────────

UPDATE exercises SET is_challenge_enabled = TRUE WHERE slug = 'pushups';

-- ── 3. join_daily_challenge: nur challenge-aktivierte Übungen erlaubt ─────────

DROP FUNCTION IF EXISTS join_daily_challenge(uuid);
CREATE FUNCTION join_daily_challenge(
  p_exercise_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Challenge aktiv? (05:00–00:00 Berliner Zeit)
  IF v_berlin_time < '05:00:00' THEN
    RETURN jsonb_build_object('error', 'CHALLENGE_NOT_ACTIVE');
  END IF;

  -- Übung existiert UND ist für Challenges freigeschaltet?
  IF NOT EXISTS (
    SELECT 1 FROM exercises WHERE id = p_exercise_id AND is_challenge_enabled = TRUE
  ) THEN
    RETURN jsonb_build_object('error', 'EXERCISE_NOT_IN_CHALLENGE');
  END IF;

  -- 16:20-Beitrittsdeadline
  IF v_berlin_time >= v_join_deadline THEN
    RETURN jsonb_build_object('error', 'JOIN_DEADLINE_PASSED');
  END IF;

  -- Bereits teilgenommen?
  SELECT id INTO v_part_id
  FROM daily_challenge_participations
  WHERE user_id = v_user_id AND exercise_id = p_exercise_id AND challenge_date = v_challenge_date;

  IF FOUND THEN
    RETURN jsonb_build_object('status', 'ALREADY_JOINED', 'participation_id', v_part_id, 'imported_amount', 0);
  END IF;

  -- Teilnahme anlegen
  INSERT INTO daily_challenge_participations (user_id, exercise_id, challenge_date, joined_at, imported_amount)
  VALUES (v_user_id, p_exercise_id, v_challenge_date, now(), 0)
  RETURNING id INTO v_part_id;

  -- Heutige workout_entries als individuelle verknüpfte Einträge importieren.
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

  -- Summe für Toast speichern
  UPDATE daily_challenge_participations SET imported_amount = v_imported_total WHERE id = v_part_id;

  RETURN jsonb_build_object('status', 'JOINED', 'participation_id', v_part_id, 'imported_amount', v_imported_total);
END;
$$;

GRANT EXECUTE ON FUNCTION join_daily_challenge(uuid) TO authenticated;
