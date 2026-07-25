-- Migration: ranking_tiebreaker_firstreach
-- ─────────────────────────────────────────────────────────────────────────────
-- Korrigiert die Ranking-Logik der Daily Live Challenge.
--
-- ALTES Verhalten (falsch):
--   1. total_repetitions DESC
--   2. set_count ASC           ← laut Spielregeln verboten
--   3. last_set_at ASC         ← ist der Zeitstempel des LETZTEN Satzes,
--                                 nicht wann die aktuelle Summe erstmals erreicht wurde
--   4. joined_at ASC
--   5. user_id ASC
--
-- NEUES Verhalten (korrekt):
--   1. total_repetitions DESC
--   2. total_first_reached_at ASC  ← wann die aktuelle Gesamt-Wiederholungszahl
--                                     ERSTMALS erreicht wurde (via kumulierter Laufsumme)
--   3. joined_at ASC               ← Tiebreaker bei exakt gleichem Zeitpunkt
--   4. user_id ASC                 ← vollständig deterministisch
--
-- Definition "zuerst erreicht":
--   Kleinster Timestamp t, sodass SUM(repetitions ORDER BY created_at bis t)
--   >= aktuelle Gesamtwiederholungen des Teilnehmers.
--
--   Beispiel:
--     Timofei:      30 @ 14:00 + 50 @ 15:00 + 40 @ 16:18 = 120 → erreicht um 16:18
--     Billiardqueue: 60 @ 16:15 + 60 @ 16:19              = 120 → erreicht um 16:19
--     → Timofei gewinnt.
--
--   Nach Edit/Delete: Laufsumme wird immer aus dem aktuellen Datenbestand
--   neu berechnet → immer korrekt.
--
-- Betroffene Funktionen:
--   1. get_daily_challenge_leaderboard  (Live-Rangliste)
--   2. finalize_challenge_day           (Snapshot für Historie)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. get_daily_challenge_leaderboard ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_daily_challenge_leaderboard(
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
  joined_at          timestamptz,
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
  -- ── Laufsumme je Teilnehmer (chronologisch sortiert) ──
  running_totals AS (
    SELECT
      participation_id,
      created_at,
      SUM(repetitions) OVER (
        PARTITION BY participation_id
        ORDER BY created_at ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cumulative_reps
    FROM daily_challenge_entries
    WHERE exercise_id    = p_exercise_id
      AND challenge_date = v_challenge_date
      AND is_flagged     = false
  ),
  -- ── Aggregierte Statistiken je Teilnehmer ──
  entries_agg AS (
    SELECT
      participation_id,
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
    GROUP BY participation_id
  ),
  -- ── Wann wurde die aktuelle Gesamtzahl ZUERST erreicht? ──
  -- DISTINCT ON (participation_id) mit ORDER BY created_at ASC → frühester Treffer.
  total_reached_at AS (
    SELECT DISTINCT ON (rt.participation_id)
      rt.participation_id,
      rt.created_at AS reached_at
    FROM running_totals rt
    JOIN entries_agg a ON a.participation_id = rt.participation_id
    WHERE rt.cumulative_reps >= a.total_repetitions
    ORDER BY rt.participation_id, rt.created_at ASC
  )
  SELECT
    p.user_id,
    COALESCE(pr.display_name, pr.username, 'Unbekannt')  AS display_name,
    pr.avatar_url,
    COALESCE(a.total_repetitions, 0)                     AS total_repetitions,
    COALESCE(a.set_count, 0)                             AS set_count,
    a.max_set,
    a.min_set,
    a.average_set,
    a.first_set_at,
    a.last_set_at,
    p.joined_at,
    RANK() OVER (
      ORDER BY
        -- 1. Mehr Wiederholungen = besserer Rang
        COALESCE(a.total_repetitions, 0)                                  DESC,
        -- 2. Wer seine aktuelle Gesamtzahl zuerst erreicht hat, gewinnt den Gleichstand.
        --    NULL (= noch keine Sätze) → sortiert ans Ende.
        COALESCE(tr.reached_at, 'infinity'::timestamptz)                  ASC,
        -- 3. Deterministischer Rest-Tiebreaker
        p.joined_at                                                        ASC,
        p.user_id                                                          ASC
    )                                                    AS rank,
    p.user_id = auth.uid()                               AS is_me
  FROM daily_challenge_participations p
  JOIN profiles pr ON pr.id = p.user_id
  LEFT JOIN entries_agg     a  ON a.participation_id  = p.id
  LEFT JOIN total_reached_at tr ON tr.participation_id = p.id
  WHERE p.exercise_id    = p_exercise_id
    AND p.challenge_date = v_challenge_date
  ORDER BY rank, p.user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_leaderboard(uuid, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_challenge_leaderboard(uuid, date) TO authenticated;


-- ── 2. finalize_challenge_day ─────────────────────────────────────────────────
-- Identische Ranking-Logik wie get_daily_challenge_leaderboard.
-- Wird für Snapshots vergangener Tage verwendet.

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
  -- Guard: nur vollständig abgeschlossene Tage finalisieren
  IF p_date >= (now() AT TIME ZONE 'Europe/Berlin')::date THEN
    RETURN;
  END IF;

  -- Guard: bereits finalisiert
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
  -- ── Laufsumme je Teilnehmer ──
  running_totals AS (
    SELECT
      participation_id,
      created_at,
      SUM(repetitions) OVER (
        PARTITION BY participation_id
        ORDER BY created_at ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cumulative_reps
    FROM daily_challenge_entries e
    WHERE e.exercise_id    = p_exercise_id
      AND e.challenge_date = p_date
      AND e.is_flagged     = false
  ),
  -- ── Aggregierte Statistiken ──
  entries_agg AS (
    SELECT
      e.participation_id,
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
    GROUP BY e.participation_id
  ),
  -- ── Wann wurde die aktuelle Gesamtzahl ZUERST erreicht? ──
  total_reached_at AS (
    SELECT DISTINCT ON (rt.participation_id)
      rt.participation_id,
      rt.created_at AS reached_at
    FROM running_totals rt
    JOIN entries_agg a ON a.participation_id = rt.participation_id
    WHERE rt.cumulative_reps >= a.total_repetitions
    ORDER BY rt.participation_id, rt.created_at ASC
  ),
  participant_count_cte AS (
    SELECT COUNT(*)::integer AS cnt
    FROM daily_challenge_participations
    WHERE exercise_id = p_exercise_id AND challenge_date = p_date
  ),
  ranked AS (
    SELECT
      p.user_id,
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
          p.joined_at                                                      ASC,
          p.user_id                                                        ASC
      )::integer AS rank
    FROM daily_challenge_participations p
    JOIN profiles pr ON pr.id = p.user_id
    LEFT JOIN entries_agg     a  ON a.participation_id  = p.id
    LEFT JOIN total_reached_at tr ON tr.participation_id = p.id
    WHERE p.exercise_id    = p_exercise_id
      AND p.challenge_date = p_date
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

-- Internal only
REVOKE ALL     ON FUNCTION public.finalize_challenge_day(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_challenge_day(uuid, date) FROM anon, authenticated;
