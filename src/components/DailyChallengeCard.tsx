/**
 * DailyChallengeCard — kompakte Live-Status-Karte für das Dashboard.
 *
 * Vier Zustände (alle animations-geschmeidig via Framer Motion):
 *
 *   NOT_JOINED  – Challenge läuft, User noch nicht dabei
 *   JOINED      – Challenge läuft, User nimmt teil (Rang, Fortschritt)
 *   ENDED_PART  – Challenge beendet, User hat teilgenommen (Ergebnis)
 *   ENDED_NONE  – Challenge beendet, User hat nicht teilgenommen (Sieger)
 *
 * Daten kommen als Props von Dashboard.tsx (Hook-Instanz dort oben).
 * Zahlen-Animationen laufen direkt auf dem DOM (kein React-Rerender).
 */

import { AnimatePresence, animate, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type {
  DailyChallengeLeaderboardEntry,
  DailyChallengeStatus,
} from '@/lib/dailyChallenge.types';

// ── Animated number ────────────────────────────────────────────────────────────
// Schreibt direkt ins DOM während der Animation → kein React-Rerender.

function AnimatedNum({ value, className }: { value: number; className?: string }) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    if (prevRef.current === null) {
      // Erster Render: direkt setzen, keine Animation
      prevRef.current = value;
      el.textContent = value.toLocaleString('de-DE');
      return;
    }
    if (prevRef.current === value) return;
    const from = prevRef.current;
    prevRef.current = value;
    const ctrl = animate(from, value, {
      duration: 0.55,
      ease: 'easeOut',
      onUpdate: (v) => { el.textContent = Math.round(v).toLocaleString('de-DE'); },
    });
    return ctrl.stop;
  }, [value]);

  return (
    <span ref={spanRef} className={className}>
      {value.toLocaleString('de-DE')}
    </span>
  );
}

// ── Live-Dot ──────────────────────────────────────────────────────────────────

function LiveDot() {
  return (
    <span className="relative flex h-[7px] w-[7px] shrink-0">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-50"
        style={{ animationDuration: '2s' }}
      />
      <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-red-500" />
    </span>
  );
}

