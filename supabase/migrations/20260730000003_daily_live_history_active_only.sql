-- Migration: daily_live_history_active_only
-- ─────────────────────────────────────────────────────────────────────────────
-- BEFUND: daily_challenge_results enthält pro finalisiertem Tag eine Zeile
-- für JEDES Profil (finalize_challenge_day joint "FROM public.profiles pr
-- LEFT JOIN entries_agg a" — automatische Teilnahme, siehe 20260726000003).
-- Nutzer ohne Satz an diesem Tag stehen dort mit total_repetitions = 0 und
-- werden aktuell 1:1 in die historische Tagesrangliste durchgereicht
-- (get_daily_challenge_day_details) bzw. fließen in den dort gespeicherten
-- participant_count ein (auch in get_challenge_history sichtbar, "Platz X
-- von Y"). Damit tauchen in "Daily Live → Verlauf" Nutzer wie "#13 ... – 0"
-- auf, die an dem Tag gar nicht teilgenommen haben.
--
-- FIX: rein lesend, direkt in den beiden Abfrage-RPCs — total_repetitions
-- muss dort weiterhin einmalig geschrieben, aber nirgends "nachträglich"
-- korrigiert werden. finalize_challenge_day bleibt bewusst UNVERÄNDERT:
--   • Sie speist NICHT die Live-Ansicht "Heute" (die kommt ausschließlich
--     aus get_daily_challenge_leaderboard direkt auf workout_entries) —
--     eine Änderung hier hätte also ohnehin keinen Effekt auf "Heute".
--   • Eine Änderung an finalize_challenge_day würde nur NEUE Finalisierungen
--     betreffen; bereits finalisierte Tage (26.–29.07. laut Cutover-Fix
--     korrekt) blieben mit dem alten, ungefilterten participant_count
--     eingefroren (exakt das Problem aus der Cutover-Untersuchung). Der
--     Filter gehört daher an die Lesestelle, nicht an die Schreibstelle.
--
-- Wichtig: RANK() in daily_challenge_results ist über
-- "total_repetitions DESC" sortiert — 0er-Nutzer stehen dadurch immer HINTER
-- allen aktiven Nutzern. Sie beim Lesen herauszufiltern hinterlässt daher nie
-- eine Rang-Lücke; die verbleibenden Ränge 1..K der aktiven Nutzer sind
-- automatisch bereits lückenlos. Keine RANK()-Neuberechnung nötig.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── get_daily_challenge_day_details: nur aktive Teilnehmer (total_repetitions > 0) ──

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

  -- participant_count wird hier bewusst aus COUNT(*) über die bereits
  -- gefilterte Zeilenmenge berechnet statt aus der gespeicherten,
  -- eingefrorenen Spalte r.participant_count (die zählt weiterhin ALLE
  -- Profile) — konsistent mit der gefilterten Rangliste/den Gewinner-Feldern
  -- unten, die aus derselben Zeilenmenge stammen.
  SELECT
    jsonb_build_object(
      'summary', jsonb_build_object(
        'challenge_date',           p_date,
        'participant_count',        COUNT(*),
        'total_repetitions',        COALESCE(SUM(r.total_repetitions), 0)::integer,
        'total_sets',               COALESCE(SUM(r.set_count), 0)::integer,
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
  WHERE r.exercise_id       = p_exercise_id
    AND r.challenge_date    = p_date
    AND r.total_repetitions > 0;

  RETURN COALESCE(v_result, jsonb_build_object('error', 'NOT_FOUND'));
END;
$$;

REVOKE ALL      ON FUNCTION public.get_daily_challenge_day_details(uuid, date) FROM PUBLIC;
REVOKE EXECUTE  ON FUNCTION public.get_daily_challenge_day_details(uuid, date) FROM anon;
GRANT  EXECUTE  ON FUNCTION public.get_daily_challenge_day_details(uuid, date) TO authenticated;

-- ── get_challenge_history: participant_count je Tag aktiv neu zählen ───────
-- Eigene Zeile pro Tag bleibt unverändert sichtbar (auch bei 0 eigenen
-- Wiederholungen) — das ist "meine" Historie, keine gemeinsame Rangliste,
-- und war nicht Teil der gemeldeten Anforderung. Nur die angezeigte
-- Teilnehmerzahl ("Platz X von Y") wird korrigiert.

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
    (
      SELECT COUNT(*)::integer
      FROM daily_challenge_results r2
      WHERE r2.exercise_id       = p_exercise_id
        AND r2.challenge_date    = r.challenge_date
        AND r2.total_repetitions > 0
    ) AS participant_count,
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
