// Verlauf für Daily Live — Wettkampfergebnisse vergangener Tage.
// Wiederverwendet die bestehenden, bereits produktiven RPCs
// get_challenge_history (Liste meiner Ergebnisse pro Tag) und
// get_daily_challenge_day_details (volle Tagesrangliste, lazy finalisiert).
// Keine neue RPC, keine neue Tabelle. Rein lesend.
//
// Bewusst getrennt von Arena Rückblick (separates Feature, unangetastet).

import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Card, CardTitle } from '@/components/ui/Card';
import { supabase } from '@/lib/supabase';
import { formatRelativeDay } from '@/lib/date';
import {
  mapDayDetails,
  mapHistoryDay,
  type DailyChallengeDayDetails,
  type DailyChallengeDayLeaderboardEntry,
  type DailyChallengeHistoryDay,
} from '@/lib/dailyChallenge.types';

const PREMIUM_CARD = 'border-ink-600/60 shadow-glow bg-gradient-to-b from-ink-800/85 to-ink-800/55';

function formatAverage(averageSet: number | null): string {
  if (averageSet == null) return '—';
  return averageSet.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function rankMedal(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `#${rank}`;
}

// ── Verlaufsliste ──────────────────────────────────────────────────────────

interface HistoryListProps {
  exerciseId: string | null;
  /** Heutiges Berliner Datum aus dem Status-RPC. Ändert es sich (Tageswechsel),
   *  wird neu geladen — sonst würde der gerade abgeschlossene Vortag fehlen,
   *  falls der Verlauf-Tab exakt über Mitternacht hinweg offen bleibt. */
  challengeDate: string | null;
  onSelectDay: (date: string) => void;
}

export function HistoryList({ exerciseId, challengeDate, onSelectDay }: HistoryListProps) {
  const [days, setDays] = useState<DailyChallengeHistoryDay[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciseId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void supabase
      .rpc('get_challenge_history', { p_exercise_id: exerciseId, p_limit: 14 })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) throw rpcError;
        setDays((data ?? []).map(mapHistoryDay));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('Daily Live history RPC failed:', err);
        setError('Verlauf konnte nicht geladen werden.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [exerciseId, challengeDate]);

  if (error) {
    return (
      <Card className={PREMIUM_CARD}>
        <CardTitle>Verlauf</CardTitle>
        <p className="mt-2 text-sm text-slate-500">{error}</p>
      </Card>
    );
  }

  if (isLoading && days.length === 0) {
    return (
      <Card className={PREMIUM_CARD}>
        <CardTitle>Verlauf</CardTitle>
        <div className="mt-2 animate-pulse space-y-2">
          {[0, 1, 2].map(i => <div key={i} className="h-12 rounded-xl bg-ink-800" />)}
        </div>
      </Card>
    );
  }

  if (days.length === 0) {
    return (
      <Card className={PREMIUM_CARD}>
        <CardTitle>Verlauf</CardTitle>
        <p className="mt-2 text-sm text-slate-500">Noch keine vergangenen Tage.</p>
      </Card>
    );
  }

  return (
    <Card className={PREMIUM_CARD}>
      <CardTitle>Verlauf</CardTitle>
      <ul className="mt-2 space-y-2">
        {days.map(day => (
          <li key={day.challengeDate}>
            <button
              type="button"
              onClick={() => onSelectDay(day.challengeDate)}
              className="flex w-full items-center gap-3 rounded-xl border border-ink-800 px-3 py-2.5 text-left transition hover:bg-ink-800/60 active:scale-[0.99]"
            >
              <span className="w-8 shrink-0 text-center text-base leading-none">
                {rankMedal(day.rank)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-200">
                  {formatRelativeDay(day.challengeDate)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Platz {day.rank} von {day.participantCount}
                </p>
              </div>
              <span className="shrink-0 tabular-nums text-sm font-bold text-brand-300">
                {day.totalRepetitions.toLocaleString('de-DE')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Tagesergebnis-Sheet ────────────────────────────────────────────────────

// Qualifikation: mind. 2 getrennte Sätze an diesem Tag — ein einzelner,
// gebündelt eingetragener Riesensatz soll diese Auszeichnungen nicht
// gewinnen können. Gleiche Regel wie bei den Live-Badges (DailyChallengeModal.tsx).

function findBestAverage(entries: DailyChallengeDayLeaderboardEntry[]) {
  let best: DailyChallengeDayLeaderboardEntry | null = null;
  for (const e of entries) {
    if (e.setCount < 2) continue;
    if (e.averageSet == null) continue;
    if (!best || best.averageSet == null || e.averageSet > best.averageSet) best = e;
  }
  return best;
}

function findBestSet(entries: DailyChallengeDayLeaderboardEntry[]) {
  let best: DailyChallengeDayLeaderboardEntry | null = null;
  for (const e of entries) {
    if (e.setCount < 2) continue;
    if (e.maxSet == null) continue;
    if (!best || best.maxSet == null || e.maxSet > best.maxSet) best = e;
  }
  return best;
}

function HistoryBadgeCell({
  label,
  winner,
}: {
  label: string;
  winner: { displayName: string; valueLabel: string } | null;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-ink-700/60 bg-ink-800/40 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      {winner ? (
        <>
          <p className="mt-1 truncate text-sm font-semibold text-slate-200">{winner.displayName}</p>
          <p className="tabular-nums text-xs text-brand-300">{winner.valueLabel}</p>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm font-semibold text-slate-500">Noch nicht vergeben</p>
          <p className="text-[10px] text-slate-600">Ab 2 Sätzen</p>
        </>
      )}
    </div>
  );
}

export function DayResultSheet({
  exerciseId,
  date,
  onClose,
}: {
  exerciseId: string | null;
  date: string;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<DailyChallengeDayDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!exerciseId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    void supabase
      .rpc('get_daily_challenge_day_details', { p_exercise_id: exerciseId, p_date: date })
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) throw rpcError;
        const mapped = mapDayDetails(data);
        if (!mapped) throw new Error('Kein Ergebnis für diesen Tag.');
        setDetails(mapped);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('Daily Live day-details RPC failed:', err);
        setError('Ergebnis konnte nicht geladen werden.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [exerciseId, date]);

  const bestAverage = details ? findBestAverage(details.leaderboard) : null;
  const bestSet = details ? findBestSet(details.leaderboard) : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Tagesergebnis"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-ink-700 bg-ink-900 px-4 pt-4"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-700" />

        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Daily Live Beendet
            </p>
            <h3 className="mt-0.5 text-base font-extrabold text-slate-100">
              {formatRelativeDay(date)}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-ink-800 hover:text-slate-200"
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-slate-500">{error}</p>
        ) : isLoading && !details ? (
          <div className="mt-4 animate-pulse space-y-2">
            {[0, 1, 2].map(i => <div key={i} className="h-12 rounded-xl bg-ink-800" />)}
          </div>
        ) : details && details.leaderboard.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            Niemand hat an diesem Tag PushUps gemacht.
          </p>
        ) : details ? (
          <>
            <ul className="mt-4 space-y-1.5">
              {details.leaderboard.map(entry => (
                <li
                  key={entry.userId}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 ${
                    entry.isMe ? 'bg-brand-600/15 ring-1 ring-inset ring-brand-500/40' : ''
                  }`}
                >
                  <span className="w-7 shrink-0 text-center text-sm font-bold tabular-nums text-slate-400">
                    {rankMedal(entry.rank)}
                  </span>
                  <Avatar url={entry.avatarUrl} name={entry.displayName} size={28} />
                  <span
                    className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                      entry.isMe ? 'text-brand-200' : 'text-slate-200'
                    }`}
                  >
                    {entry.displayName}
                  </span>
                  <span className="shrink-0 tabular-nums text-sm font-bold text-white">
                    {entry.totalRepetitions.toLocaleString('de-DE')}
                  </span>
                </li>
              ))}
            </ul>

            {/* Dieser Zweig wird nur erreicht, wenn details.leaderboard nicht leer
                ist (leerer Fall wird oben separat behandelt) — daher hier immer
                sichtbar, mit "Noch nicht vergeben" falls niemand qualifiziert ist. */}
            <div className="mt-4 flex gap-2.5 border-t border-ink-700/60 pt-4">
              <HistoryBadgeCell
                label="Bester Einzelsatz"
                winner={bestSet ? { displayName: bestSet.displayName, valueLabel: String(bestSet.maxSet) } : null}
              />
              <HistoryBadgeCell
                label="Bester Satzdurchschnitt"
                winner={
                  bestAverage
                    ? { displayName: bestAverage.displayName, valueLabel: `Ø ${formatAverage(bestAverage.averageSet)}` }
                    : null
                }
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
