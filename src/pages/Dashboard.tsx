import { useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useExercise } from '@/context/ExerciseContext';
import { useProfile } from '@/hooks/useProfile';
import { useStats } from '@/hooks/useStats';
import { useGoals } from '@/hooks/useGoals';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import { levelProgress } from '@/lib/gamification';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { QuickAdd } from '@/components/QuickAdd';
import { FireIcon, BoltIcon } from '@/components/ui/icons';

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
      className="rounded-2xl border border-ink-700 bg-ink-800/70 p-4"
      style={glowStyle}
    >
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
  const toast = useToast();

  const [xpBurst, setXpBurst] = useState<{ id: number; amount: number } | null>(null);
  const [pulseKey, setPulseKey] = useState(0);
  const [lastEntry, setLastEntry] = useState<{ id: string; amount: number } | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);

  if (exLoading) return <LoadingState label="Lade Übung …" />;
  if (exError || !exercise) return <ErrorState message={exError ?? 'Übung fehlt.'} onRetry={reload} />;

  const progress = levelProgress(stats.total_amount);
  const streak = statsLoading ? 0 : (stats.current_streak ?? 0);
  const streakGlow: CSSProperties =
    streak >= 30
      ? { boxShadow: '0 0 18px 4px rgba(251,191,36,0.55), 0 0 32px 8px rgba(139,92,246,0.35)' }
      : streak >= 7
        ? { boxShadow: '0 0 14px 3px rgba(251,146,60,0.5)' }
        : {};

  const ringR = 46;
  const ringCirc = 2 * Math.PI * ringR;
  const ringOffset = ringCirc * (1 - (progress.xpForThisLevel > 0 ? progress.xpIntoLevel / progress.xpForThisLevel : 0));
  const unit = exercise.unit === 'reps' ? 'Wdh.' : exercise.unit;
  const isFresh = stats.total_amount === 0;

  function onLogged({ amount, entryId }: { amount: number; entryId: string }) {
    void refetchStats();
    setPulseKey((k) => k + 1);
    const id = Date.now();
    setXpBurst({ id, amount });
    window.setTimeout(() => setXpBurst((b) => (b?.id === id ? null : b)), 1000);
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
    <div className="space-y-4">
      {/* Level / XP */}
      <Card className="relative bg-gradient-to-br from-brand-700/40 to-ink-800/70">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-300">
              Hallo, {profile?.display_name || profile?.username || 'Athlet'} 👋
            </p>
            <p className="mt-1 flex items-center gap-2 text-3xl font-extrabold leading-none">
              <BoltIcon className="h-7 w-7 text-brand-300 animate-glow" />
              Level {progress.level}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Gesamt-XP</div>
            <div className="text-lg font-bold text-brand-200">{stats.total_amount}</div>
          </div>
        </div>

        <div className="relative mt-4 flex flex-col items-center">
          <div className="relative">
            {xpBurst && (
              <span
                key={xpBurst.id}
                className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 animate-xp-float text-sm font-bold text-brand-200 whitespace-nowrap"
              >
                +{xpBurst.amount} XP
              </span>
            )}
            {pulseKey > 0 && (
              <span
                key={pulseKey}
                className="pointer-events-none absolute inset-0 animate-pulse-ring rounded-full"
              />
            )}
            <svg width="120" height="120" viewBox="0 0 120 120">
              <defs>
                <linearGradient id="xp-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#a5b4fc" />
                </linearGradient>
              </defs>
              {/* Hintergrundkreis */}
              <circle cx="60" cy="60" r={ringR} fill="none" stroke="#1e293b" strokeWidth="8" />
              {/* Fortschrittskreis */}
              <circle
                cx="60"
                cy="60"
                r={ringR}
                fill="none"
                stroke="url(#xp-grad)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={ringCirc}
                strokeDashoffset={ringOffset}
                style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px' }}
              />
              {/* Mittelbeschriftung */}
              <text x="60" y="55" textAnchor="middle" fill="white" fontSize="16" fontWeight="800" fontFamily="inherit">
                Level {progress.level}
              </text>
              <text x="60" y="71" textAnchor="middle" fill="#94a3b8" fontSize="10" fontFamily="inherit">
                {progress.xpIntoLevel} / {progress.xpForThisLevel} XP
              </text>
            </svg>
          </div>
          <div className="mt-1 text-xs text-slate-500">noch {progress.xpToNext} XP</div>
        </div>

        {isFresh && (
          <p className="mt-3 text-xs text-brand-200/80">
            Dein erstes Level wartet – logge deine ersten 10 Liegestütze. 💪
          </p>
        )}
      </Card>

      {/* Statistik-Kacheln */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Heute" value={statsLoading ? '–' : stats.today_amount} accent="text-brand-300" />
        <StatTile label="Gesamt" value={statsLoading ? '–' : stats.total_amount} />
        <StatTile
          label="Streak"
          value={statsLoading ? '–' : `${stats.current_streak}🔥`}
          accent="text-amber-300"
          icon={<FireIcon className="h-3.5 w-3.5 text-amber-400" />}
          glowStyle={streakGlow}
        />
      </div>

      {/* Schnell-Eingabe */}
      <Card>
        <CardTitle>Schnell eintragen</CardTitle>
        <p className="mb-3 mt-0.5 text-xs text-slate-400">{exercise.name}</p>
        <QuickAdd exerciseId={exercise.id} unit={unit} onLogged={onLogged} />
      </Card>

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
