-- =============================================================================
-- PushupArena · 0006 · Profile für alle authentifizierten Nutzer lesbar
-- -----------------------------------------------------------------------------
-- Vorher: profiles_select_visible erlaubt nur eigenes Profil, is_searchable=true
--         und Freunde.
-- Jetzt:  Alle eingeloggten Nutzer können alle Profile lesen (nur nicht-sensitive
--         Felder: id, username, display_name, avatar_url).
--         E-Mail-Adressen sind nie in profiles gespeichert (liegen in auth.users).
-- =============================================================================

drop policy if exists "profiles_select_visible" on public.profiles;

create policy "profiles_select_all_authenticated"
  on public.profiles for select to authenticated
  using (true);
