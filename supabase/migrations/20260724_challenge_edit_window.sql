-- ============================================================
-- Daily Challenge — Edit Window (Phase: Bearbeitungsfenster)
--
-- Änderungen:
--   1. daily_challenge_entries: neue Spalte edit_until TIMESTAMPTZ
--      Gesetzt auf created_at + 30 Minuten beim Eintragen.
--      NULL = alter Eintrag ohne Fenster → als gesperrt behandeln.
--
--   2. log_challenge_set (UPDATE): setzt edit_until beim INSERT.
--
--   3. get_my_challenge_sets (UPDATE): gibt edit_until zurück.
--
--   4. update_challenge_set (NEU): ändert Wiederholungszahl,
--      serverseitig geprüft ob noch im Fenster.
--
--   5. delete_challenge_set (NEU): löscht Satz,
--      serverseitig geprüft ob noch im Fenster.
--
-- Sicherheit:
--   - Alle Änderungen nur über SECURITY DEFINER RPCs.
--   - RLS: kein direktes UPDATE/DELETE auf daily_challenge_entries.
--   - Frontend-Sperren dienen nur der UX, nicht der Sicherheit.
--   - edit_until wird ausschließlich vom Server gesetzt.
--
-- Arena Feed:
--   - Challenge-Feed-Events (zukünftig) dürfen erst erstellt werden
--     nachdem edit_until abgelaufen ist (NOW() > edit_until).
--   - Diese Migration legt die Grundlage; Feed-Event-Integration folgt.
-- ============================================================


-- ── 1. Spalte hinzufügen ───────────────────────────────────────────────────

ALTER TABLE public.daily_challenge_entries
  ADD COLUMN IF NOT EXISTS edit_until timestamptz;

-- Bestehende Einträge: NULL belassen.
-- NULL = Bearbeitungsfenster abgelaufen (alter Eintrag vor diesem Feature).
-- RPCs behandeln NULL edit_until wie "Fenster bereits abgelaufen".

-- Index für schnellen Check ob Einträge noch bearbeitbar sind
-- (z. B. für künftige Feed-Event-Erstellung).
CREATE INDEX IF NOT EXISTS idx_dce_edit_until
  ON public.daily_challenge_entries (edit_until)
  WHERE edit_until IS NOT NULL;


-- ── 2. log_challenge_set — setzt edit_until beim INSERT ───────────────────

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

  -- Bearbeitungsfenster: 30 Minuten ab jetzt
  v_edit_until := now() + INTERVAL '30 minutes';

  INSERT INTO daily_challenge_entries (
    participation_id, user_id, exercise_id,
    challenge_date, repetitions, created_at, edit_until
  ) VALUES (
    v_participation.id, v_user_id, p_exercise_id,
    v_challenge_date, p_repetitions, now(), v_edit_until
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

REVOKE EXECUTE ON FUNCTION public.log_challenge_set(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.log_challenge_set(uuid, integer) TO authenticated;


-- ── 3. get_my_challenge_sets — gibt edit_until zurück ─────────────────────

CREATE OR REPLACE FUNCTION public.get_my_challenge_sets(
  p_exercise_id uuid,
  p_date        date DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  repetitions  integer,
  created_at   timestamptz,
  edit_until   timestamptz
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
  SELECT e.id, e.repetitions, e.created_at, e.edit_until
  FROM daily_challenge_entries e
  WHERE e.user_id       = v_user_id
    AND e.exercise_id   = p_exercise_id
    AND e.challenge_date = v_challenge_date
  ORDER BY e.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_challenge_sets(uuid, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_challenge_sets(uuid, date) TO authenticated;


-- ── 4. update_challenge_set — ändert Wiederholungszahl eines Satzes ───────
--
-- Sicherheitsregeln (alle serverseitig):
--   • Nur der Eigentümer darf seinen Satz bearbeiten.
--   • Nur wenn NOW() <= edit_until (30-Minuten-Fenster).
--   • Neue Wiederholungszahl muss 10–100 sein.
--   • Eintrag muss dem heutigen Berliner Datum gehören.
-- ──────────────────────────────────────────────────────────────────────────

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
  v_participation   public.daily_challenge_participations%ROWTYPE;
  v_total           integer;
  v_set_count       integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  -- Neue Wiederholungszahl validieren
  IF p_repetitions IS NULL OR p_repetitions != FLOOR(p_repetitions)
      OR p_repetitions < 10 OR p_repetitions > 100 THEN
    RETURN jsonb_build_object(
      'error',   'INVALID_REPETITIONS',
      'message', 'Repetitions must be a whole number between 10 and 100'
    );
  END IF;

  v_challenge_date := (now() AT TIME ZONE 'Europe/Berlin')::date;

  -- Eintrag holen und sperren (FOR UPDATE verhindert Race Conditions)
  SELECT * INTO v_entry
  FROM daily_challenge_entries
  WHERE id       = p_entry_id
    AND user_id  = v_user_id
    AND challenge_date = v_challenge_date
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'ENTRY_NOT_FOUND');
  END IF;

  -- Bearbeitungsfenster prüfen (NULL = alter Eintrag ohne Fenster = gesperrt)
  IF v_entry.edit_until IS NULL OR now() > v_entry.edit_until THEN
    RETURN jsonb_build_object(
      'error',   'EDIT_WINDOW_EXPIRED',
      'message', 'Das Bearbeitungsfenster für diesen Satz ist abgelaufen.'
    );
  END IF;

  -- Satz aktualisieren
  UPDATE daily_challenge_entries
  SET repetitions = p_repetitions
  WHERE id = p_entry_id;

  -- Aktualisierte Gesamtstatistik laden
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


-- ── 5. delete_challenge_set — löscht einen Satz innerhalb des Fensters ────
--
-- Sicherheitsregeln (alle serverseitig):
--   • Nur der Eigentümer darf seinen Satz löschen.
--   • Nur wenn NOW() <= edit_until.
--   • Eintrag muss dem heutigen Berliner Datum gehören.
-- ──────────────────────────────────────────────────────────────────────────

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
  v_user_id         uuid;
  v_challenge_date  date;
  v_entry           public.daily_challenge_entries%ROWTYPE;
  v_participation_id uuid;
  v_total           integer;
  v_set_count       integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHENTICATED');
  END IF;

  v_challenge_date := (now() AT TIME ZONE 'Europe/Berlin')::date;

  -- Eintrag holen und sperren
  SELECT * INTO v_entry
  FROM daily_challenge_entries
  WHERE id       = p_entry_id
    AND user_id  = v_user_id
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

  -- Satz löschen
  DELETE FROM daily_challenge_entries WHERE id = p_entry_id;

  -- Aktualisierte Gesamtstatistik laden
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
    'set_count',         v_set_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_challenge_set(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_challenge_set(uuid) TO authenticated;
