/**
 * DailyRecapModal – erscheint einmal pro Tag beim ersten App-Start
 * und zeigt den Rückblick auf den gestrigen Tag.
 */
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import type { DailyRecap, TopThreeEntry } from '@/hooks/useDailyRecap';

// ── Hilfsfunktionen ─────────────────────────────────────────────────────────

function medalLabel(medal: DailyRecap['yesterday_medal']): string {
  switch (medal) {
    case 'gold':   return 'Du hast gestern Gold gewonnen! 🎉';
    case 'silver': return 'Silbermedaille gestern!';
    case 'bronze': return 'Bronzemedaille gestern!';
    default:       return 'Heute wartet eine neue Chance.';
  }
}

function medalImage(medal: DailyRecap['yesterday_medal']): string | null {
  switch (medal) {
    case 'gold':   return '/trophy-gold.png';
    case 'silver': return '/trophy-silver.png';
    case 'bronze': return '/trophy-bronze.png';
    default:       return null;
  }
}

function rankSuffix(rank: number): string {
  return rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th';
}

// ── Podest ──────────────────────────────────────────────────────────────────

function Podium({ entries }: { entries: TopThreeEntry[] }) {
  // Sortiere nach Rang (dann Pushups absteigend bei Gleichstand), nimm erste 3 positional.
  // So werden Gleichstände korrekt im Podest angezeigt (z.B. zwei Rang-2-Einträge).
  const sorted = [...entries].sort((a, b) => a.rank - b.rank || b.pushups - a.pushups);
  const [first, second, third] = sorted;

  const heights = ['h-20', 'h-14', 'h-10'];
  // Reihenfolge: 2 – 1 – 3
  const display = [second, first, third];
  const displayHeights = [heights[1], heights[0], heights[2]];
  const medals = ['🥈', '🥇', '🥉'];
  const textColors = ['text-slate-300', 'text-amber-300', 'text-orange-400'];
  const delays = ['delay-[200ms]', 'delay-[0ms]', 'delay-[400ms]'];

  return (
    <div className="flex items-end justify-center gap-3">
      {display.map((entry, i) => (
        <div
          key={i}
          className={`flex flex-col items-center gap-1 opacity-0 animate-[fadeUp_0.4s_ease-out_forwards] ${delays[i]}`}
        >
          {entry ? (
            <>
              <Avatar url={entry.avatar} name={entry.name} size={40} className="ring-2 ring-ink-700" />
              <span className="text-[10px] text-slate-400 text-center max-w-[64px] truncate">{entry.name}</span>
              <span className={`text-xs font-bold ${textColors[i]}`}>{entry.pushups}</span>
            </>
          ) : (
            <div className="h-10 w-10 rounded-full bg-ink-700/50" />
          )}
          {/* Podest-Block */}
          <div className={`w-[72px] ${displayHeights[i]} rounded-t-xl flex items-start justify-center pt-1.5 ${
            i === 1
              ? 'bg-gradient-to-b from-amber-500/30 to-amber-700/10 border border-amber-500/20'
              : i === 0
                ? 'bg-gradient-to-b from-slate-500/20 to-slate-700/10 border border-slate-600/20'
                : 'bg-gradient-to-b from-orange-600/20 to-orange-800/10 border border-orange-600/20'
          }`}>
            <span className="text-base">{medals[i]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Karten ──────────────────────────────────────────────────────────────────

function Card({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div
      className="rounded-2xl border border-ink-700 bg-ink-800/80 p-4 opacity-0 animate-[fadeUp_0.35s_ease-out_forwards]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
      {children}
    </p>
  );
}

// ── Hauptkomponente ──────────────────────────────────────────────────────────

interface Props {
  recap: DailyRecap;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  navLoading?: boolean;
}

export function DailyRecapModal({
  recap,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  navLoading = false,
}: Props) {
  const [visible, setVisible] = useState(false);

  // Einblend-Animation nach Mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const delta = recap.yesterday_pushups - recap.prev_day_pushups;
  const hasDelta = recap.prev_day_pushups > 0;
  const img = medalImage(recap.yesterday_medal);
  const top3 = recap.top_three ?? [];

  async function handleClose() {
    setVisible(false);
    await new Promise((r) => setTimeout(r, 250));
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Hintergrund-Overlay */}
      <div
        className={`absolute inset-0 bg-ink-950/90 backdrop-blur-sm transition-opacity duration-250 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
      />

      {/* Modal-Sheet von unten */}
      <div
        className={`relative mt-auto flex max-h-[92dvh] w-full flex-col rounded-t-3xl border-t border-ink-700
          bg-ink-900 transition-transform duration-250 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Drag-Handle */}
        <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-ink-600" />

        {/* ── Datums-Navigation ──────────────────────────────────────── */}
        {(onPrev || onNext) && (
          <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
            <button
              onClick={onPrev}
              disabled={!hasPrev || navLoading}
              className={`rounded-full p-2 transition ${
                hasPrev && !navLoading
                  ? 'text-slate-300 hover:bg-ink-700 active:scale-95'
                  : 'text-ink-600 cursor-default'
              }`}
              aria-label="Vorheriger Tag"
            >
              ←
            </button>
            <p className="text-xs font-semibold text-slate-400">
              {new Date(recap.recap_date + 'T12:00:00').toLocaleDateString('de-DE', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
              })}
            </p>
            <button
              onClick={onNext}
              disabled={!hasNext || navLoading}
              className={`rounded-full p-2 transition ${
                hasNext && !navLoading
                  ? 'text-slate-300 hover:bg-ink-700 active:scale-95'
                  : 'text-ink-600 cursor-default'
              }`}
              aria-label="Nächster Tag"
            >
              →
            </button>
          </div>
        )}

        {/* Scrollbarer Inhalt */}
        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">

          {/* Titel */}
          <div
            className={`mb-5 text-center transition-all duration-300 ${
              visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
            }`}
          >
            <p className="text-xl font-extrabold text-slate-100">🏆 Arena-Rückblick</p>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(recap.recap_date + 'T12:00:00').toLocaleDateString('de-DE', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </p>
          </div>

          {/* Navigations-Ladeindikator */}
          {navLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : (

          <div className="space-y-3">
            {recap.yesterday_pushups === 0 && !recap.yesterday_rank ? (
              /* ── Ruhetag ─────────────────────────────────────── */
              <Card delay={80}>
                <div className="flex flex-col items-center py-3 text-center gap-2">
                  <span className="text-4xl">💤</span>
                  <p className="text-base font-bold text-slate-200">Ruhetag</p>
                  <p className="text-sm text-slate-500">Kein Training an diesem Tag eingetragen.</p>
                </div>
              </Card>
            ) : (
              /* ── Karte 1: Leistung ────────────────────────────── */
              <Card delay={80}>
                <SectionLabel>💪 Deine Leistung</SectionLabel>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-extrabold text-slate-100 leading-none">
                      {recap.yesterday_pushups}
                    </p>
                    <p className="mt-1 text-sm text-slate-400">Push-ups</p>
                  </div>
                  <div className="text-right">
                    {recap.yesterday_rank ? (
                      <>
                        <p className="text-2xl font-extrabold text-brand-300">
                          #{recap.yesterday_rank}
                        </p>
                        <p className="text-xs text-slate-500">Platzierung</p>
                      </>
                    ) : (
                      <p className="text-sm text-slate-500">–</p>
                    )}
                  </div>
                </div>
                {hasDelta && (
                  <div className={`mt-3 flex items-center gap-1.5 text-sm font-semibold ${
                    delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    <span>{delta >= 0 ? '↑' : '↓'}</span>
                    <span>
                      {Math.abs(delta)} zum Vortag ({recap.prev_day_pushups} Push-ups)
                    </span>
                  </div>
                )}
              </Card>
            )}

            {/* ── Karte 2: Medaille (nur wenn trainiert) ────────── */}
            {(recap.yesterday_pushups > 0 || recap.yesterday_rank) && (
              <Card delay={180}>
                <SectionLabel>🏅 Deine Medaille</SectionLabel>
                <div className="flex items-center gap-4">
                  {img ? (
                    <img
                      src={img}
                      alt={recap.yesterday_medal ?? ''}
                      className={`h-16 w-16 object-contain shrink-0 ${
                        recap.yesterday_medal === 'gold' ? 'animate-glow drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]' : ''
                      }`}
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ink-700 text-3xl">
                      🎯
                    </div>
                  )}
                  <div>
                    <p className="text-base font-bold text-slate-100 leading-snug">
                      {medalLabel(recap.yesterday_medal)}
                    </p>
                    {recap.yesterday_medal && (
                      <p className="mt-1 text-xs text-slate-500">
                        Top-3 in der globalen Tageswertung
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* ── Karte 3: Top 3 ───────────────────────────────── */}
            {top3.length > 0 && (
              <Card delay={300}>
                <SectionLabel>🏆 Top 3 dieses Tages</SectionLabel>
                <Podium entries={top3} />
                {/* Detailzeilen */}
                <div className="mt-4 space-y-2">
                  {top3.map((entry) => (
                    <div key={entry.rank} className="flex items-center gap-3">
                      <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-500">
                        {entry.rank}.
                      </span>
                      <Avatar url={entry.avatar} name={entry.name} size={28} />
                      <span className="flex-1 truncate text-sm text-slate-200">{entry.name}</span>
                      <span className="shrink-0 text-sm font-bold text-brand-300">{entry.pushups}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
          )} {/* end navLoading ternary */}
        </div>

        {/* ── CTA ──────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-ink-800 bg-ink-900 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
          <button
            onClick={handleClose}
            className="w-full rounded-2xl bg-brand-600 py-3.5 text-base font-extrabold text-white
              shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:bg-brand-500 transition active:scale-[0.98]"
          >
            💪 Heute angreifen
          </button>
        </div>
      </div>

      {/* CSS für fadeUp-Animation */}
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
