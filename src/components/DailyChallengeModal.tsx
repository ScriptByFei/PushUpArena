// DailyChallengeModal – reine Live-Ansicht des heutigen Trainingstages.
// Hook-Instanz: einmal in DailyChallengeModal, Daten als Props weiter.
// Countdown in eigener DailyChallengeCountdown-Komponente → kein sekündlicher
// Re-Render des Modal-Baums mehr.
// Zwei Tabs: "Live" (Status, Deine Leistung, Live-Rangliste) und
// "Deine Sätze" (Satzliste des heutigen Tages). Kein Verlauf mehr.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { useDailyChallenge } from '@/hooks/useDailyChallenge';
import { useCountdown } from '@/hooks/useCountdown';
import { formatBerlinTime } from '@/lib/date';
import { LeaderboardCard } from '@/components/DailyChallengeLeaderboard';
import type {
  DailyChallengeLeaderboardEntry,
  DailyChallengeSet,
} from '@/lib/dailyChallenge.types';

// ── Hilfsfunktionen ────────────────────────────────────────────────────────

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
}

// ── Isolierter Countdown ───────────────────────────────────────────────────
// Nur diese Komponente löst jede Sekunde einen Re-Render aus.
// Alle Geschwister (PerformanceCard, LeaderboardCard, …) bleiben stabil.

function DailyChallengeCountdown({
  targetTime,
  serverNow,
  onEnd,
}: {
  targetTime: Date | null;
  serverNow: Date | null;
  onEnd?: () => void;
}) {
  const seconds = useCountdown(targetTime, serverNow, onEnd);
  return (
    <p className="mt-1.5 font-mono tabular-nums text-4xl font-extrabold tracking-tight text-white [text-shadow:0_0_18px_rgba(129,140,248,0.4)]">
      {formatCountdown(seconds)}
    </p>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

// ── Tab-Typen ──────────────────────────────────────────────────────────────

type Tab = 'live' | 'sets';

// ── Gemeinsamer Karten-Look (Glow + dezenter Verlauf) ───────────────────────
// Nur innerhalb von Daily Live verwendet — die globale .card-Klasse in
// index.css bleibt unangetastet (wirkt sonst app-weit).

const PREMIUM_CARD = 'border-ink-600/60 shadow-glow bg-gradient-to-b from-ink-800/85 to-ink-800/55';

// ── Skeleton ───────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <Card className={PREMIUM_CARD}>
      <div className="animate-pulse space-y-2.5">
        <div className="h-3.5 w-20 rounded-md bg-ink-700" />
        <div className="h-9 w-36 rounded-md bg-ink-700" />
        <div className="h-3 w-44 rounded-md bg-ink-700" />
      </div>
    </Card>
  );
}

// ── Statuskarte ────────────────────────────────────────────────────────────

function StatusCard({
  isActive,
  startsAt,
  endsAt,
  serverNow,
  onCountdownEnd,
}: {
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  serverNow: Date | null;
  onCountdownEnd: () => void;
}) {
  const targetTime = isActive ? endsAt : startsAt;
  return (
    <Card
      className={
        isActive
          ? 'border-brand-500/30 bg-gradient-to-br from-brand-900/50 via-ink-800/80 to-ink-800/60 shadow-glow'
          : PREMIUM_CARD
      }
    >
      <div className="flex items-center gap-2">
        <CardTitle className={isActive ? '!text-brand-200' : ''}>
          {isActive ? 'Challenge läuft' : 'Challenge pausiert'}
        </CardTitle>
        {isActive && (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </span>
        )}
      </div>
      <DailyChallengeCountdown
        targetTime={targetTime}
        serverNow={serverNow}
        onEnd={onCountdownEnd}
      />
      {isActive ? (
        <p className="mt-1.5 text-xs text-slate-400">Live bis Mitternacht</p>
      ) : (
        <p className="mt-1.5 text-xs text-slate-400">Das nächste Daily Live startet um Mitternacht.</p>
      )}
    </Card>
  );
}

// ── Leistungs-Statistik ────────────────────────────────────────────────────

interface ChallengeStats {
  totalRepetitions: number;
  setCount: number;
  maxSet: number;
  minSet: number;
  averageSet: number;
}

