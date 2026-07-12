/**
 * DailyRecapModal – Premium-Redesign
 * Medaillenvergabe als emotionaler Höhepunkt des Tages-Recaps.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '@/components/ui/Avatar';
import type { DailyRecap, TopThreeEntry, MedalCounts, RecapDateEntry } from '@/hooks/useDailyRecap';

const SWIPE_HINT_KEY = 'recap-swipe-hint-v1';

// ── Datums-Leiste ────────────────────────────────────────────────────────────

function DateStrip({
  dates,
  currentIdx,
  onSelect,
  disabled,
}: {
  dates: RecapDateEntry[];
  currentIdx: number;
  onSelect: (idx: number) => void;
  disabled?: boolean;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Display oldest → newest (left → right)
  const displayDates = useMemo(
    () => dates.map((d, i) => ({ ...d, originalIdx: i })).reverse(),
    [dates],
  );
  const currentDisplayIdx = dates.length - 1 - currentIdx;

  useEffect(() => {
    const strip = stripRef.current;
    const btn = activeRef.current;
    if (!strip || !btn) return;
    const target = btn.offsetLeft - strip.offsetWidth / 2 + btn.offsetWidth / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [currentIdx, dates.length]);

  if (dates.length <= 1) return null;

  return (
    <div
      ref={stripRef}
      className="flex gap-0.5 overflow-x-auto pb-1"
      style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      {/* Leading spacer so first item can be scrolled to center */}
      <div className="shrink-0" style={{ minWidth: 'calc(50% - 26px)' }} />

      {displayDates.map(({ recap_date, originalIdx }, di) => {
        const isActive = di === currentDisplayIdx;
        const d = new Date(recap_date + 'T12:00:00');
        const weekday = d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
        const dayNum = d.getDate();

        return (
          <button
            key={recap_date}
            ref={isActive ? activeRef : null}
            onClick={() => !disabled && onSelect(originalIdx)}
            className={`flex shrink-0 flex-col items-center rounded-xl px-3 transition-all duration-200 ${
              isActive ? 'bg-white/10 py-1.5' : 'py-1 opacity-40 active:opacity-70'
            }`}
          >
            <span className={`text-[10px] font-medium leading-tight ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
              {weekday}
            </span>
            <span className={`font-bold leading-tight ${isActive ? 'text-[18px] text-white' : 'text-base text-slate-400'}`}>
              {dayNum}
            </span>
          </button>
        );
      })}

      {/* Trailing spacer */}
      <div className="shrink-0" style={{ minWidth: 'calc(50% - 26px)' }} />
    </div>
  );
}

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
  availableDates?: RecapDateEntry[];
  currentDateIdx?: number;
  onDateSelect?: (idx: number) => void;
  navLoading?: boolean;
  medalCounts?: MedalCounts | null;
}

export function DailyRecapModal({
  recap,
  onClose,
  availableDates = [],
  currentDateIdx = 0,
  onDateSelect,
  navLoading = false,
  medalCounts = null,
}: Props) {
  const [visible, setVisible] = useState(false);

  // ── Slide-Animation beim Datumswechsel ───────────────────────────────────
  const pendingDir = useRef<'left' | 'right' | null>(null);
  const [slideKey, setSlideKey] = useState(recap.recap_date);
  const [slideDir, setSlideDir] = useState<'left' | 'right' | null>(null);
  const prevDate = useRef(recap.recap_date);

  useEffect(() => {
    if (recap.recap_date !== prevDate.current) {
      setSlideKey(recap.recap_date);
      setSlideDir(pendingDir.current);
      prevDate.current = recap.recap_date;
    }
  }, [recap.recap_date]);

  function navigate(idx: number) {
    if (navLoading || idx === currentDateIdx) return;
    pendingDir.current = idx > currentDateIdx ? 'left' : 'right';
    onDateSelect?.(idx);
  }

  // ── Swipe-Geste ──────────────────────────────────────────────────────────
  const touchStartX = useRef<number | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < 48) return;
    if (delta < 0 && currentDateIdx > 0) {
      // Swipe links → neuer Tag (kleinerer idx)
      navigate(currentDateIdx - 1);
    } else if (delta > 0 && currentDateIdx < availableDates.length - 1) {
      // Swipe rechts → älterer Tag (größerer idx)
      navigate(currentDateIdx + 1);
    }
  }

  // ── Onboarding-Hint ──────────────────────────────────────────────────────
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (availableDates.length > 1 && !localStorage.getItem(SWIPE_HINT_KEY)) {
      const show = setTimeout(() => setShowHint(true), 900);
      return () => clearTimeout(show);
    }
  }, [availableDates.length]);

  useEffect(() => {
    if (!showHint) return;
    const hide = setTimeout(() => {
      setShowHint(false);
      localStorage.setItem(SWIPE_HINT_KEY, '1');
    }, 3000);
    return () => clearTimeout(hide);
  }, [showHint]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // ── Abschluss-Karte ──────────────────────────────────────────────────────
  const navigate = useNavigate();
  const closingCardRef = useRef<HTMLDivElement>(null);
  const [closingVisible, setClosingVisible] = useState(false);

  useEffect(() => {
    setClosingVisible(false); // reset on date change so card re-animates
  }, [recap.recap_date]);

  useEffect(() => {
    const el = closingCardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setClosingVisible(true); },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [recap.recap_date]);

  async function handleStartTraining() {
    setVisible(false);
    await new Promise((r) => setTimeout(r, 220));
    onClose();
    navigate('/track');
  }

  const delta     = recap.yesterday_pushups - recap.prev_day_pushups;
  const hasDelta  = recap.prev_day_pushups > 0;
  const top3      = recap.top_three ?? [];
  const isResting = recap.yesterday_pushups === 0 && !recap.yesterday_rank;

  // Bronze-Abstand berechnen
  const bronzeEntry = top3.find((e) => e.rank === 3) ?? top3[top3.length - 1];
  const bronzeGap   = !recap.yesterday_medal && bronzeEntry
    ? Math.max(0, bronzeEntry.pushups - recap.yesterday_pushups)
    : null;

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
      {/* Onboarding-Swipe-Hint – über dem gesamten Modal */}
      {showHint && (
        <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center" style={{ top: '42%' }}>
          <div className="rounded-2xl bg-black/75 px-5 py-3 text-sm font-semibold text-white backdrop-blur-sm animate-hint-fade">
            ← Zwischen Tagen wischen →
          </div>
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────── */}
      <div
        className="shrink-0 px-4"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}
      >
        {/* Zeile: Leer links, ✕ rechts */}
        <div className="flex items-center justify-end pb-1">
          <button
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 active:scale-95"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        {/* Datums-Leiste */}
        <DateStrip
          dates={availableDates}
          currentIdx={currentDateIdx}
          onSelect={navigate}
          disabled={navLoading}
        />
      </div>

      {/* ── Scrollbarer Inhalt (mit Swipe-Erkennung) ─────────────── */}
      <div
        className="flex-1 overflow-y-auto"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >

        {/* Animierter Inhalts-Wrapper – Key-Wechsel triggert Slide */}
        <div
          key={slideKey}
          className={slideDir === 'left' ? 'slide-from-left' : slideDir === 'right' ? 'slide-from-right' : ''}
        >

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
          <div className="space-y-3 px-4 pb-10">

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

            {/* ── Abschluss-Karte ───────────────────────────────── */}
            <div
              ref={closingCardRef}
              className="transition-[opacity,transform] duration-[250ms] ease-out"
              style={{
                opacity: closingVisible ? 1 : 0,
                transform: closingVisible ? 'translateY(0)' : 'translateY(16px)',
              }}
            >
              <div
                className="rounded-2xl border border-brand-500/25 p-6 text-center"
                style={{
                  background: 'linear-gradient(145deg, rgba(99,102,241,0.13) 0%, rgba(8,8,15,0.97) 100%)',
                  boxShadow: '0 0 48px 0 rgba(99,102,241,0.12), inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
              >
                <p className="text-[13px] font-bold uppercase tracking-widest text-brand-400">
                  🏁 Arena-Rückblick abgeschlossen
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Du bist bereit für den heutigen Wettkampf.
                </p>
                <button
                  onClick={handleStartTraining}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-[14px] text-base font-extrabold text-white
                    shadow-[0_0_28px_rgba(99,102,241,0.4)] transition hover:bg-brand-500 active:scale-[0.97]"
                >
                  <span>💪</span>
                  <span>Training starten</span>
                </button>
              </div>
            </div>

          </div>
        )}
        </div> {/* /slide-animated wrapper */}
      </div>

      {/* ── Animationen ────────────────────────────────────────────── */}
      <style>{`
        .slide-from-left {
          animation: slideFromLeft 0.26s cubic-bezier(0.25,0.46,0.45,0.94) both;
        }
        .slide-from-right {
          animation: slideFromRight 0.26s cubic-bezier(0.25,0.46,0.45,0.94) both;
        }
        .animate-hint-fade {
          animation: hintFade 3s ease-in-out both;
        }
        @keyframes slideFromLeft {
          from { opacity: 0; transform: translateX(-28px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideFromRight {
          from { opacity: 0; transform: translateX(28px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes hintFade {
          0%   { opacity: 0; transform: translateY(4px); }
          15%  { opacity: 1; transform: translateY(0); }
          75%  { opacity: 1; }
          100% { opacity: 0; }
        }
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
