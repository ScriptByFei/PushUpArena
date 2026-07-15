-- =============================================================
-- RLS Security Fix
-- 1. Enable RLS on the two tables where it was completely off
-- 2. Add explicit service_role policy on debug_notification_log
-- 3. Fix policies using {public} role → {authenticated}
--    (critical: push_subscriptions "Service role reads all" was
--     granting full SELECT to unauthenticated users)
-- =============================================================

-- ── 1. email_blacklist ─────────────────────────────────────
-- Accessed only via SECURITY DEFINER check_email_blacklist()
-- which bypasses RLS. No client-facing policy needed.
ALTER TABLE public.email_blacklist ENABLE ROW LEVEL SECURITY;

-- ── 2. podium_processed_dates ──────────────────────────────
-- Accessed only by Edge Functions via service_role key,
-- which bypasses RLS. No client-facing policy needed.
ALTER TABLE public.podium_processed_dates ENABLE ROW LEVEL SECURITY;

-- ── 3. debug_notification_log ──────────────────────────────
-- RLS was already enabled but zero policies → implicit deny.
-- Edge Functions write via service_role (bypasses RLS by default),
-- so this policy is declarative / clears the advisor warning.
CREATE POLICY "service_role_all" ON public.debug_notification_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 4. Fix {public} → {authenticated} policies ─────────────

-- exercise_enrollments
DROP POLICY IF EXISTS "Users manage own enrollments" ON public.exercise_enrollments;
CREATE POLICY "Users manage own enrollments" ON public.exercise_enrollments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- notification_logs
DROP POLICY IF EXISTS "Users read own logs" ON public.notification_logs;
CREATE POLICY "Users read own logs" ON public.notification_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- podium_records
DROP POLICY IF EXISTS "podium_records_select_all" ON public.podium_records;
CREATE POLICY "podium_records_select_all" ON public.podium_records
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- push_subscriptions: "Service role reads all" with {public} + USING true
-- was granting every unauthenticated request read access to all push endpoints.
-- service_role bypasses RLS by default — no explicit policy needed.
DROP POLICY IF EXISTS "Service role reads all" ON public.push_subscriptions;

-- push_subscriptions: user self-management
DROP POLICY IF EXISTS "Users manage own subscription" ON public.push_subscriptions;
CREATE POLICY "Users manage own subscription" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- rest_days
DROP POLICY IF EXISTS "Users manage own rest days" ON public.rest_days;
CREATE POLICY "Users manage own rest days" ON public.rest_days
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- user_half_coins
DROP POLICY IF EXISTS "users read own half coins" ON public.user_half_coins;
CREATE POLICY "users read own half coins" ON public.user_half_coins
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- user_identities
DROP POLICY IF EXISTS "admin_read_all" ON public.user_identities;
CREATE POLICY "admin_read_all" ON public.user_identities
  FOR SELECT TO authenticated
  USING (auth.uid() = '379a8a5d-0a23-4205-a938-e4ce87b9a9fc'::uuid);

DROP POLICY IF EXISTS "own_identity" ON public.user_identities;
CREATE POLICY "own_identity" ON public.user_identities
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
