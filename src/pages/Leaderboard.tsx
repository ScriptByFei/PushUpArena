import { useState, useEffect } from 'react';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { supabase } from '@/lib/supabase';
import type { LeaderboardRow } from '@/lib/database.types';

const TABS = [
  { key: 'today_amount' as const, label: 'Heute', icon: '⚡' },
  { key: 'current_streak' as const, label: 'Streak', icon: '🔥' },
  { key: 'total_amount' as const, label: 'Gesamt', icon: '🏆' },
];

// Reihenfolge: P2 links, P1 Mitte (elevated), P3 rechts
const PODIUM_SLOTS = [
  {
    rowIdx: 1,
    medal: '🥈',
    border: 'border-slate-500',
    bg: 'bg-slate-800/60',
    valueColor: 'text-slate-200',
    nameColor: 'text-slate-200',
    avatarSize: 40,
    mt: 'mt-6',
  },
  {
    rowIdx: 0,
    medal: '🥇',
    border: 'border-amber-400',
    bg: 'bg-amber-500/10',
    valueColor: 'text-amber-300',
    nameColor: 'text-amber-100',
    avatarSize: 52,
    mt: '',
  },
  {
    rowIdx: 2,
    medal: '🥉',
    border: 'border-orange-700',
    bg: 'bg-orange-900/10',
    valueColor: 'text-orange-300',
    nameColor: 'text-slate-200',
    avatarSize: 40,
    mt: 'mt-8',
  },
] as const;

function restHearts(n: number): string {
  return '❤️'.repeat(Math.max(0, n));
}

// ── Heutige Sätze Bottom Sheet ────────────────────────────────────────────────
interface TodaySetsSheetProps {
  row: LeaderboardRow;
  exerciseId: string;
  onClose: () => void;
}

function TodaySetsSheet({ row, exerciseId, onClose }: TodaySetsSheetProps) {
  const [sets, setSets] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);
  const name = row.display_name || row.username;

  // Fetch on mount
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.rpc('get_friend_today_sets', {
          p_user_id: row.user_id,
          p_exercise: exerciseId,
        });
        setSets((data ?? []).map((r) => r.amount));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Sheet */}
      <div
        className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />

        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <Avatar url={row.avatar_url} name={name} size={40} />
          <div>
            <p className="font-semibold text-slate-100">{name}</p>
            <p className="text-xs text-slate-400">Heutige Sätze</p>
          </div>
          <span className="ml-auto text-2xl font-extrabold text-brand-300">
            {row.today_amount}
          </span>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">Lade …</p>
        ) : !sets || sets.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Keine Einträge heute</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sets.map((amount, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-xl bg-ink-800 px-4 py-2 text-center"
              >
                <span className="text-[11px] text-slate-500">Satz {i + 1}</span>
                <span className="text-lg font-extrabold text-brand-300">{amount}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Hauptseite ────────────────────────────────────────────────────────────────
export default function Leaderboard() {
  const { exercise: activeExercise, enrolledExercises, loading: exLoading } = useExercise();
  const [leaderExercise, setLeaderExercise] = useState<typeof activeExercise>(null);
  const shownExercise = leaderExercise ?? activeExercise;
  const { rows, loading, error, refetch, sortKey, setSortKey } = useLeaderboard(shownExercise?.id);
  const [selectedRow, setSelectedRow] = useState<LeaderboardRow | null>(null);

  const isToday = sortKey === 'today_amount';

  if (exLoading || loading) return <LoadingState label="Lade Rangliste …" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const hasPodium = rows.length >= 3;
  const sortLabel = TABS.find((t) => t.key === sortKey)?.label ?? '';

  function handleTap(row: LeaderboardRow) {
    if (isToday) setSelectedRow(row);
  }

  return (
    <div className="space-y-4">

      {/* Übungs-Switcher (nur wenn >1 eingeschrieben) */}
      {enrolledExercises.length > 1 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${enrolledExercises.length}, 1fr)` }}>
          {enrolledExercises.map((ex) => {
            const isActive = ex.id === (shownExercise?.id);
            return (
              <button
                key={ex.id}
                onClick={() => setLeaderExercise(ex)}
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

      {/* Tab-Leiste */}
      <div className="grid grid-cols-3 gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSortKey(t.key)}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-semibold transition ${
              sortKey === t.key
                ? 'bg-brand-600 text-white'
                : 'bg-ink-800 text-slate-400 hover:bg-ink-700'
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

{rows.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="Noch niemand in der Rangliste"
          description="Sobald Freunde mitmachen, seht ihr euch hier im Vergleich."
        />
      ) : (
        <>
          {/* Podest Platz 1–3 */}
          {hasPodium && (
            <div className="grid grid-cols-3 items-end gap-2">
              {PODIUM_SLOTS.map(({ rowIdx, medal, border, bg, valueColor, nameColor, avatarSize, mt }) => {
                const row = rows[rowIdx];
                return (
                  <div
                    key={row.user_id}
                    onClick={() => handleTap(row)}
                    className={`${mt} flex flex-col items-center rounded-2xl border ${border} ${bg} p-3 text-center ${isToday ? 'cursor-pointer active:scale-95 transition' : ''}`}
                  >
                    <span className="text-2xl leading-none">{medal}</span>
                    <div className="mt-2">
                      <Avatar
                        url={row.avatar_url}
                        name={row.display_name || row.username}
                        size={avatarSize}
                      />
                    </div>
                    <p className={`mt-2 w-full truncate text-xs font-bold ${nameColor}`}>
                      {row.display_name || row.username}
                      {row.is_me && (
                        <span className="ml-1 font-normal text-brand-300">(du)</span>
                      )}
                    </p>
                    <p className={`mt-2 flex items-center justify-center gap-1 text-xl font-extrabold ${valueColor}`}>
                      {sortKey === 'current_streak' && row.rest_days_remaining > 0 && (
                        <span className="text-base leading-none" title="Freie Ruhetage diese Woche">
                          {restHearts(row.rest_days_remaining)}
                        </span>
                      )}
                      {row[sortKey]}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">
                      {sortLabel}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Liste Platz 4+ (oder alle wenn kein Podest) */}
          {(hasPodium ? rows.slice(3) : rows).length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-800/70">
              <ul className="divide-y divide-ink-700">
                {(hasPodium ? rows.slice(3) : rows).map((row, idx) => (
                  <li
                    key={row.user_id}
                    onClick={() => handleTap(row)}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      row.is_me ? 'bg-brand-600/10' : ''
                    } ${isToday ? 'cursor-pointer active:bg-ink-700/60 transition' : ''}`}
                  >
                    <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-500">
                      {(hasPodium ? 3 : 0) + idx + 1}
                    </span>
                    <Avatar
                      url={row.avatar_url}
                      name={row.display_name || row.username}
                      size={36}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-200">
                        {row.display_name || row.username}
                        {row.is_me && (
                          <span className="ml-1 text-xs text-brand-300">(du)</span>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="flex items-center justify-end gap-1 text-base font-extrabold text-brand-200">
                        {sortKey === 'current_streak' && row.rest_days_remaining > 0 && (
                          <span className="text-sm leading-none" title="Freie Ruhetage diese Woche">
                            {restHearts(row.rest_days_remaining)}
                          </span>
                        )}
                        {row[sortKey]}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">
                        {sortLabel}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Bottom Sheet: heutige Sätze */}
      {selectedRow && shownExercise && (
        <TodaySetsSheet
          row={selectedRow}
          exerciseId={shownExercise.id}
          onClose={() => setSelectedRow(null)}
        />
      )}

    </div>
  );
}
