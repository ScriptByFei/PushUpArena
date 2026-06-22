import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useExercise } from '@/context/ExerciseContext';
import { useProfile } from '@/hooks/useProfile';
import { useStats } from '@/hooks/useStats';
import { useGoals } from '@/hooks/useGoals';
import { useAchievements } from '@/hooks/useAchievements';
import { levelProgress } from '@/lib/gamification';
import { Card, CardTitle } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { QuickAdd } from '@/components/QuickAdd';
import { FireIcon, BoltIcon } from '@/components/ui/icons';

function StatTile({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string | number;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-800/70 p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </div>
      <div className={`mt-1 text-2xl font-extrabold ${accent ?? 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { exercise, loading: exLoading, error: exError, reload } = useExercise();
  const { profile } = useProfile();
  const { stats, loading: statsLoading, refetch: refetchStats } = useStats(exercise?.id);
  const { goal, loading: goalLoading } = useGoals(exercise?.id);
  const { items, unlockedCount, refetch: refetchAchievements } = useAchievements();

  if (exLoading) return <LoadingState label="Lade Übung …" />;
  if (exError || !exercise) return <ErrorState message={exError ?? 'Übung fehlt.'} onRetry={reload} />;

  const progress = levelProgress(stats.total_amount);
  const unit = exercise.unit === 'reps' ? 'Wdh.' : exercise.unit;
  const recentBadges = items.filter((i) => i.unlocked).slice(0, 4);

  const onLogged = () => {
    void refetchStats();
    void refetchAchievements();
  };

  return (
    <div className="space-y-4">
      {/* Level / XP */}
      <Card className="bg-gradient-to-br from-brand-700/40 to-ink-800/70">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-300">
              Hallo, {profile?.display_name || profile?.username || 'Athlet'} 👋
            </p>
            <p className="mt-0.5 flex items-center gap-2 text-2xl font-extrabold">
              <BoltIcon className="h-6 w-6 text-brand-300" />
              Level {progress.level}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Gesamt-XP</div>
            <div className="text-lg font-bold text-brand-200">{stats.total_amount}</div>
          </div>
        </div>
        <div className="mt-4">
          <ProgressBar
            value={progress.xpIntoLevel}
            max={progress.xpForThisLevel}
            label={`Bis Level ${progress.level + 1}`}
            showValues={false}
          />
          <p className="mt-1 text-right text-xs text-slate-400">
            noch {progress.xpToNext} XP
          </p>
        </div>
      </Card>

      {/* Statistik-Kacheln */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          label="Heute"
          value={statsLoading ? '–' : stats.today_amount}
          accent="text-brand-300"
        />
        <StatTile label="Gesamt" value={statsLoading ? '–' : stats.total_amount} />
        <StatTile
          label="Streak"
          value={statsLoading ? '–' : `${stats.current_streak}🔥`}
          accent="text-amber-300"
          icon={<FireIcon className="h-3.5 w-3.5 text-amber-400" />}
        />
      </div>

      {/* Schnell-Eingabe */}
      <Card>
        <CardTitle>Schnell eintragen</CardTitle>
        <p className="mb-3 mt-0.5 text-xs text-slate-400">{exercise.name}</p>
        <QuickAdd exerciseId={exercise.id} unit={unit} onLogged={onLogged} />
      </Card>

      {/* Ziele */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Ziele</CardTitle>
          <Link to="/settings" className="text-xs text-brand-400 hover:text-brand-300">
            Anpassen
          </Link>
        </div>
        {goalLoading ? (
          <p className="py-4 text-sm text-slate-500">Lade Ziele …</p>
        ) : (goal?.daily_goal ?? 0) === 0 && (goal?.weekly_goal ?? 0) === 0 ? (
          <p className="py-4 text-sm text-slate-400">
            Du hast noch keine Ziele gesetzt.{' '}
            <Link to="/settings" className="text-brand-400 underline">
              Jetzt festlegen
            </Link>
            .
          </p>
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

      {/* Badges */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Badges ({unlockedCount})</CardTitle>
          <Link to="/profile" className="text-xs text-brand-400 hover:text-brand-300">
            Alle ansehen
          </Link>
        </div>
        {recentBadges.length === 0 ? (
          <p className="py-3 text-sm text-slate-400">
            Noch keine Badges – leg los und schalte dein erstes frei!
          </p>
        ) : (
          <div className="mt-3 flex gap-3">
            {recentBadges.map((b) => (
              <div key={b.id} className="flex flex-col items-center gap-1" title={b.description}>
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/15 text-2xl">
                  {b.icon}
                </span>
                <span className="max-w-[64px] truncate text-[10px] text-slate-400">{b.name}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
