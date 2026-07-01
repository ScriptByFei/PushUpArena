import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { CameraIcon } from '@/components/ui/icons';
import { useToast } from '@/context/ToastContext';

interface Props {
  url: string | null;
  name: string;
  userId: string;
  /** Wird nach erfolgreichem Upload mit der neuen URL aufgerufen */
  onUploaded: (newUrl: string) => Promise<{ error: string | null }>;
  size?: number;
}

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function storagePath(avatarUrl: string): string | null {
  const marker = '/object/public/avatars/';
  const idx = avatarUrl.indexOf(marker);
  return idx === -1 ? null : avatarUrl.slice(idx + marker.length);
}

export function AvatarUpload({ url, name, userId, onUploaded, size = 64 }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function handleFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Nur JPG, PNG, WebP oder GIF erlaubt.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Bild darf maximal 5 MB groß sein.');
      return;
    }

    setUploading(true);

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`;

    // 1. Upload
    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: false });

    if (uploadErr) {
      toast.error('Upload fehlgeschlagen: ' + uploadErr.message);
      setUploading(false);
      return;
    }

    // 2. Public URL ermitteln
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);

    // 3. Profil aktualisieren (über den Hook im Parent)
    const { error: profileErr } = await onUploaded(publicUrl);
    if (profileErr) {
      toast.error('Profil-Update fehlgeschlagen: ' + profileErr);
      // Hochgeladene Datei wieder entfernen, da Profil nicht aktualisiert wurde
      await supabase.storage.from('avatars').remove([path]);
      setUploading(false);
      return;
    }

    // 4. Altes Bild aus Storage löschen (nur wenn es vom eigenen Bucket stammt)
    if (url) {
      const oldPath = storagePath(url);
      if (oldPath) {
        await supabase.storage.from('avatars').remove([oldPath]);
      }
    }

    toast.success('Profilbild aktualisiert.');
    setUploading(false);
  }

  return (
    <div className="relative inline-block">
      <Avatar url={url} name={name} size={size} />

      {/* Kamera-Overlay */}
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 disabled:cursor-wait disabled:opacity-60"
        aria-label="Profilbild ändern"
      >
        {uploading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <CameraIcon className="h-5 w-5 text-white drop-shadow" />
        )}
      </button>

      {/* Kleines Kamera-Badge (immer sichtbar, zeigt Klickbarkeit) */}
      <div className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-ink-900 bg-brand-600">
        <CameraIcon className="h-3 w-3 text-white" />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
