-- Migration: daily_live_participant_sets_today
-- ─────────────────────────────────────────────────────────────────────────────
-- Teilnehmerdetail-Ansicht (Daily Live, Phase 8): die bestehende
-- get_daily_challenge_participant_sets liefert nur vergangene, bereits
-- finalisierte Tage (p_date < heute, verlangt einen Snapshot in
-- daily_challenge_results). Für den laufenden Tag gibt es bisher keinen Weg,
-- die Sätze eines ANDEREN Teilnehmers zu lesen — workout_entries ist per RLS
-- nur für den eigenen Nutzer sichtbar.
--
-- Diese neue, separate RPC deckt ausschließlich "heute" ab (kein p_date-Param,
-- keine Abhängigkeit von einem Snapshot) und macht damit die Sätze eines
-- beliebigen Teilnehmers für den aktuellen Berliner Tag lesbar — read-only,
-- keine neue Schreib-Fläche. Das Sichtbarkeitsniveau entspricht dem, was
-- ohnehin schon über Arena Live (einzelne Sätze in Echtzeit) öffentlich ist.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_daily_challenge_participant_sets_today(
  p_exercise_id uuid,
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
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.exercises x WHERE x.id = p_exercise_id) THEN
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
    AND (we.performed_at AT TIME ZONE 'Europe/Berlin')::date =
        (now() AT TIME ZONE 'Europe/Berlin')::date
  ORDER BY we.performed_at;
END;
$$;

REVOKE ALL      ON FUNCTION public.get_daily_challenge_participant_sets_today(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE  ON FUNCTION public.get_daily_challenge_participant_sets_today(uuid, uuid) FROM anon;
GRANT  EXECUTE  ON FUNCTION public.get_daily_challenge_participant_sets_today(uuid, uuid) TO authenticated;
