import { useExercise } from '@/context/ExerciseContext';
import { usePodiumHistory } from '@/hooks/usePodiumHistory';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';

const TROPHY_COLORS = [
  { cup: '#FFD700', shine: '#FFF176', base: '#E6B800' }, // Gold
  { cup: '#C0C0C0', shine: '#FFFFFF', base: '#909090' }, // Silver
  { cup: '#CD7F32', shine: '#E8A96A', base: '#8B5A1A' }, // Bronze
];

function TrophyIcon({ rank, size = 24 }: { rank: number; size?: number }) {
  const c = TROPHY_COLORS[rank] ?? { cup: '#64748b', shine: '#94a3b8', base: '#334155' };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Cup body */}
      <path d="M6 3h12v8a6 6 0 01-12 0V3z" fill={c.cup} />
      {/* Shine highlight */}
      <path d="M8 4h3v5a3 3 0 01-3-3V4z" fill={c.shine} opacity="0.4" />
      {/* Handles */}
      <path d="M6 5H3a2 2 0 000 4h3" stroke={c.base} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <path d="M18 5h3a2 2 0 010 4h-3" stroke={c.base} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      {/* Stem */}
      <rect x="10.5" y="11" width="3" height="5" fill={c.base} />
      {/* Base platform */}
      <rect x="7" y="16" width="10" height="2" rx="1" fill={c.base} />
      {/* Star on cup */}
      <path d="M12 6l.6 1.8H14l-1.3 1 .5 1.7L12 9.5l-1.2 1 .5-1.7L10 7.8h1.4z" fill={c.shine} opacity="0.8" />
    </svg>
  );
}

export default function Achievements() {
  const { enrolledExercises, loading: exLoading } = useExercise();

  // Medaillen nur für PushUps
  const pushups = enrolledExercises.find((ex) => ex.slug === 'pushups');
  const { rows, loading, error, refetch } = usePodiumHistory(pushups?.id);

  if (exLoading || loading) return <LoadingState label="Lade Erfolge …" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <div className="space-y-4">
      {/* Info */}
      <p className="text-xs text-slate-500 text-center">
        Täglich werden die Top 3 mit Gold, Silber und Bronze ausgezeichnet.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="Noch keine Medaillen"
          description="Medaillen werden täglich um Mitternacht vergeben. Die Zählung startete ab dem 6. Juli 2026."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-800/70">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Spieler</span>
            <div className="flex gap-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              <span className="w-8 text-center">🥇</span>
              <span className="w-8 text-center">🥈</span>
              <span className="w-8 text-center">🥉</span>
            </div>
          </div>

          <ul className="divide-y divide-ink-700">
            {rows.map((row, idx) => (
              <li
                key={row.user_id}
                className={`flex items-center gap-3 px-4 py-3 ${row.is_me ? 'bg-brand-600/10' : ''}`}
              >
                <span className="w-6 shrink-0 flex items-center justify-center">
                  {idx < 3
                    ? <TrophyIcon rank={idx} size={22} />
                    : <span className="text-sm font-bold text-slate-500">{idx + 1}</span>}
                </span>
                <Avatar url={row.avatar_url} name={row.display_name || row.username} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-200">
                    {row.display_name || row.username}
                    {row.is_me && <span className="ml-1 text-xs text-brand-300">(du)</span>}
                  </p>
                </div>
                <div className="flex shrink-0 gap-3 items-center">
                  <span className="w-8 text-center text-sm font-bold text-amber-300">{row.gold_count}</span>
                  <span className="w-8 text-center text-sm font-bold text-slate-300">{row.silver_count}</span>
                  <span className="w-8 text-center text-sm font-bold text-orange-400">{row.bronze_count}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
