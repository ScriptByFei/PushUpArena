-- Migration: daily_live_leaderboard_only_active
-- ─────────────────────────────────────────────────────────────────────────────
-- Die Live-Rangliste zeigte bisher ALLE registrierten Nutzer (auch mit 0
-- Sätzen/0 Wiederholungen), weil profiles die Basistabelle war und
-- entries_agg per LEFT JOIN angehängt wurde. Jetzt: nur Nutzer, die heute
-- tatsächlich mindestens einen gültigen Satz absolviert haben.
--
-- entries_agg wird bereits per GROUP BY user_id aus workout_entries
-- aggregiert — jede Zeile darin hat also zwangsläufig set_count >= 1 und
-- total_repetitions > 0 (workout_entries.amount hat CHECK amount > 0).
-- Der Wechsel von LEFT JOIN auf einen regulären JOIN gegen profiles
-- garantiert damit strukturell "set_count > 0 AND total_repetitions > 0",
-- statt sich auf einen zusätzlichen WHERE-Filter zu verlassen — und RANK()
-- wird erst über die bereits gefilterte Zeilenmenge berechnet.
-- ─────────────────────────────────────────────────────────────────────────────

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
  -- GROUP BY garantiert: jede Zeile hat set_count >= 1 und total_repetitions > 0
  -- (workout_entries.amount > 0 per CHECK-Constraint) — kein leerer Nutzer kann
  -- hier auftauchen.
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
    a.total_repetitions,
    a.set_count,
    a.max_set,
    a.min_set,
    a.average_set,
    a.first_set_at,
    a.last_set_at,
    RANK() OVER (
      ORDER BY
        a.total_repetitions                                DESC,
        COALESCE(tr.reached_at, 'infinity'::timestamptz)    ASC,
        pr.id                                               ASC
    ) AS rank,
    pr.id = auth.uid() AS is_me
  FROM entries_agg a
  JOIN public.profiles pr        ON pr.id = a.user_id
  LEFT JOIN total_reached_at tr  ON tr.user_id = a.user_id
  ORDER BY rank, pr.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_leaderboard(uuid, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_challenge_leaderboard(uuid, date) TO authenticated;
