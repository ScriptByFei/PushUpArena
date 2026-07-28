-- Migration: unify_challenge_with_workout_entries
-- ──────────────────────────────────────────────────────────────────────────────
-- Ziel: workout_entries sind die Single Source of Truth.
--   daily_challenge_entries wird automatisch per Trigger synchron gehalten.
--   Separate Challenge-Satzeingabe entfällt; Update/Delete arbeiten via
--   workout_entries so dass Dashboard, Aktivität und Challenge immer konsistent sind.

-- ── 1. Unique-Index für workout_entry_id (Idempotenz-Schutz für Trigger) ──────

CREATE UNIQUE INDEX IF NOT EXISTS ux_challenge_entries_workout_entry_id
  ON daily_challenge_entries(workout_entry_id)
  WHERE workout_entry_id IS NOT NULL;

-- ── 2. Trigger-Funktion ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_challenge_entry_from_workout()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_part_id     uuid;
  v_berlin_date date;
BEGIN
  -- Berlin-Datum aus server-kontrolliertem created_at bestimmen
  IF TG_OP = 'DELETE' THEN
    v_berlin_date := (OLD.created_at AT TIME ZONE 'Europe/Berlin')::date;
  ELSE
    v_berlin_date := (NEW.created_at AT TIME ZONE 'Europe/Berlin')::date;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Aktive Challenge-Teilnahme für diesen Nutzer/Übung/Tag prüfen
    SELECT id INTO v_part_id
    FROM daily_challenge_participations
    WHERE user_id      = NEW.user_id
      AND exercise_id  = NEW.exercise_id
      AND challenge_date = v_berlin_date;

    IF v_part_id IS NULL THEN RETURN NEW; END IF; -- nicht teilgenommen

    -- Verknüpften Challenge-Eintrag anlegen
    INSERT INTO daily_challenge_entries (
      participation_id, user_id, exercise_id,
      challenge_date, repetitions, created_at,
      edit_until, is_imported, workout_entry_id
    ) VALUES (
      v_part_id, NEW.user_id, NEW.exercise_id,
      v_berlin_date, NEW.amount, now(),
      NULL,   -- kein separates Bearbeitungsfenster mehr
      FALSE,  -- kein aggregierter Import-Eintrag
      NEW.id
    )
    ON CONFLICT (workout_entry_id) WHERE workout_entry_id IS NOT NULL DO NOTHING;

    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Wiederholungen aktualisieren wenn amount sich geändert hat
    IF OLD.amount IS DISTINCT FROM NEW.amount THEN
      UPDATE daily_challenge_entries
      SET repetitions = NEW.amount
      WHERE workout_entry_id = NEW.id;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- Verknüpften Challenge-Eintrag mitlöschen
    DELETE FROM daily_challenge_entries WHERE workout_entry_id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- ── 3. Trigger anlegen ────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_sync_challenge_entry ON workout_entries;
CREATE TRIGGER trg_sync_challenge_entry
  AFTER INSERT OR UPDATE OR DELETE ON workout_entries
  FOR EACH ROW EXECUTE FUNCTION sync_challenge_entry_from_workout();

-- ── 4. join_daily_challenge ───────────────────────────────────────────────────
-- Erstellt individuelle verknüpfte Einträge statt eines aggregierten Imports.
-- Der Trigger feuert nicht für bereits existierende workout_entries →
-- manuelles INSERT für heutige Einträge beim Beitritt.

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

  -- Übung validieren
  IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = p_exercise_id) THEN
    RETURN jsonb_build_object('error', 'INVALID_EXERCISE');
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

  -- Summe für Toast speichern
  UPDATE daily_challenge_participations SET imported_amount = v_imported_total WHERE id = v_part_id;

  RETURN jsonb_build_object('status', 'JOINED', 'participation_id', v_part_id, 'imported_amount', v_imported_total);
END;
$$;

-- ── 5. update_challenge_set ───────────────────────────────────────────────────
-- Aktualisiert das zugrundeliegende workout_entry; Trigger synct daily_challenge_entries.

CREATE OR REPLACE FUNCTION update_challenge_set(
  p_entry_id    uuid,
  p_repetitions integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id          uuid    := auth.uid();
  v_workout_entry_id uuid;
  v_is_imported      boolean;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error', 'UNAUTHENTICATED'); END IF;
  IF p_repetitions < 10 OR p_repetitions > 100 THEN RETURN jsonb_build_object('error', 'INVALID_REPETITIONS'); END IF;

  SELECT workout_entry_id, is_imported
  INTO v_workout_entry_id, v_is_imported
  FROM daily_challenge_entries
  WHERE id = p_entry_id AND user_id = v_user_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'ENTRY_NOT_FOUND'); END IF;
  -- is_imported-Einträge sind unveränderlich
  IF v_is_imported THEN RETURN jsonb_build_object('error', 'EDIT_WINDOW_EXPIRED'); END IF;

  IF v_workout_entry_id IS NOT NULL THEN
    -- Via workout_entries; Trigger synct daily_challenge_entries automatisch
    UPDATE workout_entries SET amount = p_repetitions WHERE id = v_workout_entry_id AND user_id = v_user_id;
  ELSE
    -- Direkter Fallback für alte Einträge ohne workout_entry_id
    UPDATE daily_challenge_entries SET repetitions = p_repetitions WHERE id = p_entry_id AND user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object('status', 'OK');
END;
$$;

-- ── 6. delete_challenge_set ───────────────────────────────────────────────────
-- Löscht das zugrundeliegende workout_entry; Trigger entfernt daily_challenge_entries.

DROP FUNCTION IF EXISTS delete_challenge_set(uuid);
CREATE FUNCTION delete_challenge_set(
  p_entry_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id          uuid    := auth.uid();
  v_workout_entry_id uuid;
  v_is_imported      boolean;
BEGIN
  IF v_user_id IS NULL THEN RETURN jsonb_build_object('error', 'UNAUTHENTICATED'); END IF;

  SELECT workout_entry_id, is_imported
  INTO v_workout_entry_id, v_is_imported
  FROM daily_challenge_entries
  WHERE id = p_entry_id AND user_id = v_user_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'ENTRY_NOT_FOUND'); END IF;
  -- is_imported-Einträge können nicht gelöscht werden
  IF v_is_imported THEN RETURN jsonb_build_object('error', 'EDIT_WINDOW_EXPIRED'); END IF;

  IF v_workout_entry_id IS NOT NULL THEN
    -- workout_entry löschen → Trigger löscht daily_challenge_entries automatisch
    DELETE FROM workout_entries WHERE id = v_workout_entry_id AND user_id = v_user_id;
  ELSE
    -- Direkter Fallback für alte Einträge ohne workout_entry_id
    DELETE FROM daily_challenge_entries WHERE id = p_entry_id AND user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object('status', 'OK');
END;
$$;

-- ── 7. Grants ──────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION sync_challenge_entry_from_workout() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION join_daily_challenge(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_challenge_set(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_challenge_set(uuid) TO authenticated;
