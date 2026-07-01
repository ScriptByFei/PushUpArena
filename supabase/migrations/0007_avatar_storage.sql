-- =============================================================================
-- PushupArena · 0007 · Avatars Storage-Bucket + RLS
-- -----------------------------------------------------------------------------
-- Public-Bucket: alle können Bilder lesen (kein Auth nötig für img-Tags).
-- Schreiben/Löschen: nur der Eigentümer (erste Pfad-Komponente = auth.uid()).
-- Pfadkonvention: avatars/{user_id}/{timestamp}.{ext}
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,  -- 5 MB
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Lesezugriff für alle (öffentliche Avatare) ----------------------------------
create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Upload nur für eingeloggte Nutzer in eigenem Ordner -------------------------
create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update nur für eigene Dateien -----------------------------------------------
create policy "avatars_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Löschen nur für eigene Dateien ----------------------------------------------
create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
