import { useExercise } from '@/context/ExerciseContext';
import { usePodiumHistory } from '@/hooks/usePodiumHistory';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';

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
            {rows.map((row, idx) => {
              const MEDALS = ['🥇', '🥈', '🥉'] as const;
              const medal = MEDALS[idx] ?? null;
              return (
                <li
                  key={row.user_id}
                  className={`flex items-center gap-3 px-4 py-3 ${row.is_me ? 'bg-brand-600/10' : ''}`}
                >
                  <span className="w-5 shrink-0 text-center text-base">
                    {medal ?? <span className="text-sm font-bold text-slate-500">{idx + 1}</span>}
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
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
