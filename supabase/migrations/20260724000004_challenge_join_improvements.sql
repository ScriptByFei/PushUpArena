-- ============================================================
-- Challenge-Beitritt: Teilnahmefenster bis 16:20 + Auto-Import
-- ============================================================
--
-- Neue Regeln:
--   • Beitritt nur bis 16:20 Uhr (Berliner Zeit); danach geschlossen.
--   • Beim Beitritt werden alle heute bereits absolvierten
--     workout_entries automatisch als Import-Eintrag übernommen.
--     Startwert = aktueller Tagesstand → kein Vorteil für Frühstarter.
--   • Import-Einträge (is_imported = TRUE) sind READ-ONLY:
--     - delete_challenge_set verweigert Löschen
--     - update_challenge_set verweigert Bearbeiten
--     - log_challenge_set schließt sie vom Cooldown-Check aus
--   • Keine Doppelzählung: Import = Snapshot vor Beitritt.
--     Alle danach eingetragenen Dashboard-Sätze (onLogged) erzeugen
--     separate challenge_entries mit eigenem workout_entry_id-Link.
--
-- Neue Spalten:
--   daily_challenge_participations.imported_amount  INTEGER DEFAULT 0
--   daily_challenge_entries.is_imported             BOOLEAN DEFAULT FALSE
--
-- Geänderte RPCs:
--   get_daily_challenge_status  → + join_deadline_passed, seconds_until_join_deadline
--   join_daily_challenge        → 16:20-Check + Import-Logik + imported_amount in Return
--   log_challenge_set           → Cooldown-Check überspringt is_imported=TRUE Einträge
--   get_my_challenge_sets       → + is_imported in Rückgabe
--   update_challenge_set        → verweigert is_imported=TRUE
--   delete_challenge_set        → verweigert is_imported=TRUE (+ workout_entry-Cleanup)
--
-- Zentrale Konstante:
--   '16:20:00'::time — Beitritts-Deadline in Berliner Zeit
-- ============================================================


-- ── 1. Schema-Änderungen ─────────────────────────────────────────────────────

ALTER TABLE public.daily_challenge_participations
  ADD COLUMN IF NOT EXISTS imported_amount integer NOT NULL DEFAULT 0;

ALTER TABLE public.daily_challenge_entries
  ADD COLUMN IF NOT EXISTS is_imported boolean NOT NULL DEFAULT FALSE;


-- ── 2. get_daily_challenge_status — Beitrittsfenster exponieren ──────────────
-- Neue Felder: join_deadline_passed, seconds_until_join_deadline
-- Da Rückgabetyp jsonb ist, reicht CREATE OR REPLACE.

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
  v_join_deadline            time    := '16:20:00';   -- zentrale Konstante
  v_is_active                boolean;
  v_challenge_date           date;
  v_starts_at                timestamptz;
  v_ends_at                  timestamptz;
  v_has_joined               boolean;
  v_secs_start               integer;
  v_secs_end                 integer;
  v_join_deadline_passed     boolean;
  v_secs_until_join_deadline integer;
