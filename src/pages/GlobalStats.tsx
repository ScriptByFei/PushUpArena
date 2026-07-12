import { useGlobalStats } from '@/hooks/useGlobalStats';
import { LoadingState, ErrorState } from '@/components/ui/States';

const WEEKLY_GOAL = 10_000;

const EXERCISES = [
  { slug: 'pushups', icon: 'pushup', label: 'PushUps', key: 'total_pushups' as const, text: 'text-brand-300',   glow: 'rgba(99,102,241,0.25)',  bar: 'bg-brand-500'   },
  { slug: 'pullups', icon: 'pullup', label: 'PullUps', key: 'total_pullups' as const, text: 'text-violet-300',  glow: 'rgba(139,92,246,0.25)', bar: 'bg-violet-500'  },
  { slug: 'dips',    icon: 'dips',   label: 'Dips',    key: 'total_dips'    as const, text: 'text-emerald-300', glow: 'rgba(16,185,129,0.25)', bar: 'bg-emerald-500' },
];

function timeAgo(d: Date): string {
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins === 1) return 'vor 1 Minute';
  return `vor ${mins} Minuten`;
}

export default function GlobalStats() {
  const { stats, loading, error } = useGlobalStats();

  if (loading) return <LoadingState label="Lade globale Statistik …" />;
  if (error || !stats) return <ErrorState message={error ?? 'Fehler beim Laden.'} />;

  const totalReps = stats.total_pushups + stats.total_pullups + stats.total_dips;
  const weeklyPct = WEEKLY_GOAL > 0
    ? Math.min(100, Math.round((stats.weekly_total / WEEKLY_GOAL) * 100))
    : 0;

  // Distribution %
  const pcts = EXERCISES.map((ex) =>
    totalReps > 0 ? Math.round((stats[ex.key] / totalReps) * 100) : 0
  );
  // Fix rounding so they sum to 100
  const diff = 100 - pcts.reduce((a, b) => a + b, 0);
  if (pcts[0] > 0) pcts[0] += diff;

  const community = [
    { icon: '👥', label: 'Members',          value: stats.total_members },
    { icon: '🔥', label: 'Aktiv (7 Tage)',   value: stats.active_members },
    { icon: '🟢', label: 'Heute aktiv',       value: stats.today_active },
    { icon: '📅', label: 'Neu diese Woche',   value: stats.new_this_week },
  ];

  const milestones = [
    { icon: '🏆', label: 'Gesamte Wiederholungen', value: totalReps.toLocaleString('de-DE'), sub: 'Alle Übungen zusammen' },
  ];

  return (
    <div className="space-y-3 pb-4">

      {/* ── Seitentitel ─────────────────────────────────── */}
      <div className="pb-1 pt-1 text-center">
        <h1 className="text-lg font-extrabold text-slate-100">Globale Statistik</h1>
        <p className="mt-0.5 text-[10px] text-slate-600">Aktualisiert · {timeAgo(stats.loaded_at)}</p>
      </div>

      {/* ── Hero ─────────────────────────────────────────── */}
      <div
        className="rounded-2xl border border-brand-500/20 px-4 py-5 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(8,8,15,0.88) 100%)',
          boxShadow: '0 0 40px rgba(99,102,241,0.10)',
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
          Gesamte Wiederholungen · Alle Übungen
        </p>
        <p
          className="mt-1 tabular-nums text-5xl font-black leading-none text-brand-300"
          style={{ textShadow: '0 0 32px rgba(99,102,241,0.55)' }}
        >
          {totalReps.toLocaleString('de-DE')}
        </p>
        <p className="mt-1.5 text-xs text-slate-500">Wiederholungen</p>
      </div>

      {/* ── Community Stats ──────────────────────────────── */}
      <div className="rounded-2xl border border-ink-700 bg-ink-800/70 px-4 py-3">
        <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Community</p>
        <div className="grid grid-cols-2 gap-2">
          {community.map(({ icon, label, value }) => (
            <div
              key={label}
              className="flex flex-col items-center justify-center rounded-xl bg-ink-900/60 py-2.5 text-center"
            >
              <span className="text-xl leading-none">{icon}</span>
              <span className="mt-1 tabular-nums text-lg font-extrabold leading-none text-slate-100">
                {value.toLocaleString('de-DE')}
              </span>
              <span className="mt-0.5 text-[9px] text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Exercise Breakdown ───────────────────────────── */}
      <div className="rounded-2xl border border-ink-700 bg-ink-800/70 px-4 py-3">
        <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Wiederholungen nach Übung</p>
        <div className="grid grid-cols-3 gap-2">
          {EXERCISES.map((ex, i) => (
            <div
              key={ex.slug}
              className="flex flex-col items-center justify-center rounded-xl border border-ink-700/60 bg-ink-900/60 py-3 text-center"
              style={{ boxShadow: `0 0 14px ${ex.glow}` }}
            >
              <img src={`/${ex.icon}-icon.png`} alt={ex.label} className="h-6 w-6 object-contain" />
              <span className={`mt-1.5 tabular-nums text-base font-extrabold leading-none ${ex.text}`}>
                {stats[ex.key].toLocaleString('de-DE')}
              </span>
              <span className="mt-1 text-[9px] text-slate-500">{ex.label}</span>
            </div>
          ))}
        </div>

        {/* Distribution bars */}
        {totalReps > 0 && (
          <div className="mt-3 space-y-1.5 border-t border-ink-700/50 pt-3">
            {EXERCISES.map((ex, i) => (
              <div key={ex.slug} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[10px] text-slate-400">{ex.label}</span>
                <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-ink-700/60">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${ex.bar}`}
                    style={{ width: `${pcts[i]}%` }}
                  />
                </div>
                <span className="w-7 shrink-0 text-right tabular-nums text-[10px] text-slate-500">
                  {pcts[i]}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Community Wochenziel ─────────────────────────── */}
      <div className="rounded-2xl border border-ink-700 bg-ink-800/70 px-4 py-3">
        <div className="mb-2.5 flex items-baseline justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Community Wochenziel</p>
          <span className="text-[11px] font-bold text-brand-300">{weeklyPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-700/60">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${weeklyPct}%`,
              background: 'linear-gradient(to right, #6366f1, #818cf8)',
              boxShadow: weeklyPct > 0 ? '0 0 8px rgba(99,102,241,0.5)' : 'none',
            }}
          />
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="tabular-nums text-sm font-bold text-slate-200">
            {stats.weekly_total.toLocaleString('de-DE')} Wdh.
          </span>
          <span className="text-[10px] text-slate-500">
            Ziel: {WEEKLY_GOAL.toLocaleString('de-DE')}
          </span>
        </div>
      </div>

      {/* ── Community Meilensteine ───────────────────────── */}
      <div
        className="rounded-2xl border border-brand-500/15 bg-ink-800/70 px-4 py-3"
        style={{ boxShadow: '0 0 0 1px rgba(99,102,241,0.07), 0 0 24px rgba(99,102,241,0.06)' }}
      >
        <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">Community Meilensteine</p>
        <div className="space-y-1.5">
          {milestones.map(({ icon, label, value, sub }) => (
            <div key={label} className="flex items-center gap-3 rounded-xl bg-ink-900/50 px-3 py-2.5">
              <span className="shrink-0 text-xl leading-none">{icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold leading-none text-slate-200">{label}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>
              </div>
              <span className="shrink-0 tabular-nums text-sm font-extrabold text-brand-300">{value}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
