-- Migration: daily_live_history_cutover
-- ─────────────────────────────────────────────────────────────────────────────
-- BEFUND (verifiziert per read-only Datenabgleich gegen die Produktions-DB,
-- Summe von daily_challenge_results.total_repetitions je challenge_date
-- gegen die tatsächlichen workout_entries-Summen desselben Tages):
--
--   Datum        Frozen-Summe (daily_challenge_results)   Echte Summe (workout_entries)
--   2026-07-12…23        0                                  1000–2100 (komplett verloren)
--   2026-07-24          210                                  1513      (nur 1 Teilnehmer erfasst)
--   2026-07-25          380                                   875      (nur 3 Teilnehmer erfasst)
--   2026-07-26         1093                                  1093      ✓ exakt korrekt
--   2026-07-27          663                                   663      ✓ exakt korrekt
--   2026-07-28         1045                                  1045      ✓ exakt korrekt
--   2026-07-29         1331                                  1331      ✓ exakt korrekt
--
-- Ursache: daily_challenge_results wird von finalize_challenge_day EINMALIG
-- und für immer geschrieben (ON CONFLICT DO NOTHING, siehe Funktionskörper
-- unten) — welche Code-Version zum Zeitpunkt der (lazy, on-demand) Finalisierung
-- lief, bestimmt für immer den Inhalt der Zeile. Bis inkl. 25.07.2026 wurde
-- (je nach Zeitpunkt der ersten Abfrage) mit einer älteren Funktionsversion
-- finalisiert, die entweder aus der inzwischen verwaisten Spiegeltabelle
-- daily_challenge_entries las (leer/unvollständig für diese Tage) oder nur
-- Nutzer zählte, die der alten, mittlerweile abgeschafften
-- daily_challenge_participations-Teilnahme beigetreten waren. Seit der
-- Umstellung auf eine einzige Datenquelle (workout_entries direkt,
-- Migration 20260727000001_daily_live_single_source.sql) und die
-- automatische Teilnahme aller Profile (20260726000003_daily_live_auto_
-- participation.sql) stimmen die finalisierten Tage exakt — bestätigt durch
-- obigen Abgleich ab dem 26.07.2026.
--
-- FIX: get_challenge_history und get_daily_challenge_day_details blenden
-- Tage vor dem Cutover-Datum serverseitig aus. Bestehende Zeilen in
-- daily_challenge_results werden NICHT gelöscht oder verändert (auch nicht
-- die fehlerhaften vor dem Cutover) — nur der Lesepfad wird eingeschränkt.
-- Das hält den Fix reversibel und verändert keine Daten ab dem 26.07., wie
-- gefordert.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.daily_live_history_cutover_date()
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  -- Erster Tag mit verlässlicher Daily-Live-History (Europe/Berlin).
  -- Siehe Befund oben. Änderung hier wirkt sich sofort auf beide
  -- History-RPCs unten aus — an einer Stelle dokumentiert und gepflegt.
  SELECT '2026-07-26'::date
$$;

REVOKE ALL      ON FUNCTION public.daily_live_history_cutover_date() FROM PUBLIC;
GRANT  EXECUTE  ON FUNCTION public.daily_live_history_cutover_date() TO authenticated;

-- ── get_challenge_history: Cutover anwenden ────────────────────────────────

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
  v_cutover   date;
  v_past_date date;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  v_today   := (now() AT TIME ZONE 'Europe/Berlin')::date;
  v_cutover := public.daily_live_history_cutover_date();

  -- Nur Tage ab dem Cutover lazy finalisieren — Tage davor sollen ohnehin
  -- nie zurückgegeben werden, ein Finalisierungs-Versuch wäre sinnlos.
  FOR v_past_date IN
    SELECT d::date
    FROM generate_series(GREATEST(v_today - p_limit, v_cutover), v_today - 1, interval '1 day') AS d
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
  WHERE r.user_id        = v_user_id
    AND r.exercise_id    = p_exercise_id
    AND r.challenge_date < v_today
    AND r.challenge_date >= v_cutover
  ORDER BY r.challenge_date DESC
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_challenge_history(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_challenge_history(uuid, integer) TO authenticated;

-- ── get_daily_challenge_day_details: Cutover-Guard ergänzen ────────────────

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

  IF p_date < public.daily_live_history_cutover_date() THEN
    RETURN jsonb_build_object('error', 'DAY_NOT_AVAILABLE');
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
