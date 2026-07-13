import { useState } from 'react';

const DEFAULT_AVATAR = '/default-avatar.webp';

interface AvatarProps {
  url?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

export function Avatar({ url, name, size = 44, className = '' }: AvatarProps) {
  const [src, setSrc] = useState(url || DEFAULT_AVATAR);
  const dimension = { width: size, height: size };
  return (
    <img
      src={src}
      alt={name ?? 'Avatar'}
      style={dimension}
      referrerPolicy="no-referrer"
      onError={() => setSrc(DEFAULT_AVATAR)}
      className={`shrink-0 rounded-full border border-ink-600 object-cover ${className}`}
    />
  );
}
