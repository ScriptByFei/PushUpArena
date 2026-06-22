interface AvatarProps {
  url?: string | null;
  name?: string | null;
  size?: number;
  className?: string;
}

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

export function Avatar({ url, name, size = 44, className = '' }: AvatarProps) {
  const dimension = { width: size, height: size };
  if (url) {
    return (
      <img
        src={url}
        alt={name ?? 'Avatar'}
        style={dimension}
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full border border-ink-600 object-cover ${className}`}
      />
    );
  }
  return (
    <div
      style={dimension}
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 font-bold text-white ${className}`}
    >
      <span style={{ fontSize: size * 0.4 }}>{initials(name)}</span>
    </div>
  );
}
