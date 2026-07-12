import { useState, useEffect, useRef } from 'react';
import { useExercise } from '@/context/ExerciseContext';
import { usePodiumHistory } from '@/hooks/usePodiumHistory';
import { useDailyPodiumSlider } from '@/hooks/useDailyPodiumSlider';
import { Avatar } from '@/components/ui/Avatar';
import { PodiumDisplay } from '@/components/PodiumDisplay';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import type { PodiumRow } from '@/hooks/usePodiumHistory';

// ── Count-Up Hook ─────────────────────────────────────────────────
function useCountUp(target: number, duration = 420) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return value;
}

// ── Rang-Badge ────────────────────────────────────────────────────
function RankBadge({ idx }: { idx: number }) {
  if (idx === 0) return <span className="text-base leading-none" aria-label="Platz 1">🥇</span>;
  if (idx === 1) return <span className="text-base leading-none" aria-label="Platz 2">🥈</span>;
  if (idx === 2) return <span className="text-base leading-none" aria-label="Platz 3">🥉</span>;
  return <span className="text-xs font-bold text-slate-500">{idx + 1}</span>;
}

// ── Persönliche Statistik ─────────────────────────────────────────
function PersonalStats({ rows }: { rows: PodiumRow[] }) {
  const myIdx = rows.findIndex((r) => r.is_me);
  if (myIdx < 0) return null;

  const myRow = rows[myIdx];
  const myRank = myIdx + 1;

  let bestEmoji = '';
  let bestCount = 0;
  if (myRow.gold_count >= myRow.silver_count && myRow.gold_count >= myRow.bronze_count) {
    bestEmoji = '🥇'; bestCount = myRow.gold_count;
  } else if (myRow.silver_count >= myRow.bronze_count) {
    bestEmoji = '🥈'; bestCount = myRow.silver_count;
  } else {
    bestEmoji = '🥉'; bestCount = myRow.bronze_count;
  }
  const strongestLabel = bestCount > 0 ? `${bestEmoji} ${bestCount}×` : 'Noch keine';
  const animatedPoints = useCountUp(myRow.medal_points);

  const labelCls = 'whitespace-nowrap text-[9px] font-semibold uppercase tracking-widest text-slate-500';

  return (
    <div className="grid grid-cols-3 gap-2 ach-slide-in" style={{ animationDelay: '60ms' }}>
      {/* Rang */}
      <div
        className="rounded-xl border border-white/[0.07] px-2 py-3 text-center active:scale-[1.02] transition-transform duration-200"
        style={{
          background: 'linear-gradient(145deg, rgba(30,32,48,0.9) 0%, rgba(20,22,36,0.95) 100%)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <p className={labelCls}>Dein Rang</p>
        <p className="mt-1 text-[22px] font-extrabold leading-tight text-slate-100">#{myRank}</p>
      </div>

      {/* Punkte — Haupt-Element mit Glow + Count-Up */}
      <div
        className="rounded-xl border border-brand-500/30 px-2 py-3 text-center active:scale-[1.02] transition-transform duration-200 points-card"
        style={{
          background: 'linear-gradient(145deg, rgba(79,70,229,0.15) 0%, rgba(30,32,48,0.95) 100%)',
          boxShadow: '0 4px 20px rgba(79,70,229,0.18), 0 1px 0 rgba(255,255,255,0.05) inset',
        }}
      >
        <p className={labelCls}>Punkte</p>
        <p
          className="mt-1 text-[26px] font-extrabold leading-tight text-white"
          style={{ textShadow: '0 0 8px rgba(129,140,248,0.3)' }}
        >
          {animatedPoints}
        </p>
      </div>

      {/* Häufigste */}
      <div
        className="rounded-xl border border-white/[0.07] px-2 py-3 text-center active:scale-[1.02] transition-transform duration-200"
        style={{
          background: 'linear-gradient(145deg, rgba(30,32,48,0.9) 0%, rgba(20,22,36,0.95) 100%)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <p className={labelCls}>Häufigste</p>
        <p className="mt-1 text-[22px] font-extrabold leading-tight text-slate-100">{strongestLabel}</p>
      </div>
    </div>
  );
}

// ── Motivationstext (punktebasiert) ──────────────────────────────
function MotivationText({ rows }: { rows: PodiumRow[] }) {
  const myIdx = rows.findIndex((r) => r.is_me);
  if (myIdx < 0) return null;

  const myRow = rows[myIdx];
  const myRank = myIdx + 1;
  const prevRow = myIdx > 0 ? rows[myIdx - 1] : null;

  let text = '';
  if (myRank === 1) {
    text = 'Du führst die Rangliste an! 🏆';
  } else if (myRow.medal_points === 0) {
    text = 'Heute kannst du deine erste Medaille gewinnen! 🎯';
  } else if (prevRow) {
    const needed = prevRow.medal_points - myRow.medal_points + 1;
    text = `Dir fehlen noch ${needed} ${needed === 1 ? 'Punkt' : 'Punkte'} bis zum nächsten Rang.`;
  }

  if (!text) return null;
  return (
    <div className="border-t border-ink-700/60 px-4 py-3 text-center">
      <p className="text-xs text-slate-400">{text}</p>
    </div>
  );
}

// ── Ranglisten-Zeile mit Aufklappmechanik ─────────────────────────
function LeaderboardRow({
  row,
  idx,
  expanded,
  onToggle,
}: {
  row: PodiumRow;
  idx: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const formula = `${row.medal_points} P. = ${row.gold_count}×6 + ${row.silver_count}×4 + ${row.bronze_count}×2 + ${row.hundred_plus_days}×1`;
  const isTop3 = idx < 3;

  return (
    <li className={`divide-y divide-ink-700/20 ${row.is_me ? 'bg-brand-600/10 ring-1 ring-inset ring-brand-500/20' : ''}`}>
      {/* Hauptzeile */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all duration-150 active:bg-ink-700/30 active:scale-[0.99]"
        aria-expanded={expanded}
      >
        {/* Rang */}
        <span className="flex w-6 shrink-0 items-center justify-center">
          <RankBadge idx={idx} />
        </span>
        {/* Avatar */}
        <Avatar url={row.avatar_url} name={row.display_name || row.username} size={34} />
        {/* Name */}
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${row.is_me ? 'text-white' : 'text-slate-200'}`}>
            {row.display_name || row.username}
            {row.is_me && (
              <span className="ml-1 text-[11px] font-medium text-brand-300">(du)</span>
            )}
          </p>
        </div>
        {/* Punkte-Badge */}
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-sm font-extrabold tabular-nums ${
              isTop3
                ? 'bg-brand-600/25 text-brand-200 ring-1 ring-brand-500/40'
                : 'bg-ink-700/60 text-slate-300 ring-1 ring-ink-600/50'
            }`}
          >
            {row.medal_points} <span className="text-[10px] font-semibold opacity-70">P</span>
          </span>
          <span className={`text-[10px] text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </div>
      </button>

      {/* Aufgeklappte Details */}
      {expanded && (
        <div className="bg-ink-900/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <span>🥇</span>
              <span className="font-bold text-amber-300">{row.gold_count}</span>
            </span>
            <span className="flex items-center gap-1">
              <span>🥈</span>
              <span className="font-bold text-slate-300">{row.silver_count}</span>
            </span>
            <span className="flex items-center gap-1">
              <span>🥉</span>
              <span className="font-bold text-orange-400">{row.bronze_count}</span>
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <span>💪</span>
              <span className="font-bold text-slate-200">{row.hundred_plus_days}</span>
              <span className="text-[10px]">× 100+</span>
            </span>
          </div>
          <p className="mt-2 text-[10px] text-slate-600">{formula}</p>
        </div>
      )}
    </li>
  );
}

// ── Hauptkomponente ───────────────────────────────────────────────
export default function Achievements() {
  const { enrolledExercises, loading: exLoading } = useExercise();
  const pushups = enrolledExercises.find((ex) => ex.slug === 'pushups');
  const { rows, loading, error, refetch } = usePodiumHistory(pushups?.id);
  const {
    dates,
    sliderIdx,
    setSliderIdx,
    top3,
    loading: podiumLoading,
    datesLoading,
    selectedDate,
  } = useDailyPodiumSlider(pushups?.id);

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  if (exLoading || loading) return <LoadingState label="Lade Erfolge …" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const formattedDate = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('de-DE', {
        weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
      })
    : '–';

  const canPrev = sliderIdx > 0 && !podiumLoading;
  const canNext = sliderIdx < dates.length - 1 && !podiumLoading;

  return (
    <div className="space-y-3.5 pb-8">

      {/* ── Tages-Podest ──────────────────────────────────────── */}
      {!datesLoading && dates.length > 0 && (
        <div
          className="overflow-hidden rounded-2xl border border-white/[0.06] px-4 pb-5 pt-3.5 ach-slide-in"
          style={{
            background: 'linear-gradient(160deg, rgba(24,26,40,0.97) 0%, rgba(18,20,32,0.99) 100%)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
            animationDelay: '0ms',
          }}
        >
          <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
            🏆 Tages-Podest
          </p>
          <div className="mt-2 flex items-center justify-center gap-1">
            <button
              onClick={() => setSliderIdx((i) => Math.max(0, i - 1))}
              disabled={!canPrev}
              aria-label="Vorheriger Tag"
              className={`flex h-10 w-10 items-center justify-center rounded-full text-xl transition active:scale-90 ${
                canPrev ? 'text-slate-200 hover:bg-ink-700' : 'cursor-default text-ink-700'
              }`}
            >‹</button>
            <span className="min-w-[180px] text-center text-[13px] font-semibold text-slate-200">
              {formattedDate}
            </span>
            <button
              onClick={() => setSliderIdx((i) => Math.min(dates.length - 1, i + 1))}
              disabled={!canNext}
              aria-label="Nächster Tag"
              className={`flex h-10 w-10 items-center justify-center rounded-full text-xl transition active:scale-90 ${
                canNext ? 'text-slate-200 hover:bg-ink-700' : 'cursor-default text-ink-700'
              }`}
            >›</button>
          </div>
          <div className="mt-2">
            {podiumLoading ? (
              <div className="flex justify-center py-5">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              </div>
            ) : top3 && top3.length > 0 ? (
              <PodiumDisplay entries={top3} />
            ) : (
              <p className="py-3 text-center text-sm text-slate-500">Keine Daten für diesen Tag.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Infobox ───────────────────────────────────────────── */}
      <div
        className="rounded-2xl border border-amber-500/15 px-5 py-3.5 text-center ach-slide-in"
        style={{
          background: 'linear-gradient(145deg, rgba(245,158,11,0.06) 0%, rgba(18,20,32,0.95) 100%)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.03)',
          animationDelay: '30ms',
        }}
      >
        <p className="text-[13px] font-bold text-slate-200">
          🏅 Tägliche Medaillen für die globalen Top 3
        </p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Vergabe seit dem{' '}
          <span className="font-semibold text-slate-400">6. Juli 2026</span>
        </p>
      </div>

      {/* ── Persönliche Kurzstatistik ─────────────────────────── */}
      {rows.length > 0 && <div className="-mt-1.5"><PersonalStats rows={rows} /></div>}

      {/* ── Medaillenrangliste ────────────────────────────────── */}
      {rows.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="Noch keine Medaillen"
          description="Medaillen werden täglich um Mitternacht vergeben. Die Zählung startete ab dem 6. Juli 2026."
        />
      ) : (
        <div
          className="overflow-hidden rounded-2xl border border-white/[0.06] ach-slide-in"
          style={{
            background: 'linear-gradient(180deg, rgba(24,26,40,0.95) 0%, rgba(18,20,30,0.98) 100%)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
            animationDelay: '90ms',
          }}
        >
          {/* Abschnittstitel */}
          <div className="flex items-center gap-3 border-b border-ink-700/50 px-4 py-3.5">
            <span className="text-xl leading-none">🥇</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold leading-tight text-slate-100">
                Medaillenrangliste
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Gesamtwertung seit Beginn der Medaillenvergabe
              </p>
              <p className="mt-0.5 text-[10px] text-slate-600">
                🥇 6 · 🥈 4 · 🥉 2 · 💪100+ 1
              </p>
            </div>
          </div>

          {/* Tabellenkopf */}
          <div className="flex items-center bg-ink-900/50 px-4 py-1.5">
            <span className="w-6 shrink-0" />
            <span className="w-9 shrink-0" />
            <span className="ml-3 flex-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              Spieler
            </span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
              Punkte
            </span>
          </div>

          {/* Zeilen */}
          <ul className="divide-y divide-ink-700/30">
            {rows.map((row, idx) => (
              <LeaderboardRow
                key={row.user_id}
                row={row}
                idx={idx}
                expanded={expandedUserId === row.user_id}
                onToggle={() =>
                  setExpandedUserId((prev) =>
                    prev === row.user_id ? null : row.user_id
                  )
                }
              />
            ))}
          </ul>

          {/* Motivationstext */}
          <MotivationText rows={rows} />
        </div>
      )}

      {/* ── CSS-Animationen ───────────────────────────────────── */}
      <style>{`
        @keyframes achSlideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .ach-slide-in {
          opacity: 0;
          animation: achSlideIn 0.28s ease-out forwards;
        }

        @keyframes pointsGlowPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(79,70,229,0.18), 0 1px 0 rgba(255,255,255,0.05) inset; }
          50%       { box-shadow: 0 4px 28px rgba(99,102,241,0.38), 0 0 18px rgba(99,102,241,0.22), 0 1px 0 rgba(255,255,255,0.07) inset; }
        }
        .points-card {
          animation: pointsGlowPulse 9s ease-in-out 1.5s infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .ach-slide-in  { animation: none; opacity: 1; }
          .points-card   { animation: none; }
        }
      `}</style>
    </div>
  );
}
