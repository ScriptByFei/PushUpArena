-- Phase 3G: historische Tages- und Teilnehmerdetails
--
-- Neue RPCs (rein lesend, SECURITY DEFINER):
--   get_daily_challenge_day_details      (Tageszusammenfassung + finale Rangliste)
--   get_daily_challenge_participant_sets  (historische Satzliste eines Teilnehmers)
--
-- Sicherheitsregeln:
--   - Nur abgeschlossene Tage (p_date < heute Berlin)
--   - SECURITY DEFINER → RLS umgangen (analog zu allen anderen DC-RPCs)
--   - Keine Schreiboperationen möglich
--   - REVOKE from PUBLIC, GRANT nur authenticated
--   - get_daily_challenge_participant_sets prüft, dass ein finalisierter
--     Snapshot-Eintrag für den Teilnehmer existiert → kein Zugriff auf
--     unfinalisierten oder manipulierten Daten


-- ──────────────────────────────────────────────────────────────────────────────
-- RPC 7: get_daily_challenge_day_details
-- Gibt die vollständige Tagesauswertung zurück:
--   summary: Teilnehmer, Gesamtwiederholungen, Sätze, Sieger
--   leaderboard: alle Teilnehmer mit Snapshot-Name, Snapshot-Avatar, finaler Rang
--
-- Löst bei Bedarf finalize_challenge_day aus (lazy, idempotent, analog zu
-- get_challenge_history). Gibt nur finalisierte Snapshot-Daten zurück.
-- ──────────────────────────────────────────────────────────────────────────────
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

  -- Nur vollständig abgeschlossene Tage
  v_today := (now() AT TIME ZONE 'Europe/Berlin')::date;
  IF p_date >= v_today THEN
    RETURN jsonb_build_object('error', 'DAY_NOT_CLOSED');
  END IF;

  -- Übung validieren
  IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = p_exercise_id) THEN
    RETURN jsonb_build_object('error', 'INVALID_EXERCISE');
  END IF;

  -- Lazy Finalisierung: Snapshot für diesen Tag erzeugen, falls noch nicht geschehen
  IF NOT EXISTS (
    SELECT 1 FROM daily_challenge_results
    WHERE exercise_id = p_exercise_id AND challenge_date = p_date
    LIMIT 1
  ) THEN
    -- Nur finalisieren, wenn es Teilnehmer gab
    IF NOT EXISTS (
      SELECT 1 FROM daily_challenge_participations
      WHERE exercise_id = p_exercise_id AND challenge_date = p_date
      LIMIT 1
    ) THEN
      RETURN jsonb_build_object('error', 'NO_PARTICIPANTS');
    END IF;
    PERFORM finalize_challenge_day(p_exercise_id, p_date);
  END IF;

  -- Tageszusammenfassung + vollständige Rangliste aufbauen
  SELECT
    jsonb_build_object(
      'summary', jsonb_build_object(
        'challenge_date',           p_date,
        'participant_count',        MAX(r.participant_count),
        'total_repetitions',        SUM(r.total_repetitions)::integer,
        'total_sets',               SUM(r.set_count)::integer,
        'max_set',                  MAX(r.max_set),
        -- Sieger = Rang 1 (bei Gleichstand deterministisch nach user_id)
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


-- ──────────────────────────────────────────────────────────────────────────────
-- RPC 8: get_daily_challenge_participant_sets
-- Gibt die chronologische Satzliste eines Teilnehmers für einen
-- abgeschlossenen Challenge-Tag zurück.
--
-- Sicherheitsregeln:
--   - Nur abgeschlossene Tage (p_date < heute Berlin)
--   - Finalisierter Ergebnissatz muss existieren → kein Zugriff auf
--     unfinalisierten oder teilweise finalisierten Daten
--   - Kein Schreibzugriff, keine Mutations
--   - is_flagged = false (nur gültige Sätze)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_daily_challenge_participant_sets(
  p_exercise_id uuid,
  p_date        date,
  p_user_id     uuid
)
RETURNS TABLE (
  entry_id    uuid,
  set_number  integer,
  repetitions integer,
  created_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_today     date;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN;
  END IF;

  -- Nur abgeschlossene Tage
  v_today := (now() AT TIME ZONE 'Europe/Berlin')::date;
  IF p_date >= v_today THEN
    RETURN;
  END IF;

  -- Übung validieren
  IF NOT EXISTS (SELECT 1 FROM exercises WHERE id = p_exercise_id) THEN
    RETURN;
  END IF;

  -- Sicherheitsprüfung: finalisierter Snapshot-Eintrag muss existieren.
  -- Verhindert Zugriff auf unfinalisierten oder nicht teilgenommenen Daten.
  IF NOT EXISTS (
    SELECT 1 FROM daily_challenge_results
    WHERE user_id       = p_user_id
      AND exercise_id   = p_exercise_id
      AND challenge_date = p_date
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id                                                  AS entry_id,
    ROW_NUMBER() OVER (ORDER BY e.created_at)::integer   AS set_number,
    e.repetitions,
    e.created_at
  FROM daily_challenge_entries e
  WHERE e.user_id       = p_user_id
    AND e.exercise_id   = p_exercise_id
    AND e.challenge_date = p_date
    AND e.is_flagged    = false
  ORDER BY e.created_at;
END;
$$;

REVOKE ALL      ON FUNCTION public.get_daily_challenge_participant_sets(uuid, date, uuid) FROM PUBLIC;
REVOKE EXECUTE  ON FUNCTION public.get_daily_challenge_participant_sets(uuid, date, uuid) FROM anon;
GRANT  EXECUTE  ON FUNCTION public.get_daily_challenge_participant_sets(uuid, date, uuid) TO authenticated;
