const DEFAULT_AVATAR = '/default-avatar.png';

interface AvatarProps {
  url?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ url, name, size = 44, className = '' }: AvatarProps) {
  const dimension = { width: size, height: size };
  const src = url || DEFAULT_AVATAR;
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
