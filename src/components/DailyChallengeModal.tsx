// DailyChallengeModal – echter Tageswettkampf, kein Aktivitätsfeed
// (Abgrenzung zu Arena Live: "Was passiert gerade?" vs. "Wer gewinnt heute?").
// Hook-Instanz: einmal in DailyChallengeModal, Daten als Props weiter.
// Countdown in eigener HeaderRemainingTime-Komponente → kein sekündlicher
// Re-Render des Modal-Baums mehr.
// Drei Tabs: "Live" (Deine Position, Dein Duell, Rangliste, Performance,
// Tages-Stats), "Deine Sätze" (Satzliste des heutigen Tages) und "Verlauf"
// (Wettkampfergebnisse vergangener Tage).

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { useDailyChallenge } from '@/hooks/useDailyChallenge';
import { useCountdown } from '@/hooks/useCountdown';
import { formatBerlinTime } from '@/lib/date';
import { supabase } from '@/lib/supabase';
import { LeaderboardCard } from '@/components/DailyChallengeLeaderboard';
import { DayResultSheet, HistoryList } from '@/components/DailyChallengeHistory';
import {
  mapParticipantSet,
  type DailyChallengeLeaderboardEntry,
  type DailyChallengeParticipantSet,
  type DailyChallengeSet,
} from '@/lib/dailyChallenge.types';

// ── Header-Restzeit ("Noch 12:34 Std.") ─────────────────────────────────────
// Eigene isolierte Komponente: nur sie rendert jede Sekunde neu, der
// restliche Header-Baum bleibt stabil. Übernimmt seit dem UI-Polish (Phase 12)
// auch den onEnd-Callback (Statusabruf bei Tageswechsel) — die frühere,
// separate StatusCard mit großem Countdown wurde entfernt, da sie den Header
// nur noch duplizierte.

