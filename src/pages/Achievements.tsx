import { useExercise } from '@/context/ExerciseContext';
import { usePodiumHistory } from '@/hooks/usePodiumHistory';
import { useDailyPodiumSlider } from '@/hooks/useDailyPodiumSlider';
import { Avatar } from '@/components/ui/Avatar';
import { PodiumDisplay } from '@/components/PodiumDisplay';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';

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
        weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
      })
    : '–';

  return (
    <div className="space-y-4">

      {/* ── Tages-Podest mit Datums-Slider ────────────────────────── */}
      {!datesLoading && dates.length > 0 && (
        <div className="rounded-2xl border border-ink-700 bg-ink-800/70 px-4 pb-5 pt-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500 text-center">
            🏆 Tages-Podest
          </p>

          {/* Datums-Anzeige */}
          <p className="text-center text-sm font-semibold text-slate-300 mb-3">
            {formattedDate}
          </p>

          {/* Schieberegler */}
          <div className="px-1 mb-4">
            <input
              type="range"
              min={0}
              max={dates.length - 1}
              value={sliderIdx}
              onChange={(e) => setSliderIdx(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                bg-ink-600 accent-brand-500
                [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-500
                [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-md"
            />
            <div className="flex justify-between mt-1 text-[10px] text-slate-600">
              <span>{new Date(dates[0] + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</span>
              <span>{new Date(dates[dates.length - 1] + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</span>
            </div>
          </div>

          {/* Podest */}
          {podiumLoading ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : top3 && top3.length > 0 ? (
            <PodiumDisplay entries={top3} />
          ) : (
            <p className="text-center text-sm text-slate-500 py-4">Keine Daten für diesen Tag.</p>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500 text-center">
        Täglich werden die globalen Top 3 mit Gold, Silber und Bronze ausgezeichnet.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="Noch keine Medaillen"
          description="Medaillen werden täglich um Mitternacht vergeben. Die Zählung startete ab dem 6. Juli 2026."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-800/70">
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Spieler</span>
            <div className="flex gap-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
              <span className="w-8 text-center">🥇</span>
              <span className="w-8 text-center">🥈</span>
              <span className="w-8 text-center">🥉</span>
            </div>
          </div>

          <ul className="divide-y divide-ink-700">
            {rows.map((row, idx) => {
              const TROPHIES = ['/trophy-gold.png', '/trophy-silver.png', '/trophy-bronze.png'];
              const trophy = TROPHIES[idx] ?? null;
              return (
                <li
                  key={row.user_id}
                  className={`flex items-center gap-3 px-4 py-3 ${row.is_me ? 'bg-brand-600/10' : ''}`}
                >
                  <span className="w-10 shrink-0 flex items-center justify-center">
                    {trophy
                      ? <img src={trophy} alt={`Platz ${idx + 1}`} className="w-10 h-10 object-contain" />
                      : <span className="text-sm font-bold text-slate-500">{idx + 1}</span>}
                  </span>
                  <Avatar url={row.avatar_url} name={row.display_name || row.username} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-200">
                      {row.display_name || row.username}
                      {row.is_me && <span className="ml-1 text-xs text-brand-300">(du)</span>}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-3 items-center">
                    <span className="w-8 text-center text-sm font-bold text-amber-300">{row.gold_count}</span>
                    <span className="w-8 text-center text-sm font-bold text-slate-300">{row.silver_count}</span>
                    <span className="w-8 text-center text-sm font-bold text-orange-400">{row.bronze_count}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
