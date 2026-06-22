import { useExercise } from '@/context/ExerciseContext';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { Card, CardTitle } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';

const SORTS = [
  { key: 'total_amount', label: 'Gesamt' },
  { key: 'today_amount', label: 'Heute' },
  { key: 'current_streak', label: 'Streak' },
  { key: 'level', label: 'Level' },
] as const;

const medals = ['🥇', '🥈', '🥉'];

export default function Leaderboard() {
  const { exercise, loading: exLoading } = useExercise();
  const { rows, loading, error, refetch, sortKey, setSortKey } = useLeaderboard(exercise?.id);

  if (exLoading || loading) return <LoadingState label="Lade Rangliste …" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Sortieren nach</CardTitle>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSortKey(s.key)}
              className={`rounded-lg px-2 py-2 text-sm font-medium transition ${
                sortKey === s.key
                  ? 'bg-brand-600 text-white'
                  : 'bg-ink-700 text-slate-300 hover:bg-ink-600'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Card>

      {rows.length <= 1 ? (
        <EmptyState
          icon="🏆"
          title="Deine Rangliste ist noch leer"
          description="Füge Freunde hinzu, um euch zu vergleichen. Nur Freunde sehen die Vergleichsdaten."
        />
      ) : (
        <Card>
          <ul className="divide-y divide-ink-700">
            {rows.map((row, idx) => (
              <li
                key={row.user_id}
                className={`flex items-center gap-3 py-3 ${
                  row.is_me ? '-mx-4 rounded-xl bg-brand-600/10 px-4' : ''
                }`}
              >
                <div className="w-7 shrink-0 text-center text-lg font-bold">
                  {medals[idx] ?? <span className="text-sm text-slate-500">{idx + 1}</span>}
                </div>
                <Avatar
                  url={row.avatar_url}
                  name={row.display_name || row.username}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-200">
                    {row.display_name || row.username}
                    {row.is_me && <span className="ml-1 text-xs text-brand-300">(du)</span>}
                  </p>
                  <p className="text-xs text-slate-400">
                    Lvl {row.level} · {row.current_streak}🔥 · heute {row.today_amount}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-lg font-extrabold text-brand-200">
                    {row[sortKey]}
                  </div>
                  <div className="text-[10px] uppercase text-slate-500">
                    {SORTS.find((s) => s.key === sortKey)?.label}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="px-1 text-center text-xs text-slate-500">
        Es werden ausschließlich Vergleichsdaten deiner Freunde angezeigt – keine öffentliche
        globale Rangliste, keine E-Mail-Adressen.
      </p>
    </div>
  );
}
