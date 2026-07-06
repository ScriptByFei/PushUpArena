import { useState } from 'react'; // für localExercise
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';
import type { Exercise } from '@/lib/database.types';
import { usePodiumHistory } from '@/hooks/usePodiumHistory';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';

// Übungen mit aktivem Medaillen-System
const MEDAL_ENABLED_SLUGS = ['pushups'];

export default function Achievements() {
  const { exercise: activeExercise, enrolledExercises, loading: exLoading } = useExercise();
  const [localExercise, setLocalExercise] = useState<Exercise | null>(null);
  const exercise = localExercise ?? activeExercise;

  const medalEnabled = MEDAL_ENABLED_SLUGS.includes(exercise?.slug ?? '');
  const { rows, loading, error, refetch } = usePodiumHistory(medalEnabled ? exercise?.id : undefined);

  if (exLoading || loading) return <LoadingState label="Lade Erfolge …" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <div className="space-y-4">
      {/* Übungs-Switcher */}
      {enrolledExercises.length > 1 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${enrolledExercises.length}, 1fr)` }}>
          {enrolledExercises.map((ex) => {
            const isActive = ex.id === exercise?.id;
            return (
              <button
                key={ex.id}
                onClick={() => setLocalExercise(ex)}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  isActive ? 'bg-brand-600 text-white' : 'bg-ink-800 text-slate-400 hover:bg-ink-700'
                }`}
              >
                <img src={EXERCISE_ICONS[ex.slug] ?? '/pushup-icon.png'} alt={ex.name} className="h-5 w-5 rounded-md object-cover" />
                {ex.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Hinweis: Medaillen nur für PushUps */}
      {!medalEnabled && (
        <div className="flex items-start gap-3 rounded-2xl border border-ink-700 bg-ink-800/60 px-4 py-3">
          <span className="text-xl leading-none">🏗️</span>
          <div>
            <p className="text-sm font-semibold text-slate-200">Medaillen folgen bald</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Das Medaillen-System ist aktuell nur für PushUps aktiv. Weitere Übungen werden nach und nach freigeschaltet.
            </p>
          </div>
        </div>
      )}

      {/* Medaillen-Tabelle */}
      {medalEnabled && (
        rows.length === 0 ? (
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
        )
      )}
    </div>
  );
}