// ── Chevron ───────────────────────────────────────────────────────────────────

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? 'h-4 w-4'}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ChallengeProgress({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Rang-Medal ────────────────────────────────────────────────────────────────

function rankLabel(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

// ── Card-Basis-Styles ─────────────────────────────────────────────────────────

const CARD = 'overflow-hidden rounded-2xl border border-ink-700 bg-ink-800/70 px-4 py-3';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DailyChallengeCardProps {
  /** Vollständiger Status-Return von get_daily_challenge_status */
  status: DailyChallengeStatus | null;
  /** Aktuelle Rangliste (leer wenn noch keine Teilnehmer) */
  leaderboard: DailyChallengeLeaderboardEntry[];
  /** Ist gerade ein join-Request unterwegs? */
  isJoining: boolean;
  /** Teilnehmen-Aktion */
  onJoin: () => void;
  /** Öffnet das DailyChallengeModal */
  onOpen: () => void;
  /** Einheit der Übung, z. B. "Wdh." */
  exerciseUnit?: string;
}

// ── Komponente ────────────────────────────────────────────────────────────────

export function DailyChallengeCard({
  status,
  leaderboard,
  isJoining,
  onJoin,
  onOpen,
  exerciseUnit = 'Wdh.',
}: DailyChallengeCardProps) {

  // ── Abgeleitete Werte ──────────────────────────────────────────────────────

  const isActive           = status?.isActive           ?? false;
  const hasJoined          = status?.hasJoined          ?? false;
  const joinDeadlinePassed = status?.joinDeadlinePassed ?? false;
  const isEnded            = status !== null && !isActive && status.serverNow >= status.endsAt;

  // Karte nur anzeigen für laufende oder heute beendete Challenges
  const berlinToday = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const isToday     = status?.challengeDate === berlinToday;

  const myEntry        = leaderboard.find(e => e.isMe);
  const leader         = leaderboard.find(e => e.rank === 1);
  const participantCount = leaderboard.length;
  const myRank         = myEntry?.rank ?? null;
  const myTotal        = myEntry?.totalRepetitions ?? 0;
  const leaderTotal    = leader?.totalRepetitions ?? 0;
  const gapToFirst     = leaderTotal > myTotal ? leaderTotal - myTotal : 0;
  const isLeading      = hasJoined && myTotal > 0 && myRank === 1;

  // Nicht zeigen wenn keine relevante Challenge
  if (!isActive && !(isEnded && isToday)) return null;

  // ── Beendet ────────────────────────────────────────────────────────────────

  if (isEnded) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={CARD}
      >
        {/* Kopfzeile */}
        <div className="flex items-center gap-2">
          <span className="text-[13px] leading-none">🏁</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.10em] text-slate-500">
            Daily Live Challenge · Beendet
          </span>
        </div>

        {/* Ergebnis-Zeile */}
        <div className="mt-1.5 flex items-center justify-between gap-3">
          {hasJoined && myRank != null ? (
            <span className="text-[13.5px] font-semibold text-slate-200">
              {rankLabel(myRank)} Platz {myRank}&thinsp;·&thinsp;{myTotal.toLocaleString('de-DE')} {exerciseUnit}
            </span>
          ) : leader ? (
            <span className="text-[13px] text-slate-300">
              🏆&nbsp;{leader.displayName}&thinsp;·&thinsp;{leaderTotal.toLocaleString('de-DE')} {exerciseUnit}
            </span>
          ) : (
            <span className="text-[13px] text-slate-500">Keine Teilnehmer</span>
          )}
          <button
            onClick={onOpen}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-white/[0.06] px-3 py-1.5 text-[11.5px] font-medium text-slate-300 transition hover:bg-white/[0.10] active:scale-95"
          >
            Ergebnis
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>
      </motion.div>
    );
  }

  // ── Aktiv, noch nicht beigetreten ─────────────────────────────────────────

  if (!hasJoined) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={CARD}
      >
        <div className="flex items-center justify-between gap-3">
          {/* Label + Hinweis */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LiveDot />
              <span className="text-[13px] font-semibold text-slate-100">Daily Live Challenge</span>
            </div>
            <p className="mt-0.5 text-[11.5px] text-slate-500">
              {joinDeadlinePassed
                ? 'Die Teilnahme für heute ist beendet.'
                : participantCount > 0
                  ? `${participantCount} Teilnehmer · Bereits absolvierte Wdh. werden übernommen.`
                  : 'Teilnahme bis 16:20 Uhr möglich. Bereits absolvierte Wdh. werden übernommen.'}
            </p>
          </div>

          {/* Join-Button — deaktiviert nach 16:20 */}
          <button
            onClick={joinDeadlinePassed ? undefined : onJoin}
            disabled={isJoining || joinDeadlinePassed}
            className={`shrink-0 rounded-xl px-4 py-2 text-[12px] font-semibold text-white transition active:scale-95 disabled:opacity-60 ${
              joinDeadlinePassed
                ? 'bg-ink-700 cursor-not-allowed'
                : 'bg-brand-600 hover:bg-brand-500'
            }`}
          >
            {isJoining ? '…' : joinDeadlinePassed ? 'Beendet' : 'Teilnehmen'}
          </button>
        </div>
      </motion.div>
    );
  }

  // ── Aktiv, teilnehmend ─────────────────────────────────────────────────────

  return (
    <motion.button
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      onClick={onOpen}
      className={`${CARD} w-full text-left transition active:scale-[0.985]`}
    >
      {/* Zeile 1: Label + Rang + Chevron */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <LiveDot />
          <span className="truncate text-[13px] font-semibold text-slate-100">Daily Live Challenge</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {myRank != null && (
            <span className="text-[12px] font-bold text-brand-300 tabular-nums">
              #{myRank}{' '}
              <span className="font-normal text-slate-500">von {participantCount}</span>
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </div>
      </div>

      {/* Zeile 2: Score + Progress */}
      <div className="mt-2 space-y-1">
        {/* Zahlen */}
        <div className="flex items-baseline justify-between">
          <AnimatedNum
            value={myTotal}
            className="text-[15px] font-bold text-slate-100 tabular-nums"
          />
          <span className="text-[11px] text-slate-500 tabular-nums">
            {'/ '}
            <AnimatedNum value={leaderTotal} className="text-slate-400" />
          </span>
        </div>

        {/* Progressbalken */}
        <ChallengeProgress value={myTotal} max={leaderTotal || 1} />

        {/* Motivationstext */}
        <AnimatePresence mode="wait">
          {isLeading ? (
            <motion.p
              key="leading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-[10.5px] font-semibold text-brand-400"
            >
              Du führst! 🔥
            </motion.p>
          ) : gapToFirst > 0 ? (
            <motion.p
              key="gap"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-[10.5px] text-slate-500"
            >
              Noch{' '}
              <AnimatedNum value={gapToFirst} className="tabular-nums" />
              {' '}{exerciseUnit} bis Platz 1
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.button>
  );
}
