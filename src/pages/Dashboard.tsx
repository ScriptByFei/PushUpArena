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

function InfoIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
    </svg>
  );
}

function StatTile({
  label,
  value,
  accent,
  icon,
  glowStyle,
  onInfoClick,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
  icon?: ReactNode;
  glowStyle?: CSSProperties;
  onInfoClick?: () => void;
}) {
  return (
    <div
      className="rounded-2xl border border-ink-700 bg-ink-800/70 p-3 flex flex-col items-center text-center"
      style={glowStyle}
    >
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {icon}
        {label}
        {onInfoClick && (
          <button
            onClick={(e) => { e.stopPropagation(); onInfoClick(); }}
            className="ml-0.5 text-slate-500 hover:text-slate-300 transition"
            aria-label="Streak-Info"
          >
            <InfoIcon />
          </button>
        )}
      </div>
      <div className={`mt-1.5 text-4xl font-extrabold leading-none ${accent ?? 'text-slate-100'}`}>{value}</div>
    </div>
  );
}

// ── Streak-Info Bottom Sheet ──────────────────────────────────────────────────
function StreakInfoSheet({ restDaysThisWeek, onClose }: { restDaysThisWeek: number; onClose: () => void }) {
  const remaining = Math.max(0, 2 - restDaysThisWeek);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />
        <p className="text-lg font-extrabold text-slate-100">🔥 So funktioniert deine Streak</p>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <p>Trainiere an so vielen Tagen wie möglich — deine Streak zählt jeden Tag, an dem du etwas einträgst.</p>
          <p>Du hast <span className="font-semibold text-amber-300">2 Ruhetage pro Woche</span> frei. Solange du nicht mehr als 2 Ruhetage pro Woche nimmst, bleibt deine Streak erhalten.</p>
          <p className="text-orange-400 font-semibold">⚠️ Zwei Ruhetage hintereinander brechen die Streak sofort.</p>
        </div>
        <div className="mt-5 rounded-2xl bg-ink-800 px-4 py-3 flex items-center justify-between">
          <span className="text-sm text-slate-400">Ruhetage übrig</span>
          <span className="text-base font-extrabold">
            {remaining > 0
              ? <span className="text-amber-300">{'❤️'.repeat(remaining)} <span className="text-xs font-normal text-slate-400">noch {remaining} frei</span></span>
              : <span className="text-red-400 text-sm font-semibold">aufgebraucht</span>}
          </span>
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-2xl bg-ink-700 py-3 text-sm font-semibold text-slate-200 hover:bg-ink-600 transition"
        >
          Verstanden
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { exercise, loading: exLoading, error: exError, reload } = useExercise();
  const { stats, loading: statsLoading, refetch: refetchStats } = useStats(exercise?.id);
  const { goal, loading: goalLoading } = useGoals(exercise?.id);
  const restDay = useRestDayInfo(exercise?.id);
  const toast = useToast();

  const [streakInfoOpen, setStreakInfoOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem('streakBannerDismissed') === '1'
  );

  function dismissBanner() {
    localStorage.setItem('streakBannerDismissed', '1');
    setBannerDismissed(true);
  }

  useEffect(() => {
    if (restDay.loading) return;
    if (restDay.consecutiveRestToday !== 1) return;

    const now = new Date();
    const today = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    const hour = parseInt(now.toLocaleString('en-US', { timeZone: 'Europe/Berlin', hour: 'numeric', hour12: false }), 10);

    // Nur ab 15 Uhr anzeigen — vorher hat der User noch Zeit zu trainieren
    if (hour < 15) return;

    // localStorage statt Modulvariable: überlebt App-Neustarts
    const shownKey = 'restWarnShownDate';
    if (localStorage.getItem(shownKey) === today) return;
    localStorage.setItem(shownKey, today);
    toast.warning('⚠️ Achtung: Zwei Ruhetage hintereinander brechen deine Streak.');
  }, [restDay.loading, restDay.consecutiveRestToday]);

  const [lastEntry, setLastEntry] = useState<{ id: string; amount: number } | null>(null);
  const undoTimer = useRef<number | undefined>(undefined);

  if (exLoading) return <LoadingState label="Lade Übung …" />;
  if (exError || !exercise) return <ErrorState message={exError ?? 'Übung fehlt.'} onRetry={reload} />;

  const streak = statsLoading ? 0 : (stats.current_streak ?? 0);
  const streakGlow: CSSProperties =
    streak >= 30
      ? { boxShadow: '0 0 18px 4px rgba(251,191,36,0.50), 0 0 32px 8px rgba(139,92,246,0.30)' }
      : streak >= 7
        ? { boxShadow: '0 0 0 1px rgba(251,191,36,0.28), 0 0 12px 3px rgba(251,191,36,0.18)' }
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

      {/* Einmaliges Streak-Onboarding-Banner */}
      {!bannerDismissed && (
        <div className="flex animate-pop-in items-start gap-3 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-4 py-3">
          <span className="text-xl leading-none">🔥</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-200">So funktioniert deine Streak</p>
            <p className="mt-0.5 text-xs text-slate-400">
              Bis zu 2 Ruhetage pro Woche erlaubt — aber nie zwei hintereinander.
            </p>
          </div>
          <button
            onClick={dismissBanner}
            className="shrink-0 text-slate-500 hover:text-slate-300 transition text-lg leading-none"
            aria-label="Schließen"
          >
            ×
          </button>
        </div>
      )}

      {/* Statistik-Kacheln */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Heute" value={statsLoading ? '–' : stats.today_amount} accent="text-brand-300" />
        <StatTile
          label="Streak"
          value={statsLoading ? '–' : <span><span className="inline-block animate-pulse">🔥</span><span className="ml-1 text-xl font-bold">{stats.current_streak}</span></span>}
          accent="text-amber-300"
          glowStyle={streakGlow}
          onInfoClick={() => setStreakInfoOpen(true)}
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
        <QuickAdd exerciseId={exercise.id} unit={unit} prevDailyTotal={statsLoading ? 0 : (stats.today_amount ?? 0)} onLogged={onLogged} />
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
          <div className="mt-3 space-y-5">
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

      {/* Streak-Info Bottom Sheet */}
      {streakInfoOpen && (
        <StreakInfoSheet
          restDaysThisWeek={restDay.restDaysThisWeek}
          onClose={() => setStreakInfoOpen(false)}
        />
      )}

    </div>
  );
}
