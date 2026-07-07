const DEFAULT_AVATAR = '/default-avatar.png';

interface AvatarProps {
  url?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

/** Gibt true zurück wenn der Avatar manuell in der App hochgeladen wurde (Supabase Storage). */
function isManualUpload(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('/object/public/avatars/');
}

export function Avatar({ url, name, size = 44, className = '' }: AvatarProps) {
  const dimension = { width: size, height: size };
  // Nur manuell hochgeladene Bilder anzeigen – Google-Avatare → Standard-Bild
  const src = isManualUpload(url) ? (url as string) : DEFAULT_AVATAR;
  return (
    <img
      src={src}
      alt={name ?? 'Avatar'}
      style={dimension}
      referrerPolicy="no-referrer"
      className={`shrink-0 rounded-full border border-ink-600 object-cover ${className}`}
    />
  );
}
