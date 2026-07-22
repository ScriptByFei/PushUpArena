-- Phase 4D.1: Security hardening for Daily Challenge RPCs
--
-- Fix: get_challenge_history — cap p_limit to prevent abuse.
-- A client could pass p_limit = 99999 which would:
--   1. Trigger up to 99999 finalization iterations (lazy finalize loop)
--   2. Return up to 99999 result rows from daily_challenge_results
-- Fix: enforce 1 ≤ p_limit ≤ 50 inside the function body.
--
-- No other changes: all tables have RLS enabled with no INSERT/UPDATE/DELETE
-- policies; all RPCs use SECURITY DEFINER + SET search_path = public; all
-- write RPCs verify auth.uid(); client time is never accepted.

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
  v_user_id    uuid;
  v_today      date;
  v_past_date  date;
  v_safe_limit integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Cap p_limit: min 1, max 50.
  -- Prevents a client from triggering unbounded lazy-finalization work
  -- or returning an arbitrarily large result set.
  v_safe_limit := LEAST(GREATEST(COALESCE(p_limit, 14), 1), 50);

  v_today := (now() AT TIME ZONE 'Europe/Berlin')::date;

  -- Lazy finalization: for any past day where the user participated
  -- but no snapshot exists yet, compute and persist results now.
  FOR v_past_date IN
    SELECT p.challenge_date
    FROM daily_challenge_participations p
    WHERE p.user_id      = v_user_id
      AND p.exercise_id  = p_exercise_id
      AND p.challenge_date < v_today
      AND NOT EXISTS (
        SELECT 1 FROM daily_challenge_results r
        WHERE r.user_id      = v_user_id
          AND r.exercise_id  = p_exercise_id
          AND r.challenge_date = p.challenge_date
      )
    ORDER BY p.challenge_date DESC
    LIMIT v_safe_limit
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
  WHERE r.user_id     = v_user_id
    AND r.exercise_id = p_exercise_id
    AND r.challenge_date < v_today
  ORDER BY r.challenge_date DESC
  LIMIT v_safe_limit;
END;
$$;

-- GRANT unchanged — only authenticated users may call this RPC.
REVOKE EXECUTE ON FUNCTION public.get_challenge_history(uuid, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_challenge_history(uuid, integer) TO authenticated;
