-- Phase 4E.2 Security Cleanup: revoke all EXECUTE from anon on Daily Challenge RPCs.
-- Background: the original migration granted EXECUTE to anon on several functions.
-- REVOKE FROM PUBLIC removes the public pseudo-role grant; the explicit anon grant
-- requires a separate REVOKE FROM anon per function.
-- No table, data, or function body changes — grants only.

-- Client RPCs: revoke anon, keep authenticated
REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_status(uuid)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_leaderboard(uuid, date)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_challenge_sets(uuid, date)                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_challenge_history(uuid, integer)                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_day_details(uuid, date)                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_daily_challenge_participant_sets(uuid, date, uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.join_daily_challenge(uuid)                                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_challenge_set(uuid, integer)                            FROM PUBLIC, anon;

-- Ensure authenticated retains EXECUTE on all client RPCs
GRANT EXECUTE ON FUNCTION public.get_daily_challenge_status(uuid)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_challenge_leaderboard(uuid, date)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_challenge_sets(uuid, date)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_challenge_history(uuid, integer)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_challenge_day_details(uuid, date)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_challenge_participant_sets(uuid, date, uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_daily_challenge(uuid)                                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_challenge_set(uuid, integer)                            TO authenticated;

-- Internal-only RPC: no anon, no authenticated
REVOKE EXECUTE ON FUNCTION public.finalize_challenge_day(uuid, date) FROM PUBLIC, anon, authenticated;