BEGIN
  v_berlin_now   := now() AT TIME ZONE 'Europe/Berlin';
  v_berlin_time  := v_berlin_now::time;
  v_berlin_date  := v_berlin_now::date;

  v_is_active      := v_berlin_time >= '05:00:00'::time;
  v_challenge_date := v_berlin_date;

  v_starts_at := (v_berlin_date || ' 05:00:00')::timestamp AT TIME ZONE 'Europe/Berlin';
  v_ends_at   := ((v_berlin_date + 1) || ' 00:00:00')::timestamp AT TIME ZONE 'Europe/Berlin';

  v_secs_start := GREATEST(0, EXTRACT(EPOCH FROM (v_starts_at - now()))::integer);
  v_secs_end   := GREATEST(0, EXTRACT(EPOCH FROM (v_ends_at   - now()))::integer);

  -- Beitritts-Deadline: ab 16:20 Uhr geschlossen (inklusiv)
  v_join_deadline_passed := v_berlin_time >= v_join_deadline;

  -- Sekunden bis 16:20 (negativ wenn bereits abgelaufen)
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
    'is_active',                    v_is_active,
    'challenge_date',               v_challenge_date,
    'starts_at',                    v_starts_at,
    'ends_at',                      v_ends_at,
    'has_joined',                   v_has_joined,
    'server_now',                   now(),
    'seconds_until_start',          v_secs_start,
    'seconds_until_end',            v_secs_end,
    'join_deadline_passed',         v_join_deadline_passed,
    'seconds_until_join_deadline',  v_secs_until_join_deadline
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_status(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_challenge_status(uuid) TO authenticated;


-- ── 3. join_daily_challenge — 16:20-Check + Auto-Import ─────────────────────

DROP FUNCTION IF EXISTS public.join_daily_challenge(uuid);

CREATE FUNCTION public.join_daily_challenge(p_exercise_id uuid)
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
  v_join_deadline  time    := '16:20:00';   -- zentrale Konstante
  v_part_id        uuid;
  v_imported       integer := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = p_exercise_id) THEN
    RETURN jsonb_build_object('error', 'INVALID_EXERCISE');
  END IF;

  v_berlin_time    := (now() AT TIME ZONE 'Europe/Berlin')::time;
  v_challenge_date := (now() AT TIME ZONE 'Europe/Berlin')::date;

  IF v_berlin_time < '05:00:00'::time THEN
    RETURN jsonb_build_object('error', 'CHALLENGE_NOT_ACTIVE');
  END IF;

  -- Beitritts-Deadline: ab 16:20 Uhr geschlossen
  IF v_berlin_time >= v_join_deadline THEN
    RETURN jsonb_build_object('error', 'JOIN_DEADLINE_PASSED');
  END IF;

  -- Upsert — ON CONFLICT ist noop bei Doppelaufruf
  INSERT INTO daily_challenge_participations
    (user_id, exercise_id, challenge_date, joined_at, created_at)
  VALUES
    (v_user_id, p_exercise_id, v_challenge_date, now(), now())
  ON CONFLICT (user_id, exercise_id, challenge_date) DO NOTHING
  RETURNING id INTO v_part_id;

  IF v_part_id IS NULL THEN
    -- Bereits beigetreten — imported_amount zurückgeben
    SELECT id, imported_amount
    INTO v_part_id, v_imported
    FROM daily_challenge_participations
    WHERE user_id      = v_user_id
      AND exercise_id  = p_exercise_id
      AND challenge_date = v_challenge_date;

    RETURN jsonb_build_object(
      'status',           'ALREADY_JOINED',
      'participation_id', v_part_id,
      'imported_amount',  v_imported
    );
  END IF;

  -- Neu beigetreten: alle heute bereits absolvierten Wdh. übernehmen.
  -- Verwendet created_at statt performed_at (= Serverzeit des Eintrags,
  -- resistent gegen backdating-Manipulation durch den Client).
  SELECT COALESCE(SUM(amount), 0)::integer
  INTO v_imported
  FROM workout_entries
  WHERE user_id     = v_user_id
    AND exercise_id = p_exercise_id
    AND (created_at AT TIME ZONE 'Europe/Berlin')::date = v_challenge_date;

  IF v_imported > 0 THEN
    -- Import-Eintrag: repräsentiert den Tagesstand vor Beitritt.
    --   is_imported = TRUE  → READ-ONLY, kein Edit/Delete erlaubt
    --   edit_until  = NULL  → dauerhaft gesperrt (wie alter Eintrag)
    --   workout_entry_id = NULL → ist ein Aggregat, kein 1:1-Link
    --   repetitions kann jede positive Zahl sein (kein 10-100-Limit hier)
    INSERT INTO daily_challenge_entries (
      participation_id, user_id, exercise_id,
      challenge_date, repetitions, created_at,
      edit_until, is_imported, workout_entry_id
    ) VALUES (
      v_part_id, v_user_id, p_exercise_id,
      v_challenge_date, v_imported, now(),
      NULL,   -- kein Bearbeitungsfenster
      TRUE,
      NULL
    );

    UPDATE daily_challenge_participations
    SET imported_amount = v_imported
    WHERE id = v_part_id;
  END IF;

  RETURN jsonb_build_object(
    'status',           'JOINED',
    'participation_id', v_part_id,
    'imported_amount',  v_imported
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.join_daily_challenge(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.join_daily_challenge(uuid) TO authenticated;


-- ── 4. log_challenge_set — Cooldown überspringt Import-Einträge ─────────────
-- Import-Einträge (is_imported=TRUE) dürfen den 30s-Cooldown nicht auslösen:
-- Der User soll sofort nach dem Beitritt einen echten Satz eintragen können.

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

  -- 30-Sekunden-Cooldown — Import-Einträge (is_imported=TRUE) ausschließen,
  -- damit der User direkt nach dem Beitritt einen echten Satz eintragen kann.
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


-- ── 5. get_my_challenge_sets — is_imported in Rückgabe ───────────────────────
-- Return-Typ ändert sich → DROP nötig

DROP FUNCTION IF EXISTS public.get_my_challenge_sets(uuid, date);

CREATE FUNCTION public.get_my_challenge_sets(
  p_exercise_id uuid,
  p_date        date DEFAULT NULL
)
RETURNS TABLE (
  id          uuid,
  repetitions integer,
  created_at  timestamptz,
  edit_until  timestamptz,
  is_imported boolean
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
  SELECT
    e.id, e.repetitions, e.created_at, e.edit_until, e.is_imported
  FROM daily_challenge_entries e
  WHERE e.user_id        = v_user_id
    AND e.exercise_id    = p_exercise_id
    AND e.challenge_date = v_challenge_date
  ORDER BY e.is_imported DESC, e.created_at DESC;
  -- Import-Eintrag zuerst (is_imported=TRUE→DESC), dann neueste echte Sätze
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_challenge_sets(uuid, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_challenge_sets(uuid, date) TO authenticated;


-- ── 6. update_challenge_set — verweigert is_imported=TRUE ────────────────────

CREATE OR REPLACE FUNCTION public.update_challenge_set(
  p_entry_id    uuid,
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
  v_challenge_date  date;
  v_entry           public.daily_challenge_entries%ROWTYPE;
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

  v_challenge_date := (now() AT TIME ZONE 'Europe/Berlin')::date;

  SELECT * INTO v_entry
  FROM daily_challenge_entries
  WHERE id           = p_entry_id
    AND user_id      = v_user_id
    AND challenge_date = v_challenge_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ENTRY_NOT_FOUND');
  END IF;

  -- Import-Einträge sind READ-ONLY
  IF v_entry.is_imported THEN
    RETURN jsonb_build_object(
      'error',   'EDIT_WINDOW_EXPIRED',
      'message', 'Importierte Einträge können nicht bearbeitet werden.'
    );
  END IF;

  IF v_entry.edit_until IS NULL OR now() > v_entry.edit_until THEN
    RETURN jsonb_build_object(
      'error',   'EDIT_WINDOW_EXPIRED',
      'message', 'Das Bearbeitungsfenster für diesen Satz ist abgelaufen.'
    );
  END IF;

  UPDATE daily_challenge_entries
  SET repetitions = p_repetitions
  WHERE id = p_entry_id;

  SELECT
    SUM(repetitions)::integer,
    COUNT(*)::integer
  INTO v_total, v_set_count
  FROM daily_challenge_entries
  WHERE participation_id = v_entry.participation_id;

  RETURN jsonb_build_object(
    'status',            'OK',
    'entry_id',          p_entry_id,
    'total_repetitions', v_total,
    'set_count',         v_set_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_challenge_set(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_challenge_set(uuid, integer) TO authenticated;


-- ── 7. delete_challenge_set — verweigert is_imported=TRUE + workout_entry cleanup
-- Kombiniert is_imported-Check mit der workout_entry-Bereinigung aus
-- 20260724_fix_challenge_delete_sync.sql

DROP FUNCTION IF EXISTS public.delete_challenge_set(uuid);

CREATE FUNCTION public.delete_challenge_set(p_entry_id uuid)
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

  SELECT * INTO v_entry
  FROM daily_challenge_entries
  WHERE id           = p_entry_id
    AND user_id      = v_user_id
    AND challenge_date = v_challenge_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ENTRY_NOT_FOUND');
  END IF;

  -- Import-Einträge sind READ-ONLY (können nicht gelöscht werden)
  IF v_entry.is_imported THEN
    RETURN jsonb_build_object(
      'error',   'EDIT_WINDOW_EXPIRED',
      'message', 'Importierte Einträge können nicht gelöscht werden.'
    );
  END IF;

  IF v_entry.edit_until IS NULL OR now() > v_entry.edit_until THEN
    RETURN jsonb_build_object(
      'error',   'EDIT_WINDOW_EXPIRED',
      'message', 'Das Bearbeitungsfenster für diesen Satz ist abgelaufen.'
    );
  END IF;

  v_participation_id := v_entry.participation_id;

  DELETE FROM daily_challenge_entries WHERE id = p_entry_id;

  -- Verknüpften workout_entry atomisch löschen wenn vorhanden
  -- (nur für nicht-importierte Einträge erreichbar, s.o.)
  IF v_entry.workout_entry_id IS NOT NULL THEN
    DELETE FROM workout_entries
    WHERE id      = v_entry.workout_entry_id
      AND user_id = v_user_id;
  END IF;

  SELECT
    COALESCE(SUM(repetitions), 0)::integer,
    COUNT(*)::integer
  INTO v_total, v_set_count
  FROM daily_challenge_entries
  WHERE participation_id = v_participation_id;

  RETURN jsonb_build_object(
    'status',                'OK',
    'entry_id',              p_entry_id,
    'total_repetitions',     v_total,
    'set_count',             v_set_count,
    'workout_entry_deleted', v_entry.workout_entry_id IS NOT NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_challenge_set(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_challenge_set(uuid) TO authenticated;
