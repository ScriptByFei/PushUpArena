import { useExercise } from '@/context/ExerciseContext';
import { usePodiumHistory } from '@/hooks/usePodiumHistory';
import { useDailyPodiumSlider } from '@/hooks/useDailyPodiumSlider';
import { Avatar } from '@/components/ui/Avatar';
import { PodiumDisplay } from '@/components/PodiumDisplay';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import type { PodiumRow } from '@/hooks/usePodiumHistory';

// ── Rang-Badge (kompakt, farbig) ──────────────────────────────────
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
  const myTotal = myRow.gold_count + myRow.silver_count + myRow.bronze_count;

  // Stärkste Medaille — Gold hat Priorität bei Gleichstand
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

  return (
    <div className="flex gap-2 overflow-x-auto pb-0.5">
      {/* Rang */}
      <div className="shrink-0 min-w-[88px] rounded-xl border border-ink-700 bg-ink-800/70 px-3 py-2 text-center">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Dein Rang</p>
        <p className="mt-0.5 text-[17px] font-extrabold text-slate-100">#{myRank}</p>
      </div>

      {/* Medaillen gesamt */}
      <div className="shrink-0 min-w-[88px] rounded-xl border border-ink-700 bg-ink-800/70 px-3 py-2 text-center">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Medaillen</p>
        <p className="mt-0.5 text-[17px] font-extrabold text-slate-100">{myTotal}</p>
      </div>

      {/* Stärkste Medaille */}
      <div className="shrink-0 min-w-[110px] rounded-xl border border-ink-700 bg-ink-800/70 px-3 py-2 text-center">
        <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-500">Stärkste Medaille</p>
        <p className="mt-0.5 text-[17px] font-extrabold text-slate-100">{strongestLabel}</p>
      </div>
    </div>
  );
}

