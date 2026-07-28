-- Migration: daily_live_single_source
-- ─────────────────────────────────────────────────────────────────────────────
-- Bugfix + Rearchitektur: "Die Live-Rangliste konnte nicht geladen werden."
--
-- ROOT CAUSE (bestätigt via Live-Diagnose):
--   get_daily_challenge_leaderboard war PL/pgSQL mit RETURNS TABLE(user_id uuid, ...).
--   PL/pgSQL legt für jede RETURNS-TABLE-Spalte automatisch eine gleichnamige
--   Variable an. Die CTEs referenzierten "user_id" unqualifiziert (Spalte aus
--   daily_challenge_entries) → Kollision mit der impliziten Variable:
--     ERROR 42702: column reference "user_id" is ambiguous
--
-- REARCHITEKTUR (angefordert): Daily Live hat keine Anmeldung/Teilnehmerliste
-- mehr. workout_entries ist die EINZIGE Datenquelle für die Live-Ansicht:
--   - Live-Rangliste, "Deine Leistung", "Deine Sätze" lesen direkt aus
--     workout_entries (keine Zwischenkopie mehr).
--   - Der Trigger, der workout_entries nach daily_challenge_entries spiegelte,
--     entfällt vollständig (er hatte zusätzlich einen Bug: er synchte JEDE
--     Übung, nicht nur Push-ups).
--   - Historische Tage bleiben unangetastet: finalize_challenge_day erzeugt
--     weiterhin einen unveränderlichen Snapshot in daily_challenge_results,
--     jetzt aus workout_entries statt aus der Spiegel-Tabelle berechnet.
--     Da das globale 30-Minuten-Bearbeitungsfenster (20260724_30min_edit_window)
--     workout_entries für vergangene Tage ohnehin einfriert, ist es als
--     historische Quelle genauso zuverlässig wie die alte Spiegel-Tabelle.
--   - Alle Tagesabfragen nutzen performed_at (nicht created_at) + Europe/Berlin,
--     analog zu get_my_stats, compute_streak, get_my_daily_rank etc.
--
-- Fehlerdiagnose-Prinzip für die Zukunft: alle RPC-Funktionen, die als
-- RETURNS TABLE(...) deklariert sind, werden nach Möglichkeit als
-- LANGUAGE sql geschrieben — dort gibt es keine impliziten Variablen und
-- damit keine Ambiguitäts-Fallstricke wie oben.
--
-- Tabellen daily_challenge_participations / daily_challenge_entries werden
-- NICHT gedroppt (kein Datenverlust historischer Rohdaten), aber ab sofort
-- von nichts mehr gelesen oder beschrieben.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Trigger + Sync-Funktion entfernen ──────────────────────────────────────
-- Schrieb bisher jeden workout_entries-Insert (fälschlich auch Nicht-Push-up-
-- Übungen) nach daily_challenge_entries. Nicht mehr nötig — workout_entries
-- ist jetzt direkte Quelle.

DROP TRIGGER IF EXISTS trg_sync_challenge_entry ON public.workout_entries;
DROP FUNCTION IF EXISTS public.sync_challenge_entry_from_workout();


-- ── 2. Tote RPCs entfernen (operierten nur auf der Spiegel-Tabelle,
--       wurden vom Frontend nicht mehr aufgerufen) ────────────────────────────

DROP FUNCTION IF EXISTS public.log_challenge_set(uuid, integer, uuid);
DROP FUNCTION IF EXISTS public.update_challenge_set(uuid, integer);
DROP FUNCTION IF EXISTS public.delete_challenge_set(uuid);


