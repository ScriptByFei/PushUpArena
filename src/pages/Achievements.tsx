import { useState } from 'react';
import { useExercise } from '@/context/ExerciseContext';
import { usePodiumHistory } from '@/hooks/usePodiumHistory';
import { useDailyPodiumSlider } from '@/hooks/useDailyPodiumSlider';
import { Avatar } from '@/components/ui/Avatar';
import { PodiumDisplay } from '@/components/PodiumDisplay';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import type { PodiumRow } from '@/hooks/usePodiumHistory';

// ── Rang-Badge ────────────────────────────────────────────────────
function RankBadge({ idx }: { idx: number }) {
  if (idx === 0) return <span className="text-[13px] leading-none" aria-label="Platz 1">🥇</span>;
  if (idx === 1) return <span className="text-[13px] leading-none" aria-label="Platz 2">🥈</span>;
  if (idx === 2) return <span className="text-[13px] leading-none" aria-label="Platz 3">🥉</span>;
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

  const chipCls = 'rounded-xl border border-ink-700 bg-ink-800/70 px-2 py-2 text-center';
  const labelCls = 'whitespace-nowrap text-[9px] font-semibold uppercase tracking-widest text-slate-500';
  const valueCls = 'mt-0.5 text-[17px] font-extrabold leading-tight text-slate-100';

  return (
    <div className="grid grid-cols-3 gap-2">
      <div className={chipCls}>
        <p className={labelCls}>Dein Rang</p>
        <p className={valueCls}>#{myRank}</p>
      </div>
      <div className={chipCls}>
        <p className={labelCls}>Punkte</p>
        <p className={valueCls}>{myRow.medal_points}</p>
      </div>
      <div className={chipCls}>
        <p className={labelCls}>Häufigste</p>
        <p className={valueCls}>{strongestLabel}</p>
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
    // Brauche prevRow.points + 1, um sicher den Rang zu übernehmen
    const needed = prevRow.medal_points - myRow.medal_points + 1;
    text = `Dir fehlen noch ${needed} ${needed === 1 ? 'Punkt' : 'Punkte'} bis zum nächsten Rang.`;
  }

  if (!text) return null;
  return (
    <div className="border-t border-ink-700/60 px-4 py-2.5 text-center">
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
  const formula = `${row.medal_points} Punkte = ${row.gold_count}×10 + ${row.silver_count}×5 + ${row.bronze_count}×2 + ${row.hundred_plus_days}×1`;

  return (
    <li className={`divide-y divide-ink-700/30 ${row.is_me ? 'bg-brand-600/10 ring-1 ring-inset ring-brand-500/20' : ''}`}>
      {/* Hauptzeile */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left active:bg-ink-700/20 transition-colors"
        aria-expanded={expanded}
      >
        <span className="flex w-6 shrink-0 items-center justify-center">
          <RankBadge idx={idx} />
        </span>
        <Avatar url={row.avatar_url} name={row.display_name || row.username} size={30} />
        <div className="ml-1.5 min-w-0 flex-1">
          <p className={`truncate text-sm font-semibold ${row.is_me ? 'text-white' : 'text-slate-200'}`}>
            {row.display_name || row.username}
            {row.is_me && (
              <span className="ml-1 text-[11px] font-medium text-brand-300">(du)</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="tabular-nums text-sm font-extrabold text-slate-100">
            {row.medal_points}
          </span>
          <span className="text-[10px] text-slate-500">P.</span>
          <span className={`ml-1 text-[10px] text-slate-500 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </div>
      </button>

      {/* Aufgeklappte Details */}
      {expanded && (
        <div className="bg-ink-900/50 px-4 py-2.5">
          {/* Medaillen + Bonus */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>
              <span className="mr-0.5">🥇</span>
              <span className="font-bold text-amber-300">{row.gold_count}</span>
            </span>
            <span>
              <span className="mr-0.5">🥈</span>
              <span className="font-bold text-slate-300">{row.silver_count}</span>
            </span>
            <span>
              <span className="mr-0.5">🥉</span>
              <span className="font-bold text-orange-400">{row.bronze_count}</span>
            </span>
            <span className="text-slate-400">
              <span className="mr-0.5">💪</span>
              <span className="font-bold text-slate-200">{row.hundred_plus_days}</span>
              <span className="ml-0.5 text-[10px]">× 100+</span>
            </span>
          </div>
          {/* Formel */}
          <p className="mt-1.5 text-[10px] text-slate-500">{formula}</p>
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
    <div className="space-y-3 pb-4">

      {/* ── Tages-Podest ──────────────────────────────────────── */}
      {!datesLoading && dates.length > 0 && (
        <div className="rounded-2xl border border-ink-700 bg-ink-800/70 px-4 pb-3.5 pt-3">
          <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
            🏆 Tages-Podest
          </p>
          <div className="mt-1.5 flex items-center justify-center gap-1">
            <button
              onClick={() => setSliderIdx((i) => Math.max(0, i - 1))}
              disabled={!canPrev}
              aria-label="Vorheriger Tag"
              className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition active:scale-90 ${
                canPrev ? 'text-slate-300 hover:bg-ink-700' : 'cursor-default text-ink-600'
              }`}
            >‹</button>
            <span className="min-w-[180px] text-center text-[13px] font-semibold text-slate-200">
              {formattedDate}
            </span>
            <button
              onClick={() => setSliderIdx((i) => Math.min(dates.length - 1, i + 1))}
              disabled={!canNext}
              aria-label="Nächster Tag"
              className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition active:scale-90 ${
                canNext ? 'text-slate-300 hover:bg-ink-700' : 'cursor-default text-ink-600'
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
      <div className="rounded-2xl border border-ink-700 bg-ink-800/50 px-4 py-2 text-center">
        <p className="text-xs font-medium text-slate-300">
          🏅 Tägliche Medaillen für die globalen Top 3
        </p>
        <p className="mt-0.5 text-[10px] text-slate-500">
          Vergabe seit dem{' '}
          <span className="font-semibold text-slate-400">6. Juli 2026</span>
        </p>
      </div>

      {/* ── Persönliche Kurzstatistik ─────────────────────────── */}
      {rows.length > 0 && <PersonalStats rows={rows} />}

      {/* ── Medaillenrangliste ────────────────────────────────── */}
      {rows.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="Noch keine Medaillen"
          description="Medaillen werden täglich um Mitternacht vergeben. Die Zählung startete ab dem 6. Juli 2026."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-800/70">

          {/* Abschnittstitel */}
          <div className="flex items-center gap-2.5 border-b border-ink-700/60 px-4 py-3">
            <span className="text-lg leading-none">🥇</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold leading-tight text-slate-100">
                Medaillenrangliste
              </p>
              <p className="text-[10px] text-slate-500">
                Gesamtwertung seit Beginn der Medaillenvergabe
              </p>
              <p className="mt-0.5 text-[10px] text-slate-600">
                🥇 10 · 🥈 5 · 🥉 2 · 💪100+ 1
              </p>
            </div>
          </div>

          {/* Tabellenkopf */}
          <div className="flex items-center bg-ink-900/40 px-4 py-1.5">
            <span className="w-6 shrink-0" />
            <span className="w-8 shrink-0" />
            <span className="ml-2 flex-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Spieler
            </span>
            <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Punkte
            </span>
          </div>

          {/* Zeilen */}
          <ul className="divide-y divide-ink-700/50">
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
    </div>
  );
}