function computeStats(sets: DailyChallengeSet[]): ChallengeStats | null {
  if (sets.length === 0) return null;
  const reps = sets.map(s => s.repetitions);
  const total = reps.reduce((a, b) => a + b, 0);
  return {
    totalRepetitions: total,
    setCount:         sets.length,
    maxSet:           Math.max(...reps),
    minSet:           Math.min(...reps),
    averageSet:       total / sets.length,
  };
}

function StatCell({
  label,
  value,
  dotClassName,
}: {
  label: string;
  value: string;
  /** Farbe des kleinen Indikator-Punkts vor dem Label, z. B. "bg-blue-400" */
  dotClassName: string;
}) {
  return (
    <div>
      <p className="tabular-nums text-lg font-bold leading-none text-white">{value}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClassName}`} aria-hidden="true" />
        <p className="text-xs text-slate-400">{label}</p>
      </div>
    </div>
  );
}

// ── Leistungskarte ─────────────────────────────────────────────────────────

interface PerformanceCardProps {
  mySets: DailyChallengeSet[];
  isLoadingMySets: boolean;
  setsError: string | null;
  refreshMySets: () => Promise<void>;
}

function PerformanceCard({
  mySets,
  isLoadingMySets,
  setsError,
  refreshMySets,
}: PerformanceCardProps) {
  // Statistik nur neu berechnen wenn sich mySets ändert – kein Countdown-Einfluss
  const stats = useMemo(() => computeStats(mySets), [mySets]);

  if (setsError) {
    return (
      <Card className={PREMIUM_CARD}>
        <CardTitle>Deine Leistung</CardTitle>
        <p className="mt-2 text-sm text-slate-500">
          Deine Leistung konnte nicht geladen werden.
        </p>
        <button
          onClick={() => void refreshMySets()}
          className="mt-3 rounded-xl border border-ink-600 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-ink-700"
        >
          Erneut versuchen
        </button>
      </Card>
    );
  }

  // Skeleton nur beim initialen Laden (kein Flash bei Hintergrund-Refresh)
  if (isLoadingMySets && mySets.length === 0) {
    return (
      <Card className={PREMIUM_CARD}>
        <div className="animate-pulse space-y-3">
          <div className="h-3.5 w-28 rounded-md bg-ink-700" />
          <div className="h-8 w-16 rounded-md bg-ink-700" />
          <div className="h-3 w-40 rounded-md bg-ink-700" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1">
            <div className="h-10 rounded-md bg-ink-700" />
            <div className="h-10 rounded-md bg-ink-700" />
            <div className="h-10 rounded-md bg-ink-700" />
            <div className="h-10 rounded-md bg-ink-700" />
          </div>
        </div>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className={PREMIUM_CARD}>
        <CardTitle>Deine Leistung</CardTitle>
        <p className="mt-2 text-sm text-slate-500">Noch kein Satz eingetragen.</p>
        <p className="mt-1 text-xs text-slate-600">
          Deine Statistik erscheint nach deinem ersten Satz.
        </p>
      </Card>
    );
  }

  const averageSetValue = stats.averageSet.toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return (
    <Card className={PREMIUM_CARD}>
      <CardTitle>Deine Leistung</CardTitle>
      {/* Gesamtwiederholungen – prominentester Wert, in Primary Brand Color */}
      <p className="mt-1.5 tabular-nums text-3xl font-extrabold tracking-tight text-brand-300 [text-shadow:0_0_20px_rgba(99,102,241,0.35)]">
        {stats.totalRepetitions}
      </p>
      <p className="text-xs text-slate-400">Wiederholungen gesamt</p>
      {/* 2×2-Raster: Sätze / Ø pro Satz (oben) — Kleinster / Bester Satz (unten) */}
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-ink-700/60 pt-4">
        <StatCell label="Sätze"          value={String(stats.setCount)} dotClassName="bg-blue-400" />
        <StatCell label="Ø pro Satz"     value={averageSetValue}        dotClassName="bg-teal-400" />
        <StatCell label="Kleinster Satz" value={String(stats.minSet)}   dotClassName="bg-orange-400" />
        <StatCell label="Bester Satz"    value={String(stats.maxSet)}   dotClassName="bg-amber-400" />
      </div>
    </Card>
  );
}

// ── Satzliste ──────────────────────────────────────────────────────────────

// ── MySetsCard ─────────────────────────────────────────────────────────────

interface MySetsCardProps {
  mySets: DailyChallengeSet[];
  isLoadingMySets: boolean;
  setsError: string | null;
  refreshMySets: () => Promise<void>;
}

function MySetsCard({
  mySets,
  isLoadingMySets,
  setsError,
  refreshMySets,
}: MySetsCardProps) {
  if (setsError) {
    return (
      <Card className={PREMIUM_CARD}>
        <CardTitle>Deine Sätze</CardTitle>
        <p className="mt-2 text-sm text-slate-500">
          Deine Sätze konnten nicht geladen werden.
        </p>
        <button
          onClick={() => void refreshMySets()}
          className="mt-3 rounded-xl border border-ink-600 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-ink-700"
        >
          Erneut versuchen
        </button>
      </Card>
    );
  }

  // Skeleton nur beim initialen Laden
  if (isLoadingMySets && mySets.length === 0) {
    return (
      <Card className={PREMIUM_CARD}>
        <div className="animate-pulse">
          <div className="mb-3 h-3.5 w-20 rounded-md bg-ink-700" />
          {[0, 1, 2].map(i => (
            <div key={i} className="flex items-center justify-between border-t border-ink-800 py-3">
              <div className="space-y-1.5">
                <div className="h-3.5 w-14 rounded-md bg-ink-700" />
                <div className="h-3 w-20 rounded-md bg-ink-700" />
              </div>
              <div className="h-7 w-9 rounded-md bg-ink-700" />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  if (mySets.length === 0) {
    return (
      <Card className={PREMIUM_CARD}>
        <CardTitle>Noch keine Sätze heute</CardTitle>
        <p className="mt-2 text-sm text-slate-500">
          Deine heutigen Push-up-Sätze erscheinen hier automatisch.
        </p>
      </Card>
    );
  }

  const total = mySets.length;

  return (
    <Card className={PREMIUM_CARD}>
      <CardTitle>Deine Sätze</CardTitle>
      <ul className="mt-1.5 divide-y divide-ink-800">
        {mySets.map((set, i) => {
          const setNumber = total - i;
          return (
            <li key={set.id} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-200">Satz {setNumber}</p>
                  <p className="tabular-nums text-xs text-slate-500">
                    {formatBerlinTime(set.createdAt)} Uhr
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular-nums text-lg font-bold leading-none text-white">
                    {set.repetitions}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Wdh.</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ── Tab-Pill ───────────────────────────────────────────────────────────────

function TabPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`mb-3 flex-1 rounded-lg px-4 py-1.5 text-center text-sm font-semibold transition ${
        active
          ? 'bg-brand-600/30 text-brand-300'
          : 'text-slate-500 hover:bg-ink-800 hover:text-slate-300'
      }`}
    >
      {label}
    </button>
  );
}

// ── Live-Tab ───────────────────────────────────────────────────────────────

interface LiveTabProps {
  // hasStatus = false solange der initiale Statusabruf noch läuft (status === null)
  hasStatus: boolean;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  serverNow: Date | null;
  onCountdownEnd: () => void;
  isLoadingMySets: boolean;
  isLoadingLeaderboard: boolean;
  setsError: string | null;
  leaderboardError: string | null;
  mySets: DailyChallengeSet[];
  leaderboard: DailyChallengeLeaderboardEntry[];
  refreshMySets: () => Promise<void>;
  refreshLeaderboard: () => Promise<void>;
}

function LiveTab({
  hasStatus,
  isActive,
  startsAt,
  endsAt,
  serverNow,
  onCountdownEnd,
  isLoadingMySets,
  isLoadingLeaderboard,
  setsError,
  leaderboardError,
  mySets,
  leaderboard,
  refreshMySets,
  refreshLeaderboard,
}: LiveTabProps) {
  // Skeleton nur beim initialen Laden (hasStatus = false).
  // Hintergrund-Refreshes (onCountdownEnd) aktualisieren status still →
  // kein Skeleton-Flash.
  return (
    <div className="flex flex-col gap-3">
      {!hasStatus ? (
        <CardSkeleton />
      ) : (
        <StatusCard
          isActive={isActive}
          startsAt={startsAt}
          endsAt={endsAt}
          serverNow={serverNow}
          onCountdownEnd={onCountdownEnd}
        />
      )}

      <PerformanceCard
        mySets={mySets}
        isLoadingMySets={isLoadingMySets}
        setsError={setsError}
        refreshMySets={refreshMySets}
      />
      <LeaderboardCard
        isActive={isActive}
        leaderboard={leaderboard}
        isLoadingLeaderboard={isLoadingLeaderboard}
        leaderboardError={leaderboardError}
        refreshLeaderboard={refreshLeaderboard}
      />
    </div>
  );
}

// ── Sätze-Tab ──────────────────────────────────────────────────────────────

interface SetsTabProps {
  mySets: DailyChallengeSet[];
  isLoadingMySets: boolean;
  setsError: string | null;
  refreshMySets: () => Promise<void>;
}

function SetsTab({ mySets, isLoadingMySets, setsError, refreshMySets }: SetsTabProps) {
  return (
    <div className="flex flex-col gap-3">
      <MySetsCard
        mySets={mySets}
        isLoadingMySets={isLoadingMySets}
        setsError={setsError}
        refreshMySets={refreshMySets}
      />
    </div>
  );
}

// ── Haupt-Komponente ───────────────────────────────────────────────────────

export function DailyChallengeModal({ onClose }: { onClose: () => void }) {
  // Einzige Hook-Instanz — alle Kinder erhalten Daten als Props.
  // Kein secondsUntilStart/End hier: Countdown läuft isoliert in
  // DailyChallengeCountdown und löst keinen Modal-Re-Render aus.
  const {
    status,
    isActive,
    startsAt,
    endsAt,
    serverNow,
    leaderboard,
    mySets,
    isLoadingMySets,
    isLoadingLeaderboard,
    setsError,
    leaderboardError,
    refreshStatus,
    refreshMySets,
    refreshLeaderboard,
  } = useDailyChallenge();

  const [activeTab, setActiveTab] = useState<Tab>('live');

  // Stabiler Callback für den Countdown-End-Handler:
  // Inline-Arrow würde bei jedem Modal-Re-Render eine neue Referenz erzeugen
  // und den useEffect in useCountdown unnötig neu auslösen.
  const handleCountdownEnd = useCallback(() => { void refreshStatus(); }, [refreshStatus]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      data-no-drawer="true"
      className="fixed inset-0 z-50 flex flex-col bg-ink-950"
      role="dialog"
      aria-modal="true"
      aria-label="Daily Live"
      onKeyDown={handleKeyDown}
    >
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }} />

      {/* Header */}
      <div className="shrink-0 border-b border-ink-800 px-4 pb-0 pt-2">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-lg font-extrabold text-slate-100">Daily Live</h2>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-ink-800 hover:text-slate-200"
            aria-label="Schließen"
          >
            <CloseIcon />
          </button>
        </div>
        <div role="tablist" aria-label="Daily-Live-Ansicht" className="flex gap-1">
          <TabPill label="Live"        active={activeTab === 'live'} onClick={() => setActiveTab('live')} />
          <TabPill label="Deine Sätze" active={activeTab === 'sets'} onClick={() => setActiveTab('sets')} />
        </div>
      </div>

      {/* Scrollbarer Inhalt */}
      <div
        className="flex-1 overflow-y-auto px-4 pt-4"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {activeTab === 'live' ? (
          <LiveTab
            hasStatus={status !== null}
            isActive={isActive}
            startsAt={startsAt}
            endsAt={endsAt}
            serverNow={serverNow}
            onCountdownEnd={handleCountdownEnd}
            isLoadingMySets={isLoadingMySets}
            isLoadingLeaderboard={isLoadingLeaderboard}
            setsError={setsError}
            leaderboardError={leaderboardError}
            mySets={mySets}
            leaderboard={leaderboard}
            refreshMySets={refreshMySets}
            refreshLeaderboard={refreshLeaderboard}
          />
        ) : (
          <SetsTab
            mySets={mySets}
            isLoadingMySets={isLoadingMySets}
            setsError={setsError}
            refreshMySets={refreshMySets}
          />
        )}
      </div>
    </div>
  );
}