-- ── 3. get_daily_challenge_leaderboard: direkt aus workout_entries ────────────
-- LANGUAGE sql statt plpgsql → keine impliziten Variablen, keine Ambiguität
-- möglich. Basis weiterhin public.profiles (alle Nutzer), LEFT JOIN gegen die
-- heutigen Sätze.

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
  rank               bigint,
  is_me              boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  day_entries AS (
    SELECT we.user_id, we.amount, we.performed_at
    FROM public.workout_entries we
    WHERE we.exercise_id = p_exercise_id
      AND (we.performed_at AT TIME ZONE 'Europe/Berlin')::date =
          COALESCE(p_date, (now() AT TIME ZONE 'Europe/Berlin')::date)
  ),
  running_totals AS (
    SELECT
      de.user_id,
      de.performed_at,
      SUM(de.amount) OVER (
        PARTITION BY de.user_id
        ORDER BY de.performed_at ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cumulative_reps
    FROM day_entries de
  ),
  entries_agg AS (
    SELECT
      de.user_id,
      SUM(de.amount)::integer     AS total_repetitions,
      COUNT(*)::integer           AS set_count,
      MAX(de.amount)              AS max_set,
      MIN(de.amount)              AS min_set,
      ROUND(AVG(de.amount), 2)    AS average_set,
      MIN(de.performed_at)        AS first_set_at,
      MAX(de.performed_at)        AS last_set_at
    FROM day_entries de
    GROUP BY de.user_id
  ),
  total_reached_at AS (
    SELECT DISTINCT ON (rt.user_id)
      rt.user_id,
      rt.performed_at AS reached_at
    FROM running_totals rt
    JOIN entries_agg a ON a.user_id = rt.user_id
    WHERE rt.cumulative_reps >= a.total_repetitions
    ORDER BY rt.user_id, rt.performed_at ASC
  )
  SELECT
    pr.id,
    COALESCE(pr.display_name, pr.username, 'Unbekannt') AS display_name,
    pr.avatar_url,
    COALESCE(a.total_repetitions, 0) AS total_repetitions,
    COALESCE(a.set_count, 0)         AS set_count,
    a.max_set,
    a.min_set,
    a.average_set,
    a.first_set_at,
    a.last_set_at,
    RANK() OVER (
      ORDER BY
        COALESCE(a.total_repetitions, 0)                  DESC,
        COALESCE(tr.reached_at, 'infinity'::timestamptz)   ASC,
        pr.id                                              ASC
    ) AS rank,
    pr.id = auth.uid() AS is_me
  FROM public.profiles pr
  LEFT JOIN entries_agg      a  ON a.user_id  = pr.id
  LEFT JOIN total_reached_at tr ON tr.user_id = pr.id
  ORDER BY rank, pr.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_leaderboard(uuid, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_challenge_leaderboard(uuid, date) TO authenticated;


-- ── 4. get_my_challenge_sets: direkt aus workout_entries ──────────────────────
-- Gleiche Rückgabesignatur wie zuvor (Frontend-Typen unverändert).
-- edit_until = performed_at + 30 Min (spiegelt das globale Bearbeitungsfenster).
-- is_imported gibt es konzeptionell nicht mehr → immer false.

CREATE OR REPLACE FUNCTION public.get_my_challenge_sets(
  p_exercise_id uuid,
  p_date        date DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  repetitions  integer,
  created_at   timestamptz,
  edit_until   timestamptz,
  is_imported  boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    we.id,
    we.amount,
    we.performed_at,
    we.performed_at + interval '30 minutes',
    false
  FROM public.workout_entries we
  WHERE we.user_id     = auth.uid()
    AND we.exercise_id = p_exercise_id
    AND (we.performed_at AT TIME ZONE 'Europe/Berlin')::date =
        COALESCE(p_date, (now() AT TIME ZONE 'Europe/Berlin')::date)
  ORDER BY we.performed_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_challenge_sets(uuid, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_my_challenge_sets(uuid, date) TO authenticated;


-- ── 5. finalize_challenge_day: Snapshot jetzt aus workout_entries ─────────────
-- Identische Tiebreaker-Logik wie die Live-Rangliste, damit Live- und
-- finalisierte Rangliste am Tagesende exakt übereinstimmen.

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
  IF p_date >= (now() AT TIME ZONE 'Europe/Berlin')::date THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.daily_challenge_results r
    WHERE r.exercise_id = p_exercise_id AND r.challenge_date = p_date
    LIMIT 1
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.daily_challenge_results (
    user_id, exercise_id, challenge_date,
    rank, participant_count,
    display_name, avatar_url,
    total_repetitions, set_count,
    max_set, min_set, avg_set,
    first_set_at, last_set_at,
    finalized_at
  )
  WITH
  day_entries AS (
    SELECT we.user_id, we.amount, we.performed_at
    FROM public.workout_entries we
    WHERE we.exercise_id = p_exercise_id
      AND (we.performed_at AT TIME ZONE 'Europe/Berlin')::date = p_date
  ),
  running_totals AS (
    SELECT
      de.user_id,
      de.performed_at,
      SUM(de.amount) OVER (
        PARTITION BY de.user_id
        ORDER BY de.performed_at ASC
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS cumulative_reps
    FROM day_entries de
  ),
  entries_agg AS (
    SELECT
      de.user_id,
      SUM(de.amount)::integer     AS total_repetitions,
      COUNT(*)::integer           AS set_count,
      MAX(de.amount)              AS max_set,
      MIN(de.amount)              AS min_set,
      ROUND(AVG(de.amount), 2)    AS avg_set,
      MIN(de.performed_at)        AS first_set_at,
      MAX(de.performed_at)        AS last_set_at
    FROM day_entries de
    GROUP BY de.user_id
  ),
  total_reached_at AS (
    SELECT DISTINCT ON (rt.user_id)
      rt.user_id,
      rt.performed_at AS reached_at
    FROM running_totals rt
    JOIN entries_agg a ON a.user_id = rt.user_id
    WHERE rt.cumulative_reps >= a.total_repetitions
    ORDER BY rt.user_id, rt.performed_at ASC
  ),
  participant_count_cte AS (
    SELECT COUNT(*)::integer AS cnt FROM public.profiles
  ),
  ranked AS (
    SELECT
      pr.id AS user_id,
      COALESCE(pr.display_name, pr.username, 'Unbekannt') AS display_name,
      pr.avatar_url,
      COALESCE(a.total_repetitions, 0) AS total_repetitions,
      COALESCE(a.set_count, 0)         AS set_count,
      a.max_set,
      a.min_set,
      a.avg_set,
      a.first_set_at,
      a.last_set_at,
      RANK() OVER (
        ORDER BY
          COALESCE(a.total_repetitions, 0)                 DESC,
          COALESCE(tr.reached_at, 'infinity'::timestamptz)  ASC,
          pr.id                                             ASC
      )::integer AS rank
    FROM public.profiles pr
    LEFT JOIN entries_agg      a  ON a.user_id  = pr.id
    LEFT JOIN total_reached_at tr ON tr.user_id = pr.id
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

REVOKE ALL     ON FUNCTION public.finalize_challenge_day(uuid, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_challenge_day(uuid, date) FROM anon, authenticated;


-- ── 6. get_daily_challenge_participant_sets: direkt aus workout_entries ───────
-- Nur für abgeschlossene Tage (p_date < heute) — das globale 30-Min-Fenster
-- friert workout_entries für vergangene Tage ohnehin ein, daher als
-- historische Quelle genauso zuverlässig wie die alte Spiegel-Tabelle.
-- Sicherheitsprüfung (finalisierter Snapshot muss existieren) bleibt erhalten.

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

  v_today := (now() AT TIME ZONE 'Europe/Berlin')::date;
  IF p_date >= v_today THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.exercises x WHERE x.id = p_exercise_id) THEN
    RETURN;
  END IF;

  -- Sicherheitsprüfung: finalisierter Snapshot muss existieren, sonst kein Zugriff.
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_challenge_results dcr
    WHERE dcr.user_id        = p_user_id
      AND dcr.exercise_id    = p_exercise_id
      AND dcr.challenge_date = p_date
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    we.id                                                 AS entry_id,
    ROW_NUMBER() OVER (ORDER BY we.performed_at)::integer AS set_number,
    we.amount                                             AS repetitions,
    we.performed_at                                       AS created_at
  FROM public.workout_entries we
  WHERE we.user_id     = p_user_id
    AND we.exercise_id = p_exercise_id
    AND (we.performed_at AT TIME ZONE 'Europe/Berlin')::date = p_date
  ORDER BY we.performed_at;
END;
$$;

REVOKE ALL      ON FUNCTION public.get_daily_challenge_participant_sets(uuid, date, uuid) FROM PUBLIC;
REVOKE EXECUTE  ON FUNCTION public.get_daily_challenge_participant_sets(uuid, date, uuid) FROM anon;
GRANT  EXECUTE  ON FUNCTION public.get_daily_challenge_participant_sets(uuid, date, uuid) TO authenticated;


-- ── 7. Realtime: workout_entries statt daily_challenge_entries ────────────────
-- Voraussetzung für die neue Realtime-Subscription im Frontend
-- (postgres_changes auf public.workout_entries, gefiltert auf exercise_id).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'workout_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.workout_entries;
  END IF;
END $$;