function HeaderRemainingTime({
  targetTime,
  serverNow,
  onEnd,
}: {
  targetTime: Date | null;
  serverNow: Date | null;
  onEnd?: () => void;
}) {
  const seconds = useCountdown(targetTime, serverNow, onEnd);
  if (!targetTime || !serverNow) return null;
  const s = Math.max(0, Math.floor(seconds));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  return (
    <p className="mt-1 text-xs tabular-nums text-slate-500">
      Noch {h}:{m} Std.
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

type Tab = 'live' | 'sets' | 'history';

// ── Gemeinsamer Karten-Look (Glow + dezenter Verlauf) ───────────────────────
// Nur innerhalb von Daily Live verwendet — die globale .card-Klasse in
// index.css bleibt unangetastet (wirkt sonst app-weit).

const PREMIUM_CARD = 'border-ink-600/60 shadow-glow bg-gradient-to-b from-ink-800/85 to-ink-800/55';

// ── Wiederverwendbarer Stat-Baustein ────────────────────────────────────────

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

// ── Deine Position ─────────────────────────────────────────────────────────
// Personalisierte Wettkampf-Karte: Rang, Gesamt-PushUps, Sätze/Ø/Best,
// Abstand zu Platz 1 (bzw. Vorsprung, falls selbst Platz 1). Alle Werte
// stammen aus der bereits geladenen, serverseitig sortierten Rangliste —
// keine neue RPC nötig.

function formatAverage(averageSet: number | null): string {
  if (averageSet == null) return '—';
  return averageSet.toLocaleString('de-DE', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

interface MyPositionCardProps {
  leaderboard: DailyChallengeLeaderboardEntry[];
  isLoadingLeaderboard: boolean;
  leaderboardError: string | null;
}

function MyPositionCard({
  leaderboard,
  isLoadingLeaderboard,
  leaderboardError,
}: MyPositionCardProps) {
  if (leaderboardError) return null; // Fehler wird bereits in LeaderboardCard angezeigt

  if (isLoadingLeaderboard && leaderboard.length === 0) {
    return (
      <Card className={PREMIUM_CARD}>
        <div className="animate-pulse space-y-3">
          <div className="h-3.5 w-28 rounded-md bg-ink-700" />
          <div className="h-9 w-16 rounded-md bg-ink-700" />
          <div className="h-3 w-32 rounded-md bg-ink-700" />
        </div>
      </Card>
    );
  }

  const me = leaderboard.find(e => e.isMe);

  if (!me) {
    return (
      <Card className={PREMIUM_CARD}>
        <CardTitle>Deine Position</CardTitle>
        <p className="mt-2 text-sm text-slate-500">Noch kein Satz eingetragen.</p>
        <p className="mt-1 text-xs text-slate-600">
          Trag deinen ersten Satz ein, um in der Rangliste zu erscheinen.
        </p>
      </Card>
    );
  }

  const participantCount = leaderboard.length;
  const leader = leaderboard.find(e => e.rank === 1) ?? null;
  const second = leaderboard.find(e => e.rank === 2) ?? null;
  const isLeader = me.rank === 1;

  let footer: string;
  if (isLeader && participantCount === 1) {
    footer = 'Du führst aktuell als einziger Teilnehmer.';
  } else if (isLeader && second) {
    const lead = me.totalRepetitions - second.totalRepetitions;
    footer = `Du führst mit ${lead.toLocaleString('de-DE')} PushUps Vorsprung.`;
  } else if (leader) {
    const gap = leader.totalRepetitions - me.totalRepetitions;
    footer = `${gap.toLocaleString('de-DE')} bis Platz 1`;
  } else {
    footer = '';
  }

  // Farbschema (UI-Polish, Phase 12): Gold ausschließlich für Platz 1,
  // sonst die bestehende Brand-Farbe für den eigenen Nutzer.
  const rankColorClass = isLeader
    ? 'text-amber-300 [text-shadow:0_0_20px_rgba(251,191,36,0.3)]'
    : 'text-brand-300 [text-shadow:0_0_20px_rgba(99,102,241,0.3)]';

  return (
    <Card className={PREMIUM_CARD}>
      <CardTitle>Deine Position</CardTitle>
      <p className={`mt-1.5 tabular-nums text-3xl font-extrabold tracking-tight ${rankColorClass}`}>
        #{me.rank}
      </p>
      <p className="tabular-nums text-lg font-bold text-white">
        {me.totalRepetitions.toLocaleString('de-DE')} <span className="text-sm font-medium text-slate-400">PushUps</span>
      </p>
      <div className="mt-4 grid grid-cols-3 gap-x-3 border-t border-ink-700/60 pt-4">
        <StatCell label="Sätze" value={String(me.setCount)} dotClassName="bg-brand-400" />
        <StatCell label="Ø"     value={formatAverage(me.averageSet)} dotClassName="bg-brand-400" />
        <StatCell label="Best"  value={String(me.maxSet ?? '—')} dotClassName="bg-brand-400" />
      </div>
      {footer && (
        <p className="mt-4 border-t border-ink-700/60 pt-3 text-sm font-semibold text-slate-300">
          {footer}
        </p>
      )}
    </Card>
  );
}

// ── Dein Duell ─────────────────────────────────────────────────────────────
// Kompakter Ausschnitt der Rangliste: Nutzer direkt über mir, ich selbst,
// Nutzer direkt unter mir. Rangliste kommt bereits serverseitig sortiert
// (RANK() mit eindeutigem Tiebreaker) → Nachbarn sind einfach Index ±1.

interface DuelArrow {
  symbol: '↑' | '↓';
  value: number;
}

function DuelRow({
  entry,
  arrow,
  highlight,
}: {
  entry: DailyChallengeLeaderboardEntry;
  arrow: DuelArrow | null;
  highlight: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 ${
        highlight ? 'bg-brand-600/15 ring-1 ring-inset ring-brand-500/40' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-6 shrink-0 text-xs font-bold tabular-nums text-slate-500">
          #{entry.rank}
        </span>
        <span
          className={`min-w-0 truncate text-sm font-semibold ${
            highlight ? 'text-brand-200' : 'text-slate-300'
          }`}
        >
          {entry.displayName}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        {arrow && (
          <span
            className={`text-xs font-semibold tabular-nums ${
              arrow.symbol === '↑' ? 'text-slate-500' : 'text-emerald-400'
            }`}
          >
            {arrow.symbol} {arrow.value.toLocaleString('de-DE')}
          </span>
        )}
        <span className="tabular-nums text-sm font-bold text-white">
          {entry.totalRepetitions.toLocaleString('de-DE')}
        </span>
      </div>
    </div>
  );
}

interface DuelCardProps {
  leaderboard: DailyChallengeLeaderboardEntry[];
  isLoadingLeaderboard: boolean;
  leaderboardError: string | null;
}

function DuelCard({ leaderboard, isLoadingLeaderboard, leaderboardError }: DuelCardProps) {
  if (leaderboardError) return null;
  if (isLoadingLeaderboard && leaderboard.length === 0) return null;

  const myIndex = leaderboard.findIndex(e => e.isMe);
  // Kein eigener Satz heute (nicht in der Live-Rangliste) oder nur ein
  // Teilnehmer insgesamt → kein sinnvolles Duell darstellbar.
  if (myIndex === -1 || leaderboard.length < 2) return null;

  const me = leaderboard[myIndex];
  const above = myIndex > 0 ? leaderboard[myIndex - 1] : null;
  const below = myIndex < leaderboard.length - 1 ? leaderboard[myIndex + 1] : null;

  const aboveArrow: DuelArrow | null = above
    ? { symbol: '↑', value: above.totalRepetitions - me.totalRepetitions }
    : null;
  const belowArrow: DuelArrow | null = below
    ? { symbol: '↓', value: me.totalRepetitions - below.totalRepetitions }
    : null;

  const isLeader = me.rank === 1;

  return (
    <Card className={PREMIUM_CARD}>
      <CardTitle>Dein Duell</CardTitle>
      <div className="mt-2 space-y-1">
        {above && <DuelRow entry={above} arrow={aboveArrow} highlight={false} />}
        <DuelRow entry={me} arrow={null} highlight />
        {below && <DuelRow entry={below} arrow={belowArrow} highlight={false} />}
      </div>
      {isLeader && belowArrow && (
        <p className="mt-3 border-t border-ink-700/60 pt-3 text-sm font-semibold text-slate-300">
          Du führst mit {belowArrow.value.toLocaleString('de-DE')}.
        </p>
      )}
    </Card>
  );
}

// ── Tages-Stats ────────────────────────────────────────────────────────────
// Aggregat über alle Teilnehmer des Tages. Rein clientseitig aus der bereits
// geladenen leaderboard-Liste summiert — keine neue RPC nötig. Zeigt bewusst
// nur Werte, die nicht schon direkt darüber prominent zu sehen sind (bester
// Satz z. B. steht bereits im Performance-Badge und wird hier nicht wiederholt).

function DailyStatsCard({ leaderboard }: { leaderboard: DailyChallengeLeaderboardEntry[] }) {
  if (leaderboard.length === 0) return null;

  const participantCount = leaderboard.length;
  const totalPushups = leaderboard.reduce((sum, e) => sum + e.totalRepetitions, 0);
  const totalSets = leaderboard.reduce((sum, e) => sum + e.setCount, 0);
  const averagePerSet = totalSets > 0 ? totalPushups / totalSets : null;

  return (
    <Card className={PREMIUM_CARD}>
      <CardTitle>Tages-Stats</CardTitle>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3.5">
        <StatCell label="Teilnehmer" value={String(participantCount)} dotClassName="bg-brand-400" />
        <StatCell label="PushUps gesamt" value={totalPushups.toLocaleString('de-DE')} dotClassName="bg-brand-400" />
        <StatCell label="Sätze gesamt" value={String(totalSets)} dotClassName="bg-brand-400" />
        <StatCell label="Ø pro Satz" value={formatAverage(averagePerSet)} dotClassName="bg-brand-400" />
      </div>
    </Card>
  );
}

// ── Performance-Badges ─────────────────────────────────────────────────────
// Kleine, sekundäre Auszeichnungen für Werte, die in der Hauptwertung
// (Gesamt-PushUps) NICHT sichtbar sind. "Meiste PushUps" wird bewusst nicht
// als Badge gezeigt — das ist exakt Platz 1 der Rangliste und würde nur
// duplizieren, was dort bereits gold hervorgehoben ist (kein Mehrwert).
// Bei Gleichstand gewinnt der zuerst in der (nach Rang sortierten) Liste
// stehende Eintrag — deterministisch, ohne zusätzliche "geteilt"-Anzeige,
// um die Badges kompakt zu halten.

interface BadgeWinner {
  displayName: string;
  valueLabel: string;
}

function findBestAverage(leaderboard: DailyChallengeLeaderboardEntry[]): BadgeWinner | null {
  let best: DailyChallengeLeaderboardEntry | null = null;
  for (const entry of leaderboard) {
    if (entry.averageSet == null) continue;
    if (!best || best.averageSet == null || entry.averageSet > best.averageSet) best = entry;
  }
  if (!best || best.averageSet == null) return null;
  return { displayName: best.displayName, valueLabel: `Ø ${formatAverage(best.averageSet)}` };
}

function findBestSet(leaderboard: DailyChallengeLeaderboardEntry[]): BadgeWinner | null {
  let best: DailyChallengeLeaderboardEntry | null = null;
  for (const entry of leaderboard) {
    if (entry.maxSet == null) continue;
    if (!best || best.maxSet == null || entry.maxSet > best.maxSet) best = entry;
  }
  if (!best || best.maxSet == null) return null;
  return { displayName: best.displayName, valueLabel: String(best.maxSet) };
}

function BadgeCell({ label, winner }: { label: string; winner: BadgeWinner }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-ink-700/60 bg-ink-900/40 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-200">{winner.displayName}</p>
      <p className="tabular-nums text-xs text-brand-300">{winner.valueLabel}</p>
    </div>
  );
}

function PerformanceBadges({ leaderboard }: { leaderboard: DailyChallengeLeaderboardEntry[] }) {
  // Bei nur einem Teilnehmer sind Badges identisch mit "Deine Position" —
  // kein Mehrwert, daher ausblenden.
  if (leaderboard.length < 2) return null;

  const bestAverage = findBestAverage(leaderboard);
  const bestSet = findBestSet(leaderboard);
  if (!bestAverage && !bestSet) return null;

  return (
    <Card className={PREMIUM_CARD}>
      <CardTitle>Performance</CardTitle>
      <div className="mt-2 flex gap-2.5">
        {bestAverage && <BadgeCell label="Bester Schnitt" winner={bestAverage} />}
        {bestSet && <BadgeCell label="Bester Satz" winner={bestSet} />}
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
  isActive: boolean;
  isLoadingLeaderboard: boolean;
  leaderboardError: string | null;
  leaderboard: DailyChallengeLeaderboardEntry[];
  refreshLeaderboard: () => Promise<void>;
  onSelectParticipant: (entry: DailyChallengeLeaderboardEntry) => void;
}

// Visuelle Hierarchie (UI-Polish, Phase 12):
// Deine Position → Dein Duell → Rangliste → Performance → Tages-Stats.
// Die frühere StatusCard (großer Countdown, "Challenge läuft") und die alte
// "Deine Leistung"-Karte (Sätze/Ø/Kleinster/Bester) entfallen — beide
// duplizierten nur noch, was seit Phase 1/2 bereits im Header bzw. in
// "Deine Position" steht. Daily Live zeigt Wettbewerb, nicht Status-Text.
function LiveTab({
  isActive,
  isLoadingLeaderboard,
  leaderboardError,
  leaderboard,
  refreshLeaderboard,
  onSelectParticipant,
}: LiveTabProps) {
  return (
    <div className="flex flex-col gap-3">
      <MyPositionCard
        leaderboard={leaderboard}
        isLoadingLeaderboard={isLoadingLeaderboard}
        leaderboardError={leaderboardError}
      />
      <DuelCard
        leaderboard={leaderboard}
        isLoadingLeaderboard={isLoadingLeaderboard}
        leaderboardError={leaderboardError}
      />
      <LeaderboardCard
        isActive={isActive}
        leaderboard={leaderboard}
        isLoadingLeaderboard={isLoadingLeaderboard}
        leaderboardError={leaderboardError}
        refreshLeaderboard={refreshLeaderboard}
        onSelectParticipant={onSelectParticipant}
      />
      {!leaderboardError && <PerformanceBadges leaderboard={leaderboard} />}
      {!leaderboardError && <DailyStatsCard leaderboard={leaderboard} />}
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

// ── Verlauf-Tab ────────────────────────────────────────────────────────────
// Wettkampfergebnisse vergangener Tage. Wiederverwendet die bestehende
// History-RPC-Infrastruktur (DailyChallengeHistory.tsx) — kein zweiter,
// konkurrierender Verlauf zu Arena Rückblick (separates Feature).

function HistoryTab({
  exerciseId,
  challengeDate,
  onSelectDay,
}: {
  exerciseId: string | null;
  challengeDate: string | null;
  onSelectDay: (date: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <HistoryList exerciseId={exerciseId} challengeDate={challengeDate} onSelectDay={onSelectDay} />
    </div>
  );
}

// ── Teilnehmerdetail ───────────────────────────────────────────────────────
// Nur lesend: zeigt die heutigen Sätze eines anderen Teilnehmers. Keine
// Satz-Eingabe, kein Edit/Delete — das bleibt bewusst außerhalb von Daily
// Live (Dashboard/NavDrawer), wie bei "Deine Sätze" auch.

function ParticipantDetailSheet({
  participant,
  sets,
  isLoading,
  error,
  onClose,
}: {
  participant: DailyChallengeLeaderboardEntry;
  sets: DailyChallengeParticipantSet[];
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const averageSetValue = formatAverage(participant.averageSet);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Sätze von ${participant.displayName}`}
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-ink-700 bg-ink-900 px-4 pt-4"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-700" />

        <div className="flex items-center gap-3">
          <Avatar url={participant.avatarUrl} name={participant.displayName} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-slate-100">
              {participant.displayName}
            </p>
            <p className="text-xs text-slate-500">Platz {participant.rank}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-ink-800 hover:text-slate-200"
            aria-label="Schließen"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-x-3 border-t border-ink-700/60 pt-4">
          <StatCell
            label="PushUps"
            value={participant.totalRepetitions.toLocaleString('de-DE')}
            dotClassName="bg-brand-400"
          />
          <StatCell label="Sätze" value={String(participant.setCount)} dotClassName="bg-brand-400" />
          <StatCell label="Ø" value={averageSetValue} dotClassName="bg-brand-400" />
        </div>

        <div className="mt-4 border-t border-ink-700/60 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Sätze heute
          </p>

          {error ? (
            <p className="mt-2 text-sm text-slate-500">Sätze konnten nicht geladen werden.</p>
          ) : isLoading && sets.length === 0 ? (
            <div className="mt-2 animate-pulse space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-8 rounded-md bg-ink-800" />
              ))}
            </div>
          ) : sets.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Keine Sätze gefunden.</p>
          ) : (
            <ul className="mt-1.5 divide-y divide-ink-800">
              {sets.map(set => (
                <li key={set.id} className="flex items-center justify-between py-2.5">
                  <span className="tabular-nums text-xs text-slate-500">
                    {formatBerlinTime(set.createdAt)} Uhr
                  </span>
                  <span className="tabular-nums text-sm font-bold text-white">
                    {set.repetitions} <span className="text-xs font-normal text-slate-500">Wdh.</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Haupt-Komponente ───────────────────────────────────────────────────────

export function DailyChallengeModal({ onClose }: { onClose: () => void }) {
  // Einzige Hook-Instanz — alle Kinder erhalten Daten als Props.
  // Kein secondsUntilStart/End hier: Countdown läuft isoliert in
  // HeaderRemainingTime und löst keinen Modal-Re-Render aus.
  const {
    exerciseId,
    status,
    challengeDate,
    isActive,
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

  const hasStatus = status !== null;

  const [activeTab, setActiveTab] = useState<Tab>('live');

  // ── Verlauf (nur lesend) ───────────────────────────────────────────────────
  const [selectedHistoryDay, setSelectedHistoryDay] = useState<string | null>(null);

  // ── Teilnehmerdetail (nur lesend) ─────────────────────────────────────────
  const [selectedParticipant, setSelectedParticipant] =
    useState<DailyChallengeLeaderboardEntry | null>(null);
  const [participantSets, setParticipantSets] = useState<DailyChallengeParticipantSet[]>([]);
  const [isLoadingParticipantSets, setIsLoadingParticipantSets] = useState(false);
  const [participantSetsError, setParticipantSetsError] = useState<string | null>(null);

  // Auch für den Realtime-Resync unten wiederverwendet — lädt die Sätze
  // eines Teilnehmers neu, ohne den restlichen Sheet-State anzufassen.
  const fetchParticipantSets = useCallback(
    (userId: string) => {
      if (!exerciseId) return;
      setParticipantSetsError(null);
      setIsLoadingParticipantSets(true);
      void supabase
        .rpc('get_daily_challenge_participant_sets_today', {
          p_exercise_id: exerciseId,
          p_user_id: userId,
        })
        .then(({ data, error }) => {
          if (error) throw error;
          setParticipantSets((data ?? []).map(mapParticipantSet));
        })
        .catch((err: unknown) => {
          console.error('Daily Live participant-sets RPC failed:', err);
          setParticipantSetsError('Sätze konnten nicht geladen werden.');
        })
        .finally(() => setIsLoadingParticipantSets(false));
    },
    [exerciseId]
  );

  // Realtime-Resync: hält ein bereits geöffnetes Teilnehmerdetail aktuell,
  // sobald sich die (bereits per live_activity aktualisierte) Rangliste
  // ändert — z. B. wenn der betrachtete Teilnehmer selbst einen Satz
  // hinzufügt/löscht, oder wenn sich durch andere Nutzer sein Rang
  // verschiebt. Kein zusätzlicher Realtime-Channel nötig: die Rangliste
  // wird bereits zentral in useDailyChallenge aktuell gehalten.
  const lastSyncedParticipantRef = useRef<{
    userId: string;
    setCount: number;
    totalRepetitions: number;
  } | null>(null);

  const handleSelectParticipant = useCallback(
    (entry: DailyChallengeLeaderboardEntry) => {
      setSelectedParticipant(entry);
      setParticipantSets([]);
      // Snapshot direkt übernehmen, damit der Resync-Effekt unten nicht
      // sofort einen redundanten zweiten Fetch auslöst (er würde sonst noch
      // den Stand des zuvor ausgewählten Teilnehmers im Ref vorfinden).
      lastSyncedParticipantRef.current = {
        userId:           entry.userId,
        setCount:         entry.setCount,
        totalRepetitions: entry.totalRepetitions,
      };
      fetchParticipantSets(entry.userId);
    },
    [fetchParticipantSets]
  );

  const handleCloseParticipant = useCallback(() => setSelectedParticipant(null), []);

  useEffect(() => {
    if (!selectedParticipant) {
      lastSyncedParticipantRef.current = null;
      return;
    }
    const updated = leaderboard.find(e => e.userId === selectedParticipant.userId);
    if (!updated) {
      // Teilnehmer hat keine Sätze mehr heute (z. B. letzter Satz gelöscht) →
      // Sheet zeigt sonst veraltete/falsche Daten, also schließen.
      setSelectedParticipant(null);
      return;
    }
    const prev = lastSyncedParticipantRef.current;
    const setsChanged =
      !prev ||
      prev.setCount !== updated.setCount ||
      prev.totalRepetitions !== updated.totalRepetitions;
    lastSyncedParticipantRef.current = {
      userId:           updated.userId,
      setCount:         updated.setCount,
      totalRepetitions: updated.totalRepetitions,
    };
    setSelectedParticipant(updated);
    if (setsChanged) fetchParticipantSets(updated.userId);
    // selectedParticipant absichtlich nicht in den Deps: nur leaderboard-
    // Änderungen sollen diesen Sync auslösen, nicht der eigene setState-Aufruf.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboard]);

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
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-400">
              Daily Live
            </p>
            <h2 className="mt-0.5 text-xl font-extrabold text-slate-100">Tageswettkampf</h2>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <span>PushUp</span>
              <span aria-hidden="true">&middot;</span>
              <span>Heute</span>
              {hasStatus && (
                <>
                  <span aria-hidden="true">&middot;</span>
                  {isActive ? (
                    <span className="flex items-center gap-1 font-semibold text-emerald-400">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                      Live
                    </span>
                  ) : (
                    <span className="font-semibold text-slate-500">Pausiert</span>
                  )}
                </>
              )}
            </div>
            {isActive && (
              <HeaderRemainingTime
                targetTime={endsAt}
                serverNow={serverNow}
                onEnd={handleCountdownEnd}
              />
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-ink-800 hover:text-slate-200"
            aria-label="Schließen"
          >
            <CloseIcon />
          </button>
        </div>
        <div role="tablist" aria-label="Daily-Live-Ansicht" className="mt-3 flex gap-1">
          <TabPill label="Live"        active={activeTab === 'live'} onClick={() => setActiveTab('live')} />
          <TabPill label="Deine Sätze" active={activeTab === 'sets'} onClick={() => setActiveTab('sets')} />
          <TabPill label="Verlauf"     active={activeTab === 'history'} onClick={() => setActiveTab('history')} />
        </div>
      </div>

      {/* Scrollbarer Inhalt */}
      <div
        className="flex-1 overflow-y-auto px-4 pt-4"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {activeTab === 'live' ? (
          <LiveTab
            isActive={isActive}
            isLoadingLeaderboard={isLoadingLeaderboard}
            leaderboardError={leaderboardError}
            leaderboard={leaderboard}
            refreshLeaderboard={refreshLeaderboard}
            onSelectParticipant={handleSelectParticipant}
          />
        ) : activeTab === 'sets' ? (
          <SetsTab
            mySets={mySets}
            isLoadingMySets={isLoadingMySets}
            setsError={setsError}
            refreshMySets={refreshMySets}
          />
        ) : (
          <HistoryTab exerciseId={exerciseId} challengeDate={challengeDate} onSelectDay={setSelectedHistoryDay} />
        )}
      </div>

      {selectedParticipant && (
        <ParticipantDetailSheet
          participant={selectedParticipant}
          sets={participantSets}
          isLoading={isLoadingParticipantSets}
          error={participantSetsError}
          onClose={handleCloseParticipant}
        />
      )}

      {selectedHistoryDay && (
        <DayResultSheet
          exerciseId={exerciseId}
          date={selectedHistoryDay}
          onClose={() => setSelectedHistoryDay(null)}
        />
      )}
    </div>
  );
}