// ── Motivationstext ───────────────────────────────────────────────
function MotivationText({ rows }: { rows: PodiumRow[] }) {
  const myIdx = rows.findIndex((r) => r.is_me);
  if (myIdx < 0) return null;

  const myRow = rows[myIdx];
  const myRank = myIdx + 1;
  const myTotal = myRow.gold_count + myRow.silver_count + myRow.bronze_count;
  const prevRow = myIdx > 0 ? rows[myIdx - 1] : null;

  let text = '';
  if (myRank === 1) {
    text = 'Du führst die Medaillenrangliste an! 🏆';
  } else if (myTotal === 0) {
    text = 'Heute kannst du deine erste Medaille gewinnen! 🎯';
  } else if (prevRow) {
    const goldGap = prevRow.gold_count - myRow.gold_count;
    const totalGap =
      (prevRow.gold_count + prevRow.silver_count + prevRow.bronze_count) -
      (myRow.gold_count + myRow.silver_count + myRow.bronze_count);
    if (goldGap === 1) {
      text = `Mit einer Goldmedaille überholst du Platz ${myRank - 1}.`;
    } else if (goldGap > 1) {
      text = `Dir fehlen noch ${goldGap} Goldmedaillen bis zum nächsten Rang.`;
    } else if (totalGap > 0) {
      text = `Dir fehlt noch ${totalGap === 1 ? '1 Medaille' : `${totalGap} Medaillen`} bis zum nächsten Rang.`;
    } else {
      text = `Du bist nah dran an Platz ${myRank - 1}!`;
    }
  }

  if (!text) return null;
  return (
    <div className="border-t border-ink-700/60 px-4 py-2.5 text-center">
      <p className="text-xs text-slate-400">{text}</p>
    </div>
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

  if (exLoading || loading) return <LoadingState label="Lade Erfolge …" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const formattedDate = selectedDate
    ? new Date(selectedDate + 'T12:00:00').toLocaleDateString('de-DE', {
        weekday: 'short',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '–';

  const canPrev = sliderIdx > 0 && !podiumLoading;
  const canNext = sliderIdx < dates.length - 1 && !podiumLoading;

  return (
    <div className="space-y-3 pb-4">

      {/* ── Tages-Podest ──────────────────────────────────────── */}
      {!datesLoading && dates.length > 0 && (
        <div className="rounded-2xl border border-ink-700 bg-ink-800/70 px-4 pb-3.5 pt-3">

          {/* Titel */}
          <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">
            🏆 Tages-Podest
          </p>

          {/* Datumsnavigation */}
          <div className="mt-1.5 flex items-center justify-center gap-1">
            <button
              onClick={() => setSliderIdx((i) => Math.max(0, i - 1))}
              disabled={!canPrev}
              aria-label="Vorheriger Tag"
              className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition active:scale-90 ${
                canPrev
                  ? 'text-slate-300 hover:bg-ink-700'
                  : 'cursor-default text-ink-600'
              }`}
            >
              ‹
            </button>
            <span className="min-w-[180px] text-center text-[13px] font-semibold text-slate-200">
              {formattedDate}
            </span>
            <button
              onClick={() => setSliderIdx((i) => Math.min(dates.length - 1, i + 1))}
              disabled={!canNext}
              aria-label="Nächster Tag"
              className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition active:scale-90 ${
                canNext
                  ? 'text-slate-300 hover:bg-ink-700'
                  : 'cursor-default text-ink-600'
              }`}
            >
              ›
            </button>
          </div>

          {/* Podest oder Ladestate */}
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
      <div className="rounded-2xl border border-ink-700 bg-ink-800/50 px-4 py-2.5 text-center">
        <div className="flex items-center justify-center gap-5">
          <span className="flex items-baseline gap-1 text-[11px] text-slate-400">
            <span className="text-base leading-none">🥇</span> Platz 1
          </span>
          <span className="flex items-baseline gap-1 text-[11px] text-slate-400">
            <span className="text-base leading-none">🥈</span> Platz 2
          </span>
          <span className="flex items-baseline gap-1 text-[11px] text-slate-400">
            <span className="text-base leading-none">🥉</span> Platz 3
          </span>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          Tägliche Vergabe · seit{' '}
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
            <div>
              <p className="text-[13px] font-extrabold leading-tight text-slate-100">
                Medaillenrangliste
              </p>
              <p className="text-[10px] text-slate-500">
                Gesamtwertung seit Beginn der Medaillenvergabe
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
            <div className="flex shrink-0">
              <span className="w-9 text-center text-base leading-none" aria-label="Goldmedaillen">🥇</span>
              <span className="w-9 text-center text-base leading-none" aria-label="Silbermedaillen">🥈</span>
              <span className="w-9 text-center text-base leading-none" aria-label="Bronzemedaillen">🥉</span>
            </div>
          </div>

          {/* Zeilen */}
          <ul className="divide-y divide-ink-700/50">
            {rows.map((row, idx) => (
              <li
                key={row.user_id}
                className={`flex items-center gap-2 px-4 py-2 ${
                  row.is_me
                    ? 'bg-brand-600/10 ring-1 ring-inset ring-brand-500/20'
                    : ''
                }`}
              >
                {/* Rang */}
                <span className="flex w-6 shrink-0 items-center justify-center">
                  <RankBadge idx={idx} />
                </span>

                {/* Avatar */}
                <Avatar
                  url={row.avatar_url}
                  name={row.display_name || row.username}
                  size={30}
                />

                {/* Name */}
                <div className="ml-1.5 min-w-0 flex-1">
                  <p
                    className={`truncate text-sm font-semibold ${
                      row.is_me ? 'text-white' : 'text-slate-200'
                    }`}
                  >
                    {row.display_name || row.username}
                    {row.is_me && (
                      <span className="ml-1 text-[11px] font-medium text-brand-300">(du)</span>
                    )}
                  </p>
                </div>

                {/* Medaillenzahlen */}
                <div className="flex shrink-0">
                  <span className="w-9 text-center text-sm font-bold tabular-nums text-amber-300">
                    {row.gold_count}
                  </span>
                  <span className="w-9 text-center text-sm font-bold tabular-nums text-slate-300">
                    {row.silver_count}
                  </span>
                  <span className="w-9 text-center text-sm font-bold tabular-nums text-orange-400">
                    {row.bronze_count}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {/* Motivationstext */}
          <MotivationText rows={rows} />
        </div>
      )}
    </div>
  );
}
