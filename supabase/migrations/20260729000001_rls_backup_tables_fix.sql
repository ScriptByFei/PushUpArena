-- =============================================================================
-- RLS Security Fix: Backup-Tabellen der Daily-Challenge-Migration
-- -----------------------------------------------------------------------------
-- Supabase Security Advisor: rls_disabled
--
-- public._backup_20260724_dce / _dcp / _dcr sind reine Sicherungskopien von
-- daily_challenge_entries/participations/results, angelegt vor der Migration
-- 20260724000005_unify_challenge_with_workout_entries.sql. Kein Frontend-Code
-- und keine RPC greifen darauf zu (geprüft: keine Treffer für "_backup_" im
-- gesamten src/-Verzeichnis).
--
-- Da niemand über die Client-API auf diese Tabellen zugreifen muss, werden
-- keine Policies angelegt (impliziter Deny für anon/authenticated). Zugriff
-- bleibt weiterhin über service_role/Dashboard möglich (bypassed RLS grundsätzlich).
--
-- Additiv, keine Datenänderung, keine bestehende Migration wird verändert.
-- =============================================================================

revoke all on public._backup_20260724_dce from anon, authenticated;
revoke all on public._backup_20260724_dcp from anon, authenticated;
revoke all on public._backup_20260724_dcr from anon, authenticated;

alter table public._backup_20260724_dce enable row level security;
alter table public._backup_20260724_dcp enable row level security;
alter table public._backup_20260724_dcr enable row level security;
