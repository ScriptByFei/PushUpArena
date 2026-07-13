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

// Max raw file size allowed before processing
const MAX_RAW_BYTES = 20 * 1024 * 1024; // 20 MB — canvas will compress it down
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

function storagePath(avatarUrl: string): string | null {
  const marker = '/object/public/avatars/';
  const idx = avatarUrl.indexOf(marker);
  return idx === -1 ? null : avatarUrl.slice(idx + marker.length);
}

/**
 * Resize and compress an image to max 400×400 px WebP using the Canvas API.
 * Reduces a typical 2–5 MB phone photo to ≈40–80 KB before upload,
 * dramatically cutting Supabase Storage egress.
 */
function resizeToWebP(file: File, maxPx = 400, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not available')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => { blob ? resolve(blob) : reject(new Error('Canvas toBlob returned null')); },
        'image/webp',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')); };
    img.src = objectUrl;
  });
}

export function AvatarUpload({ url, name, userId, onUploaded, size = 64 }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  async function handleFile(file: File) {
    if (!ALLOWED_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
      toast.error('Nur Bilddateien (JPG, PNG, WebP …) erlaubt.');
      return;
    }
    if (file.size > MAX_RAW_BYTES) {
      toast.error('Bild darf maximal 20 MB groß sein.');
      return;
    }

    setUploading(true);

    // Resize + convert to WebP before upload — reduces storage & egress by ~95%
    let uploadBlob: Blob;
    try {
      uploadBlob = await resizeToWebP(file);
    } catch {
      toast.error('Bild konnte nicht verarbeitet werden.');
      setUploading(false);
      return;
    }

    const path = `${userId}/${Date.now()}.webp`;

    // 1. Upload compressed WebP
    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, uploadBlob, { upsert: false, contentType: 'image/webp' });

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
