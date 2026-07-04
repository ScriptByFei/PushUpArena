import { useRef, useState, useEffect, type ReactNode, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useExercise } from '@/context/ExerciseContext';
import { useStats } from '@/hooks/useStats';
import { useGoals } from '@/hooks/useGoals';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { QuickAdd } from '@/components/QuickAdd';
import { useRestDayInfo } from '@/hooks/useRestDayInfo';

function StatTile({
  label,
  value,
  accent,
  icon,
  glowStyle,
}: {
  label: string;
  value: string | number;
  accent?: string;
  icon?: ReactNode;
  glowStyle?: CSSProperties;
}) {
  return (
    <div
      className="rounded-2xl border border-ink-700 bg-ink-800/70 p-4 flex flex-col items-center text-center"
      style={glowStyle}
    >
      <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </div>
      <div className={`mt-1.5 text-3xl font-extrabold leading-none ${accent ?? 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

// Modul-Variable: Toast nur einmal pro Tag anzeigen
let _restWarnShownDate: string | null = null;

export default function Dashboard() {
  const { exercise, loading: exLoading, error: exError, reload } = useExercise();
  const { stats, loading: statsLoading, refetch: refetchStats } = useStats(exercise?.id);
  const { goal, loading: goalLoading } = useGoals(exercise?.id);
  const restDay = useRestDayInfo(exercise?.id);
  const toast = useToast();
  useEffect(() => {
    if (restDay.loading) return;
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    if (restDay.consecutiveRestToday === 1 && _restWarnShownDate !== today) {
      _restWarnShownDate = today;
      toast.warning('⚠️ Achtung: Zwei Ruhetage hintereinander brechen deine Streak.');
    }
  }, [restDay.loading, restDay.consecutiveRestToday]);

  const [lastEntry, setLastEntry] = useState<{ id: string; amount: number } | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);

  if (exLoading) return <LoadingState label="Lade Übung …" />;
  if (exError || !exercise) return <ErrorState message={exError ?? 'Übung fehlt.'} onRetry={reload} />;

  const streak = statsLoading ? 0 : (stats.current_streak ?? 0);
  const streakGlow: CSSProperties =
    streak >= 30
      ? { boxShadow: '0 0 18px 4px rgba(251,191,36,0.55), 0 0 32px 8px rgba(139,92,246,0.35)' }
      : streak >= 7
        ? { boxShadow: '0 0 14px 3px rgba(251,146,60,0.5)' }
        : {};

  const unit = exercise.unit === 'reps' ? 'Wdh.' : exercise.unit;

  function onLogged({ amount, entryId }: { amount: number; entryId: string }) {
    void refetchStats();
    setLastEntry({ id: entryId, amount });
    window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setLastEntry(null), 6000);
  }

  async function undoLast() {
    if (!lastEntry) return;
    const { error } = await supabase.from('workout_entries').delete().eq('id', lastEntry.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Rückgängig gemacht.');
    setLastEntry(null);
    void refetchStats();
  }

  return (
    <div className="space-y-3">
      {/* Statistik-Kacheln */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Heute" value={statsLoading ? '–' : stats.today_amount} accent="text-brand-300" />
        <StatTile
          label="Streak"
          value={statsLoading ? '–' : `${stats.current_streak}🔥`}
          accent="text-amber-300"
          glowStyle={streakGlow}
        />
        <StatTile label="Gesamt" value={statsLoading ? '–' : stats.total_amount} />
      </div>

      {/* Schnell-Eingabe */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Schnell eintragen</CardTitle>
          <Link to="/settings" className="text-xs text-brand-400 hover:text-brand-300">
            Anpassen
          </Link>
        </div>
        <p className="mb-3 mt-0.5 text-xs text-slate-400">{exercise.name}</p>
        <QuickAdd exerciseId={exercise.id} unit={unit} onLogged={onLogged} />
      </Card>

      {/* Ruhetag-Hinweis */}
      {!restDay.loading && !statsLoading && (() => {
        const { restDaysThisWeek, isRestDayToday, consecutiveRestToday } = restDay;
        const _d = new Date(); _d.setHours(0,0,0,0); _d.setDate(_d.getDate() + 3 - (_d.getDay() + 6) % 7);
        const _w1 = new Date(_d.getFullYear(), 0, 4);
        const isoKW = 1 + Math.round(((_d.getTime() - _w1.getTime()) / 86_400_000 - 3 + (_w1.getDay() + 6) % 7) / 7);
        const streakBroken = consecutiveRestToday >= 2 || restDaysThisWeek > 2;

        if (streakBroken) return null;

        let msg: string | null = null;
        let color = 'text-slate-400';

        if (!isRestDayToday && restDaysThisWeek >= 2) {
          msg = '✅ Alle Ruhetage für diese Woche genutzt.';
          color = 'text-slate-400';
        }

        const dow = new Date().getDay();
        const isoDay = dow === 0 ? 7 : dow;
        const daysAfterToday = Math.max(0, 7 - isoDay);
        const hearts = Math.min(Math.max(0, 2 - restDaysThisWeek), daysAfterToday);

        if (hearts === 0 && !msg) return null;

        return (
          <div className="flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-2 text-xs">
            <span className={color}>{msg ?? `Ruhetage übrig für KW ${isoKW}:`}</span>
            <span className="text-sm leading-none">{'❤️'.repeat(hearts)}</span>
          </div>
        );
      })()}

      {/* Rückgängig-Banner */}
      {lastEntry && (
        <button
          onClick={undoLast}
          className="flex w-full animate-pop-in items-center justify-between rounded-xl border border-ink-700 bg-ink-800/70 px-4 py-2.5 text-sm"
        >
          <span className="text-slate-300">
            Zuletzt <strong className="text-slate-100">+{lastEntry.amount}</strong> eingetragen
          </span>
          <span className="font-semibold text-brand-300">Rückgängig</span>
        </button>
      )}

      {/* Ziele */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Ziele</CardTitle>
          {!((goal?.daily_goal ?? 0) === 0 && (goal?.weekly_goal ?? 0) === 0) && (
            <Link to="/settings" className="text-xs text-brand-400 hover:text-brand-300">
              Anpassen
            </Link>
          )}
        </div>
        {goalLoading ? (
          <p className="py-4 text-sm text-slate-500">Lade Ziele …</p>
        ) : (goal?.daily_goal ?? 0) === 0 && (goal?.weekly_goal ?? 0) === 0 ? (
          <div className="mt-2 flex flex-col items-center gap-2 py-3 text-center">
            <span className="text-3xl">🎯</span>
            <p className="text-sm text-slate-400">Noch keine Ziele gesetzt.</p>
            <Link to="/settings">
              <Button size="sm">Tagesziel setzen</Button>
            </Link>
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {(goal?.daily_goal ?? 0) > 0 && (
              <ProgressBar value={stats.today_amount} max={goal!.daily_goal} label="Tagesziel" />
            )}
            {(goal?.weekly_goal ?? 0) > 0 && (
              <ProgressBar
                value={stats.week_amount}
                max={goal!.weekly_goal}
                label="Wochenziel"
                colorClass="from-violet-500 to-fuchsia-400"
              />
            )}
          </div>
        )}
      </Card>

    </div>
  );
}
