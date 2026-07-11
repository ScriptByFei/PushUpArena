/**
 * DailyRecapModal – Premium-Redesign
 * Medaillenvergabe als emotionaler Höhepunkt des Tages-Recaps.
 */
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import type { DailyRecap, TopThreeEntry, MedalCounts } from '@/hooks/useDailyRecap';

// ── Konfetti (Gold) ──────────────────────────────────────────────────────────

const CONFETTI_PARTICLES = Array.from({ length: 40 }, (_, i) => ({
  left:     `${3 + (i * 23.7 + i * i * 0.3) % 94}%`,
  delay:    `${(i * 0.06) % 0.75}s`,
  duration: `${0.75 + (i * 0.09) % 0.55}s`,
  color:    ['#fbbf24','#f59e0b','#fcd34d','#ffffff','#a78bfa','#c4b5fd','#fb923c'][(i * 7) % 7],
  size:     `${3 + (i * 2.9) % 6}px`,
  isRect:   i % 3 === 0,
}));

function Confetti() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden" style={{ height: '100%' }}>
      {CONFETTI_PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute top-0 confetti-fall"
          style={{
            left: p.left,
            width: p.isRect ? `${parseInt(p.size) * 1.5}px` : p.size,
            height: p.size,
            background: p.color,
            borderRadius: p.isRect ? '2px' : '50%',
            animationDelay: p.delay,
            animationDuration: p.duration,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

// ── Partikel (Silber / Bronze) ───────────────────────────────────────────────

const SPARKLE_POS = [
  { top: '8%',  right: '10%', size: 6,  delay: '0ms' },
  { top: '18%', right: '5%',  size: 4,  delay: '150ms' },
  { top: '5%',  right: '25%', size: 3,  delay: '80ms' },
  { top: '25%', right: '15%', size: 5,  delay: '220ms' },
  { top: '12%', right: '32%', size: 3,  delay: '340ms' },
  { top: '30%', right: '8%',  size: 4,  delay: '180ms' },
  { top: '8%',  left:  '10%', size: 5,  delay: '60ms' },
  { top: '20%', left:  '7%',  size: 3,  delay: '280ms' },
  { top: '28%', left:  '18%', size: 4,  delay: '120ms' },
];

function Sparkles({ color }: { color: string }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {SPARKLE_POS.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full sparkle-pulse"
          style={{
            top: s.top,
            right: 'right' in s ? (s as { right: string }).right : undefined,
            left: 'left' in s ? (s as { left: string }).left : undefined,
            width: s.size,
            height: s.size,
            background: color,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}

// ── Medal-Konfiguration ──────────────────────────────────────────────────────

const MEDAL_CFG = {
  gold: {
    border:        'rgba(245,158,11,0.6)',
    bg:            'rgba(245,158,11,0.08)',
    glow:          '0 0 48px 12px rgba(245,158,11,0.25), 0 0 100px 24px rgba(245,158,11,0.10)',
    glowColor:     'rgba(251,191,36,0.35)',
    label:         '🥇 Medaille verliehen',
    labelColor:    '#f59e0b',
    title:         'Goldmedaille erhalten!',
    subtitle:      'Du warst heute die Nummer 1 weltweit.',
    motivation:    'Heute warst du unschlagbar.',
    countLabel:    'Goldmedaille',
    countLabelPl:  'Goldmedaillen',
    sparkleColor:  '#fbbf24',
    confetti:      true,
  },
  silver: {
    border:        'rgba(148,163,184,0.55)',
    bg:            'rgba(148,163,184,0.07)',
    glow:          '0 0 40px 10px rgba(148,163,184,0.20), 0 0 80px 20px rgba(148,163,184,0.08)',
    glowColor:     'rgba(203,213,225,0.30)',
    label:         '🥈 Medaille verliehen',
    labelColor:    '#94a3b8',
    title:         'Silbermedaille erhalten!',
    subtitle:      'Du hast heute Platz 2 erreicht.',
    motivation:    null,
    countLabel:    'Silbermedaille',
    countLabelPl:  'Silbermedaillen',
    sparkleColor:  '#cbd5e1',
    confetti:      false,
  },
  bronze: {
    border:        'rgba(194,118,58,0.55)',
    bg:            'rgba(194,118,58,0.07)',
    glow:          '0 0 40px 10px rgba(194,118,58,0.20), 0 0 80px 20px rgba(194,118,58,0.08)',
    glowColor:     'rgba(194,118,58,0.30)',
    label:         '🥉 Medaille verliehen',
    labelColor:    '#c2763a',
    title:         'Bronzemedaille erhalten!',
    subtitle:      'Du warst heute unter den drei stärksten Athleten.',
    motivation:    'Weiter so! Morgen wartet vielleicht Silber.',
    countLabel:    'Bronzemedaille',
    countLabelPl:  'Bronzemedaillen',
    sparkleColor:  '#c2763a',
    confetti:      false,
  },
} as const;

function medalImage(medal: DailyRecap['yesterday_medal']): string | null {
  switch (medal) {
    case 'gold':   return '/trophy-gold.png';
    case 'silver': return '/trophy-silver.png';
    case 'bronze': return '/trophy-bronze.png';
    default:       return null;
  }
}

// ── Award-Karte ──────────────────────────────────────────────────────────────

function MedalAwardCard({
  medal,
  counts,
}: {
  medal: NonNullable<DailyRecap['yesterday_medal']>;
  counts: MedalCounts | null;
}) {
  const cfg = MEDAL_CFG[medal];
  const img = medalImage(medal);
  const total = counts ? counts[medal] : null;

  return (
    <div
      className="relative overflow-hidden rounded-3xl medal-reveal"
      style={{
        border: `1.5px solid ${cfg.border}`,
        background: cfg.bg,
        boxShadow: cfg.glow,
        padding: '28px 20px',
      }}
    >
      {cfg.confetti && <Confetti />}
      {!cfg.confetti && <Sparkles color={cfg.sparkleColor} />}

      {/* Großer Hintergrund-Glow hinter der Medaille */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        <div
          className="h-48 w-48 rounded-full medal-glow-pulse"
          style={{ background: `radial-gradient(circle, ${cfg.glowColor} 0%, transparent 70%)` }}
        />
      </div>

      {/* Label */}
      <p
        className="relative mb-4 text-center text-xs font-bold uppercase tracking-widest"
        style={{ color: cfg.labelColor }}
      >
        {cfg.label}
      </p>

      {/* Medaillen-Bild */}
      <div className="relative flex justify-center">
        <div className="medal-image-reveal">
          <img
            src={img ?? '/trophy-gold.png'}
            alt={medal}
            className="h-28 w-28 object-contain"
            style={{ filter: `drop-shadow(0 0 20px ${cfg.glowColor})` }}
          />
        </div>
      </div>

      {/* Titel */}
      <h2 className="relative mt-5 text-center text-2xl font-extrabold text-white">
        {cfg.title}
      </h2>

      {/* Untertitel */}
      <p className="relative mt-1.5 text-center text-sm text-slate-400">
        {cfg.subtitle}
      </p>

      {/* Medaillen-Zähler */}
      <div
        className="relative mx-auto mt-5 flex max-w-[260px] items-center justify-between rounded-2xl px-5 py-3"
        style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${cfg.border}` }}
      >
        <div className="text-center">
          <p className="text-xl font-extrabold" style={{ color: cfg.labelColor }}>+1</p>
          <p className="text-[11px] text-slate-400">{cfg.countLabel}</p>
        </div>
        <div className="h-8 w-px bg-white/10" />
        <div className="text-center">
          <p className="text-xl font-extrabold text-white">{total ?? '–'}</p>
          <p className="text-[11px] text-slate-400">
            {total === 1 ? cfg.countLabel : cfg.countLabelPl}
          </p>
        </div>
      </div>

      {/* Motivationstext */}
      {cfg.motivation && (
        <p className="relative mt-4 text-center text-xs text-slate-500">
          {cfg.motivation}
        </p>
      )}
    </div>
  );
}

// ── Keine Medaille ───────────────────────────────────────────────────────────

function NoMedalCard({ bronzeGap }: { bronzeGap: number | null }) {
  const urgent = bronzeGap !== null && bronzeGap <= 15;
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-900 px-5 py-5">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink-800 text-3xl">
          🏅
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-300">Heute keine Medaille</p>
          {bronzeGap !== null && bronzeGap > 0 ? (
            <>
              <p className={`mt-1 text-sm font-semibold ${urgent ? 'text-orange-400' : 'text-slate-400'}`}>
                {urgent ? `🔥 Nur noch ${bronzeGap} Push-ups bis Bronze!` : `Dir fehlten nur ${bronzeGap} Push-ups bis Bronze.`}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Morgen hast du die nächste Chance.</p>
            </>
          ) : (
            <p className="mt-1 text-xs text-slate-500">Morgen hast du die nächste Chance.</p>
          )}
        </div>
      </div>
    </div>
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
  { ring: '2px solid #60a5fa', glow: '0 0 14px 2px rgba(96,165,250,0.35)',   badgeBg: '#3b82f6', scoreColor: 'text-slate-300',  size: 50, mt: 28, label: '2' },
  { ring: '2px solid #f59e0b', glow: '0 0 20px 4px rgba(245,158,11,0.45)',   badgeBg: '#d97706', scoreColor: 'text-amber-400',  size: 68, mt: 0,  label: '1' },
  { ring: '2px solid #c2763a', glow: '0 0 14px 2px rgba(194,118,58,0.35)',   badgeBg: '#c2510a', scoreColor: 'text-orange-400', size: 50, mt: 36, label: '3' },
] as const;

const PLAT_CFG = [
  { bg: 'rgba(96,165,250,0.18)',  h: 16 },
  { bg: 'rgba(245,158,11,0.25)',  h: 26 },
  { bg: 'rgba(194,118,58,0.18)',  h: 10 },
];

function Podium({ entries }: { entries: TopThreeEntry[] }) {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank || b.pushups - a.pushups);
  const [first, second, third] = sorted;
  const display = [second, first, third];

  return (
    <div className="flex items-end justify-center gap-6 pt-5 pb-2">
      {display.map((entry, i) => {
        const cfg = PODIUM_CFG[i];
        const plat = PLAT_CFG[i];
        return (
          <div key={i} className="flex flex-col items-center" style={{ marginTop: cfg.mt }}>
            {entry ? (
              <>
                <div className="relative rounded-full" style={{ outline: cfg.ring, boxShadow: cfg.glow }}>
                  <Avatar url={entry.avatar} name={entry.name} size={cfg.size} />
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
              <div className="rounded-full bg-ink-800" style={{ width: cfg.size, height: cfg.size }} />
            )}
            <div className="relative mt-2 w-20 rounded-t" style={{ height: plat.h, background: plat.bg }} />
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
  medalCounts?: MedalCounts | null;
}

export function DailyRecapModal({
  recap,
  onClose,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  navLoading = false,
  medalCounts = null,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const delta     = recap.yesterday_pushups - recap.prev_day_pushups;
  const hasDelta  = recap.prev_day_pushups > 0;
  const top3      = recap.top_three ?? [];
  const isResting = recap.yesterday_pushups === 0 && !recap.yesterday_rank;

  // Bronze-Abstand berechnen
  const bronzeEntry = top3.find((e) => e.rank === 3) ?? top3[top3.length - 1];
  const bronzeGap   = !recap.yesterday_medal && bronzeEntry
    ? Math.max(0, bronzeEntry.pushups - recap.yesterday_pushups)
    : null;

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
        <button
          onClick={hasPrev ? onPrev : handleClose}
          disabled={navLoading && hasPrev}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 active:scale-95"
          aria-label={hasPrev ? 'Älter' : 'Schließen'}
        >
          ←
        </button>
        <span className="text-sm font-semibold text-brand-400">{dateShort}</span>
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

        {/* Hero */}
        <div className="relative px-6 pb-5 pt-2 text-center">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-64 w-64 rounded-full bg-brand-600/10 blur-3xl" />
          </div>
          <h1 className="relative text-3xl font-extrabold tracking-tight text-white">Arena-Rückblick</h1>
          <p className="relative mt-0.5 text-sm text-slate-400">{dateLong}</p>
        </div>

        {/* Karten */}
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
                {/* ── 1. Tagesleistung ──────────────────────────── */}
                <div className="rounded-2xl border border-brand-500/35 bg-ink-900 p-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-brand-400">
                    💪 Deine Leistung
                  </p>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-5xl font-extrabold leading-none text-white">
                        {recap.yesterday_pushups}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">Push-ups</p>
                      <div className="mt-3">
                        <TrendLine positive={delta >= 0 || !hasDelta} />
                      </div>
                    </div>
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
                        <span>{Math.abs(delta)} {delta >= 0 ? 'mehr' : 'weniger'} als gestern</span>
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Gestern: {recap.prev_day_pushups} Push-ups
                      </p>
                    </div>
                  )}
                </div>

                {/* ── 2. Medaillenvergabe ────────────────────────── */}
                {recap.yesterday_medal ? (
                  <MedalAwardCard medal={recap.yesterday_medal} counts={medalCounts} />
                ) : (
                  <NoMedalCard bronzeGap={bronzeGap} />
                )}

                {/* ── 3. Top 3 ──────────────────────────────────── */}
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

      {/* ── Animationen ────────────────────────────────────────────── */}
      <style>{`
        .medal-reveal {
          animation: medalReveal 0.6s cubic-bezier(0.22,1,0.36,1) 0.2s both;
        }
        .medal-image-reveal {
          animation: medalScale 0.7s cubic-bezier(0.34,1.56,0.64,1) 0.35s both;
          display: inline-block;
        }
        .medal-glow-pulse {
          animation: glowPulse 2.4s ease-in-out infinite;
        }
        .confetti-fall {
          animation: confettiFall var(--dur, 0.8s) ease-in var(--delay, 0s) both;
        }
        .sparkle-pulse {
          animation: sparkleFade 1.8s ease-in-out infinite;
        }

        @keyframes medalReveal {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes medalScale {
          from { opacity: 0; transform: scale(0.78); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.55; transform: scale(0.95); }
          50%       { opacity: 1;    transform: scale(1.05); }
        }
        @keyframes confettiFall {
          0%   { opacity: 1; transform: translateY(0) rotate(0deg); }
          100% { opacity: 0; transform: translateY(340px) rotate(540deg); }
        }
        @keyframes sparkleFade {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50%       { opacity: 0.8; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
