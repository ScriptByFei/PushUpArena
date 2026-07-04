import { Link } from 'react-router-dom';
import { useExercise } from '@/context/ExerciseContext';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';

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

export default function Leaderboard() {
  const { exercise, loading: exLoading } = useExercise();
  const { rows, loading, error, refetch, sortKey, setSortKey } = useLeaderboard(exercise?.id);

  if (exLoading || loading) return <LoadingState label="Lade Rangliste …" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const hasPodium = rows.length >= 3;
  const sortLabel = TABS.find((t) => t.key === sortKey)?.label ?? '';

  return (
    <div className="space-y-4">

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

      {rows.length <= 1 ? (
        <EmptyState
          icon="🏆"
          title="Deine Rangliste ist noch leer"
          description="Füge Freunde hinzu, um euch zu vergleichen. Nur Freunde sehen die Vergleichsdaten."
          action={
            <Link to="/friends">
              <Button size="sm">Freunde hinzufügen</Button>
            </Link>
          }
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
                    className={`${mt} flex flex-col items-center rounded-2xl border ${border} ${bg} p-3 text-center`}
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
                    <p className={`mt-2 text-xl font-extrabold ${valueColor}`}>
                      {row[sortKey]}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">
                      {sortLabel}
                    </p>
                    {sortKey === 'current_streak' && (
                      <p className="mt-1 text-sm leading-none" title="Freie Ruhetage diese Woche">
                        {restHearts(row.rest_days_remaining)}
                      </p>
                    )}
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
                    className={`flex items-center gap-3 px-4 py-3 ${
                      row.is_me ? 'bg-brand-600/10' : ''
                    }`}
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
                      {sortKey === 'current_streak' && (
                        <p className="text-[11px] leading-none text-slate-500 mb-0.5" title="Freie Ruhetage diese Woche">
                          {restHearts(row.rest_days_remaining)}
                        </p>
                      )}
                      <p className="text-base font-extrabold text-brand-200">{row[sortKey]}</p>
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

    </div>
  );
}
