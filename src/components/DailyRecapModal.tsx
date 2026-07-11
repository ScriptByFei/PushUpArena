/**
 * DailyRecapModal – erscheint einmal pro Tag beim ersten App-Start
 * und zeigt den Rückblick auf den gestrigen Tag.
 * Redesign: Full-Screen mit Hero, Leistungs-Karte, Medaille, Podest
 */
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import type { DailyRecap, TopThreeEntry } from '@/hooks/useDailyRecap';

// ── Hilfsfunktionen ─────────────────────────────────────────────────────────

function medalLabel(medal: DailyRecap['yesterday_medal']): string {
  switch (medal) {
    case 'gold':   return 'Goldmedaille gesichert!';
    case 'silver': return 'Silbermedaille gesichert!';
    case 'bronze': return 'Bronzemedaille gesichert!';
    default:       return 'Dabei sein ist alles!';
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

function medalEmoji(medal: DailyRecap['yesterday_medal']): string {
  switch (medal) {
    case 'gold':   return '🥇';
    case 'silver': return '🥈';
    case 'bronze': return '🥉';
    default:       return '🏅';
  }
}

function MotivationalText({ medal, pushups }: { medal: DailyRecap['yesterday_medal']; pushups: number }) {
  if (pushups === 0) {
    return <span className="text-slate-400">Ruhte, um wieder anzugreifen.</span>;
  }
  if (medal === 'gold') {
    return <span className="text-slate-300">Unglaublich! <span className="font-bold text-brand-400">Platz 1</span> gehört dir!</span>;
  }
  if (medal === 'silver') {
    return <span className="text-slate-300">Stark! <span className="font-bold text-brand-400">Silber</span> erkämpft!</span>;
  }
  return (
    <span className="text-slate-300">
      Weiter so! <span className="font-bold text-brand-400">Jeder Push-up</span> zählt.
    </span>
  );
}

// ── Trend-Linie (SVG) ────────────────────────────────────────────────────────

function TrendLine({ positive }: { positive: boolean }) {
  const path = positive
    ? 'M0 34 C18 28, 36 20, 55 14 S78 7, 100 2'
    : 'M0 4 C18 10, 36 18, 55 24 S78 30, 100 34';
  const dotY = positive ? 2 : 34;
  return (
    <svg viewBox="0 0 100 36" className="h-9 w-28" fill="none" preserveAspectRatio="none">
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="1" />
        </linearGradient>
      </defs>
      <path d={path} stroke="url(#lineGrad)" strokeWidth="2" strokeLinecap="round" />
      <circle cx="100" cy={dotY} r="3" fill="#818cf8" />
    </svg>
  );
}

// ── Podest ───────────────────────────────────────────────────────────────────

const PODIUM_CFG = [
  {
    // P2 (links)
    ring: '2px solid #60a5fa',
    glow: '0 0 14px 2px rgba(96,165,250,0.35)',
    badgeBg: '#3b82f6',
    scoreColor: 'text-slate-300',
    size: 50,
    marginTop: 28,
    label: '2',
  },
  {
    // P1 (Mitte, erhöht)
    ring: '2px solid #f59e0b',
    glow: '0 0 20px 4px rgba(245,158,11,0.45)',
    badgeBg: '#d97706',
    scoreColor: 'text-amber-400',
    size: 68,
    marginTop: 0,
    label: '1',
  },
  {
    // P3 (rechts)
    ring: '2px solid #c2763a',
    glow: '0 0 14px 2px rgba(194,118,58,0.35)',
    badgeBg: '#c2510a',
    scoreColor: 'text-orange-400',
    size: 50,
    marginTop: 36,
    label: '3',
  },
] as const;

const PLATFORM_COLORS = [
  { bg: 'rgba(96,165,250,0.18)', shadow: '0 0 24px 8px rgba(96,165,250,0.12)' },
  { bg: 'rgba(245,158,11,0.25)', shadow: '0 0 32px 12px rgba(245,158,11,0.18)' },
  { bg: 'rgba(194,118,58,0.18)', shadow: '0 0 24px 8px rgba(194,118,58,0.12)' },
];
const PLATFORM_HEIGHTS = [16, 26, 10];

function Podium({ entries }: { entries: TopThreeEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank || b.pushups - a.pushups);
  const [first, second, third] = sorted;
  const display = [second, first, third]; // 2 – 1 – 3

  return (
    <div className="flex items-end justify-center gap-6 pt-5 pb-2">
      {display.map((entry, i) => {
        const cfg = PODIUM_CFG[i];
        const plat = PLATFORM_COLORS[i];
        const ph = PLATFORM_HEIGHTS[i];
        return (
          <div
            key={i}
            className="flex flex-col items-center"
            style={{ marginTop: cfg.marginTop }}
          >
            {entry ? (
              <>
                {/* Avatar mit Ring */}
                <div
                  className="relative rounded-full"
                  style={{ outline: cfg.ring, boxShadow: cfg.glow }}
                >
                  <Avatar url={entry.avatar} name={entry.name} size={cfg.size} />
                  {/* Nummer-Badge */}
                  <div
                    className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: cfg.badgeBg }}
                  >
                    {cfg.label}
                  </div>
                </div>
                <p className="mt-2 max-w-[72px] truncate text-center text-xs font-semibold text-slate-300">
                  {entry.name}
                </p>
                <p className={`text-sm font-extrabold ${cfg.scoreColor}`}>{entry.pushups}</p>
              </>
            ) : (
              <div
                className="rounded-full bg-ink-800"
                style={{ width: cfg.size, height: cfg.size }}
              />
            )}

            {/* Podest-Plattform */}
            <div
              className="relative mt-2 w-20 rounded-t"
              style={{ height: ph, background: plat.bg, boxShadow: plat.shadow }}
            />
          </div>
        );
      })}
    </div>
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

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const delta = recap.yesterday_pushups - recap.prev_day_pushups;
  const hasDelta = recap.prev_day_pushups > 0;
  const img = medalImage(recap.yesterday_medal);
  const top3 = recap.top_three ?? [];
  const isResting = recap.yesterday_pushups === 0 && !recap.yesterday_rank;

  const dateShort = new Date(recap.recap_date + 'T12:00:00').toLocaleDateString('de-DE', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });
  const dateLong = new Date(recap.recap_date + 'T12:00:00').toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  async function handleClose() {
    setVisible(false);
    await new Promise((r) => setTimeout(r, 220));
    onClose();
  }

  const medalBorder: Record<NonNullable<DailyRecap['yesterday_medal']>, string> = {
    gold:   'border-amber-500/50',
    silver: 'border-slate-400/40',
    bronze: 'border-orange-700/50',
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col bg-[#08080f] transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* ── Header ───────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center justify-between px-4 pb-2"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}
      >
        {/* Links: Schließen oder älter */}
        <button
          onClick={hasPrev ? onPrev : handleClose}
          disabled={navLoading && hasPrev}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 active:scale-95"
          aria-label={hasPrev ? 'Älter' : 'Schließen'}
        >
          ←
        </button>

        {/* Datum */}
        <span className="text-sm font-semibold text-brand-400">{dateShort}</span>

        {/* Rechts: Neuer oder Schließen */}
        {hasNext ? (
          <button
            onClick={onNext}
            disabled={navLoading}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 active:scale-95"
            aria-label="Neuer"
          >
            →
          </button>
        ) : (
          <button
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 active:scale-95"
            aria-label="Schließen"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Scrollbarer Inhalt ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <div className="relative px-6 pb-6 pt-2 text-center">
          {/* Hintergrund-Glow */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-72 w-72 rounded-full bg-brand-600/10 blur-3xl" />
          </div>

          <h1 className="relative text-3xl font-extrabold tracking-tight text-white">
            Arena-Rückblick
          </h1>
          <p className="relative mt-0.5 text-sm text-slate-400">{dateLong}</p>

          {/* Trophäe */}
          <div className="relative mx-auto mt-4 mb-3 w-fit">
            <div className="absolute inset-0 rounded-full bg-amber-500/10 blur-2xl" />
            <img
              src={img ?? '/trophy-gold.png'}
              alt="Trophäe"
              className="relative h-28 w-28 object-contain drop-shadow-[0_0_18px_rgba(251,191,36,0.35)]"
            />
          </div>

          <p className="relative text-sm leading-relaxed">
            <MotivationalText medal={recap.yesterday_medal} pushups={recap.yesterday_pushups} />
          </p>
        </div>

        {/* ── Karten ─────────────────────────────────────────────── */}
        {navLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-3 px-4 pb-28">

            {isResting ? (
              <div className="rounded-2xl border border-ink-700 bg-ink-900 p-5 text-center">
                <span className="text-4xl">💤</span>
                <p className="mt-2 text-base font-bold text-slate-200">Ruhetag</p>
                <p className="mt-1 text-sm text-slate-500">Kein Training eingetragen.</p>
              </div>
            ) : (
              <>
                {/* Karte 1 – Leistung */}
                <div className="rounded-2xl border border-brand-500/35 bg-ink-900 p-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-brand-400">
                    💪 Deine Leistung
                  </p>
                  <div className="flex items-start justify-between gap-2">
                    {/* Linke Seite */}
                    <div className="flex-1">
                      <p className="text-5xl font-extrabold leading-none text-white">
                        {recap.yesterday_pushups}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">Push-ups</p>
                      <div className="mt-3">
                        <TrendLine positive={delta >= 0 || !hasDelta} />
                      </div>
                    </div>

                    {/* Rang-Kreis */}
                    {recap.yesterday_rank != null && (
                      <div className="flex shrink-0 flex-col items-center">
                        <div className="flex h-[74px] w-[74px] flex-col items-center justify-center rounded-full border-2 border-brand-500 bg-brand-600/10">
                          <span className="text-2xl font-extrabold text-brand-400">
                            #{recap.yesterday_rank}
                          </span>
                        </div>
                        <p className="mt-1.5 text-center text-[10px] leading-tight text-slate-500">
                          Platzierung<br />von allen
                        </p>
                      </div>
                    )}
                  </div>

                  {hasDelta && (
                    <div className="mt-3">
                      <p className={`flex items-center gap-1 text-sm font-semibold ${
                        delta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        <span>{delta >= 0 ? '↑' : '↓'}</span>
                        <span>
                          {Math.abs(delta)} {delta >= 0 ? 'mehr' : 'weniger'} als gestern
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Gestern: {recap.prev_day_pushups} Push-ups
                      </p>
                    </div>
                  )}
                </div>

                {/* Karte 2 – Medaille */}
                {img && recap.yesterday_medal && (
                  <div className={`relative overflow-hidden rounded-2xl border bg-ink-900 p-4 ${
                    medalBorder[recap.yesterday_medal]
                  }`}>
                    {/* Sparkles */}
                    <div className="pointer-events-none absolute right-4 top-4 flex items-end gap-2">
                      {[12, 8, 16].map((size, i) => (
                        <div
                          key={i}
                          className="rounded-full bg-amber-400 animate-pulse"
                          style={{
                            width: size / 2,
                            height: size / 2,
                            animationDelay: `${i * 220}ms`,
                            opacity: 0.5 + i * 0.15,
                          }}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-amber-700/40 bg-amber-900/20">
                        <img
                          src={img}
                          alt={recap.yesterday_medal}
                          className="h-12 w-12 object-contain"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500">
                          {medalEmoji(recap.yesterday_medal)} Deine Medaille
                        </p>
                        <p className="mt-1 text-lg font-extrabold leading-tight text-white">
                          {medalLabel(recap.yesterday_medal)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Top-3 in der globalen Tageswertung
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Karte 3 – Top 3 */}
                {top3.length > 0 && (
                  <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                      🏆 Top 3 dieses Tages
                    </p>
                    <Podium entries={top3} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <div
        className="shrink-0 bg-gradient-to-t from-[#08080f] via-[#08080f]/90 to-transparent px-4 pt-3"
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleClose}
          className="w-full rounded-2xl bg-brand-600 py-3.5 text-base font-extrabold text-white
            shadow-[0_0_24px_rgba(99,102,241,0.4)] transition hover:bg-brand-500 active:scale-[0.98]"
        >
          💪 Los geht's!
        </button>
      </div>
    </div>
  );
}
