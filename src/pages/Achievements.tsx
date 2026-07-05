import { useState } from 'react';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';
import type { Exercise } from '@/lib/database.types';
import { usePodiumHistory } from '@/hooks/usePodiumHistory';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';

// Halbmünze als kleines SVG-Badge
function HalfCoin({ color }: { color: 'gold' | 'silver' | 'bronze' }) {
  const fill: Record<string, string> = {
    gold:   '#fbbf24',
    silver: '#94a3b8',
    bronze: '#c2773a',
  };
  return (
    <svg viewBox="0 0 20 20" className="inline h-4 w-4" aria-label="halbe Münze">
      {/* rechte Hälfte ausgefüllt, linke leer */}
      <circle cx="10" cy="10" r="9" fill="none" stroke={fill[color]} strokeWidth="1.5" />
      <path d="M10 1 A9 9 0 0 1 10 19 Z" fill={fill[color]} />
      <text x="10" y="14" textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">½</text>
    </svg>
  );
}

function HalfCoins({
  half_gold, half_silver, half_bronze,
}: { half_gold: number; half_silver: number; half_bronze: number }) {
  if (!half_gold && !half_silver && !half_bronze) return null;
  return (
    <div className="flex items-center gap-1 mt-0.5">
      {half_gold   > 0 && <HalfCoin color="gold"   />}
      {half_silver > 0 && <HalfCoin color="silver" />}
      {half_bronze > 0 && <HalfCoin color="bronze" />}
    </div>
  );
}

export default function Achievements() {
  const { exercise: activeExercise, enrolledExercises, loading: exLoading } = useExercise();
  const [localExercise, setLocalExercise] = useState<Exercise | null>(null);
  const exercise = localExercise ?? activeExercise;

  const { rows, loading, error, refetch } = usePodiumHistory(exercise?.id);
  const [rulesOpen, setRulesOpen] = useState(false);

  if (exLoading || loading) return <LoadingState label="Lade Erfolge …" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const THRESHOLDS: Record<string, { gold: number; silver: number; bronze: number }> = {
    pushups: { gold: 100, silver: 75, bronze: 50 },
    pullups: { gold: 20,  silver: 10, bronze: 5  },
  };
  const thresholds = exercise?.slug ? THRESHOLDS[exercise.slug] : undefined;
  const hasThresholds = !!thresholds;

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

      {/* Info zu Schwellenwerten — auf/zuklappbar */}
      {hasThresholds && thresholds && (
        <div className="rounded-2xl border border-ink-700 bg-ink-900/80 overflow-hidden">
          <button
            onClick={() => setRulesOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">So verdienst du Medaillen</p>
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-4 w-4 text-slate-500 transition-transform ${rulesOpen ? 'rotate-180' : ''}`}
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>

          {rulesOpen && (
            <>
              <div className="grid grid-cols-3 divide-x divide-ink-700 border-t border-ink-700">
                {[
                  { medal: '🥇', label: 'Gold',   value: thresholds.gold,   color: 'text-amber-300' },
                  { medal: '🥈', label: 'Silber', value: thresholds.silver, color: 'text-slate-300' },
                  { medal: '🥉', label: 'Bronze', value: thresholds.bronze, color: 'text-orange-400' },
                ].map(({ medal, label, value, color }) => (
                  <div key={label} className="flex flex-col items-center py-4 gap-1">
                    <span className="text-2xl leading-none">{medal}</span>
                    <span className={`text-xl font-extrabold ${color}`}>{value}</span>
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
              <div className="divide-y divide-ink-700 border-t border-ink-700 bg-ink-800/40">
                <div className="flex items-start gap-3 px-4 py-2.5">
                  <span className="text-base leading-none mt-0.5">🥇</span>
                  <p className="text-xs text-slate-400">Volle Medaille: mind. 3 User aktiv + Podest + Schwelle erreicht</p>
                </div>
                <div className="flex items-start gap-3 px-4 py-2.5">
                  <span className="text-base leading-none mt-0.5">🪙</span>
                  <p className="text-xs text-slate-400">Halbe Münze: Schwelle erreicht — egal ob auf Podest oder nicht, egal wie viele aktiv waren</p>
                </div>
                <div className="flex items-start gap-3 px-4 py-2.5">
                  <span className="text-base leading-none mt-0.5">✨</span>
                  <p className="text-xs text-slate-400">2 halbe Münzen gleicher Farbe → automatisch eine volle Medaille</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="Noch keine Medaillen"
          description="Medaillen werden täglich um Mitternacht vergeben — wenn mindestens 3 User trainiert haben. Die Zählung startete ab dem 6. Juli 2026."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-800/70">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Spieler</span>
            <div className="flex gap-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              <span className="w-8 text-center">🥇</span>
              <span className="w-8 text-center">🥈</span>
              <span className="w-8 text-center">🥉</span>
              {hasThresholds && <span className="w-8 text-center text-[10px]">½</span>}
            </div>
          </div>

          <ul className="divide-y divide-ink-700">
            {rows.map((row, idx) => {
              const MEDALS = ['🥇', '🥈', '🥉'] as const;
              const medal = MEDALS[idx] ?? null;
              const hasHalf = row.half_gold > 0 || row.half_silver > 0 || row.half_bronze > 0;
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
                    {hasThresholds && hasHalf && (
                      <HalfCoins
                        half_gold={row.half_gold}
                        half_silver={row.half_silver}
                        half_bronze={row.half_bronze}
                      />
                    )}
                  </div>
                  <div className="flex shrink-0 gap-3 items-center">
                    <span className="w-8 text-center text-sm font-bold text-amber-300">{row.gold_count}</span>
                    <span className="w-8 text-center text-sm font-bold text-slate-300">{row.silver_count}</span>
                    <span className="w-8 text-center text-sm font-bold text-orange-400">{row.bronze_count}</span>
                    {hasThresholds && (
                      <div className="w-8 flex flex-col items-center gap-0.5">
                        {row.half_gold   > 0 && <HalfCoin color="gold"   />}
                        {row.half_silver > 0 && <HalfCoin color="silver" />}
                        {row.half_bronze > 0 && <HalfCoin color="bronze" />}
                      </div>
                    )}
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
