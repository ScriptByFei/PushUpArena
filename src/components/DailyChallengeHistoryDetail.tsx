// Historische Tages- und Teilnehmerdetailansicht für den Verlauf-Tab.
// Reine Props-Komponenten — kein eigener Supabase-Zugriff.
// Navigation: list → day → participant; gemanagt in DailyChallengeModal.

import { Avatar } from '@/components/ui/Avatar';
import { Card, CardTitle } from '@/components/ui/Card';
import { formatBerlinTime, formatChallengeDateLong } from '@/lib/date';
import type {
  DailyChallengeDayDetails,
  DailyChallengeHistoricalLeaderboardEntry,
  DailyChallengeParticipantDetails,
} from '@/lib/dailyChallenge.types';

// ── Rang-Stil-Helfer (identisch zu DailyChallengeLeaderboard) ─────────────

function rankTextColor(rank: number): string {
  if (rank === 1) return 'text-amber-400';
  if (rank === 2) return 'text-slate-400';
  if (rank === 3) return 'text-orange-400';
  return 'text-slate-500';
}

function rowAccentClass(rank: number, isMe: boolean): string {
  const base = 'rounded-xl border px-3 py-2.5';
  if (rank === 1) return `${base} border-amber-500/30 bg-amber-500/5${isMe ? ' ring-1 ring-brand-500/30' : ''}`;
  if (rank === 2) return `${base} border-slate-400/25${isMe ? ' bg-brand-400/8 ring-1 ring-brand-500/25' : ' bg-slate-400/4'}`;
  if (rank === 3) return `${base} border-orange-500/25${isMe ? ' bg-brand-400/8 ring-1 ring-brand-500/25' : ' bg-orange-500/4'}`;
  return `${base}${isMe ? ' border-brand-500/30 bg-brand-400/8' : ' border-ink-800'}`;
}

// ── Zurück-Button ──────────────────────────────────────────────────────────

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-slate-400 transition hover:text-slate-200"
      aria-label="Zurück"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
        <path
          fillRule="evenodd"
          d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
          clipRule="evenodd"
        />
      </svg>
      Zurück
    </button>
  );
}

// ── Kompakte Stat-Zelle ────────────────────────────────────────────────────

function StatCell({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[11px] uppercase tracking-wide text-slate-600">{label}</p>
      <p className="tabular-nums text-lg font-bold leading-none text-slate-100">
        {value ?? '–'}
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TAGESDETAIL-ANSICHT
// ────────────────────────────────────────────────────────────────────────────

// ── Tageskopf ──────────────────────────────────────────────────────────────

function DayHeader({ challengeDate, onBack }: { challengeDate: string; onBack: () => void }) {
  return (
    <div className="mb-4">
      <BackButton onBack={onBack} />
      <div className="mt-2 flex items-center gap-2">
        <h2 className="text-lg font-extrabold text-slate-100">
          {formatChallengeDateLong(challengeDate)}
        </h2>
        <span className="rounded bg-slate-700/60 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Abgeschlossen
        </span>
      </div>
    </div>
  );
}

// ── Tageszusammenfassungs-Skeleton ─────────────────────────────────────────

function DaySummarySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {/* Sieger-Skeleton */}
      <Card>
        <div className="animate-pulse space-y-3">
          <div className="h-3 w-16 rounded bg-ink-700" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 shrink-0 rounded-full bg-ink-700" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-28 rounded bg-ink-700" />
              <div className="h-3 w-16 rounded bg-ink-700" />
            </div>
          </div>
        </div>
      </Card>
      {/* Stats-Skeleton */}
      <Card>
        <div className="animate-pulse grid grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-2.5 w-20 rounded bg-ink-700" />
              <div className="h-5 w-12 rounded bg-ink-700" />
            </div>
          ))}
        </div>
      </Card>
      {/* Ranglisten-Skeleton */}
      <Card>
        <div className="h-3.5 w-24 rounded bg-ink-700 animate-pulse" />
        <div className="mt-2 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-ink-800 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="h-4 w-5 rounded bg-ink-700" />
                <div className="h-8 w-8 rounded-full bg-ink-700" />
                <div className="flex-1 space-y-1.5">
                  <div className={`h-3.5 rounded bg-ink-700 ${i === 0 ? 'w-28' : 'w-20'}`} />
                  <div className="h-3 w-32 rounded bg-ink-700" />
                </div>
                <div className="h-5 w-7 rounded bg-ink-700" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Sieger-Karte ───────────────────────────────────────────────────────────

function WinnerCard({
  displayName,
  avatarUrl,
  totalRepetitions,
}: {
  displayName: string | null;
  avatarUrl: string | null;
  totalRepetitions: number | null;
}) {
  if (!displayName) return null;
  return (
    <Card className="border-amber-500/25 bg-amber-500/5">
      <p className="text-[11px] uppercase tracking-wide text-amber-500/70">Sieger</p>
      <div className="mt-2 flex items-center gap-3">
        <Avatar url={avatarUrl} name={displayName} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-100">{displayName}</p>
          <p className="text-sm text-amber-400">
            <span className="tabular-nums font-bold">{totalRepetitions ?? '–'}</span> Wdh.
          </p>
        </div>
        <p className="shrink-0 text-2xl font-extrabold text-amber-400">1</p>
      </div>
    </Card>
  );
}

// ── Einzelner Ranglisten-Eintrag (anklickbar) ─────────────────────────────

function HistoricalLeaderboardRow({
  entry,
  onSelect,
}: {
  entry: DailyChallengeHistoricalLeaderboardEntry;
  onSelect: (userId: string) => void;
}) {
  const { rank, userId, displayName, avatarUrl, totalRepetitions, setCount, maxSet, lastSetAt, isMe } = entry;
  return (
    <li>
      <button
        onClick={() => onSelect(userId)}
        className={`w-full text-left transition active:scale-[0.98] ${rowAccentClass(rank, isMe)}`}
      >
        <div className="flex items-center gap-2.5">
          {/* Platz */}
          <span className={`w-5 shrink-0 text-center text-sm font-bold tabular-nums ${rankTextColor(rank)}`}>
            {rank}
          </span>

          {/* Avatar */}
          <Avatar url={avatarUrl} name={displayName} size={32} />

          {/* Name + Meta */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-slate-100">{displayName}</span>
              {isMe && (
                <span className="shrink-0 rounded bg-brand-400/15 px-1 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-400">
                  Du
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {setCount} {setCount === 1 ? 'Satz' : 'Sätze'}
              {maxSet != null && ` · Bester ${maxSet}`}
              {lastSetAt && ` · ${formatBerlinTime(lastSetAt)} Uhr`}
            </p>
          </div>

          {/* Gesamt-Wdh. */}
          <div className="shrink-0 text-right">
            <p className="tabular-nums text-base font-bold leading-none text-slate-100">
              {totalRepetitions}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-600">Wdh.</p>
          </div>

          {/* Chevron */}
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-slate-700">
            <path
              fillRule="evenodd"
              d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>
    </li>
  );
}

// ── Tagesdetail-Ansicht (exportiert) ───────────────────────────────────────

export interface HistoryDayViewProps {
  challengeDate: string;
  dayDetails: DailyChallengeDayDetails | null;
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
  onSelectParticipant: (userId: string) => void;
  retryLoadDay: () => void;
}

export function HistoryDayView({
  challengeDate,
  dayDetails,
  isLoading,
  error,
  onBack,
  onSelectParticipant,
  retryLoadDay,
}: HistoryDayViewProps) {
  return (
    <div className="flex flex-col gap-3">
      <DayHeader challengeDate={challengeDate} onBack={onBack} />

      {/* Fehler */}
      {error && (
        <Card>
          <CardTitle>Fehler</CardTitle>
          <p className="mt-2 text-sm text-slate-500">
            Die Challenge-Details konnten nicht geladen werden.
          </p>
          <button
            onClick={retryLoadDay}
            className="mt-3 rounded-xl border border-ink-600 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-ink-700"
          >
            Erneut versuchen
          </button>
        </Card>
      )}

      {/* Skeleton */}
      {isLoading && !dayDetails && !error && <DaySummarySkeleton />}

      {/* Inhalt */}
      {dayDetails && !error && (
        <>
          {/* Sieger */}
          <WinnerCard
            displayName={dayDetails.summary.winnerDisplayName}
            avatarUrl={dayDetails.summary.winnerAvatarUrl}
            totalRepetitions={dayDetails.summary.winnerTotalRepetitions}
          />

          {/* Tages-Statistiken */}
          <Card>
            <div className="grid grid-cols-2 gap-4">
              <StatCell label="Teilnehmer"          value={dayDetails.summary.participantCount} />
              <StatCell label="Gesamtwiederholungen" value={dayDetails.summary.totalRepetitions} />
              <StatCell label="Gesamtsätze"          value={dayDetails.summary.totalSets} />
              <StatCell label="Größter Satz"         value={dayDetails.summary.maxSet} />
            </div>
          </Card>

          {/* Finale Rangliste */}
          <Card>
            <div className="flex items-baseline justify-between">
              <CardTitle>Finale Rangliste</CardTitle>
              <span className="text-xs text-slate-600">
                {dayDetails.leaderboard.length} Teilnehmer
              </span>
            </div>
            {dayDetails.leaderboard.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Keine Einträge vorhanden.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {dayDetails.leaderboard.map(entry => (
                  <HistoricalLeaderboardRow
                    key={entry.userId}
                    entry={entry}
                    onSelect={onSelectParticipant}
                  />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TEILNEHMERDETAIL-ANSICHT
// ────────────────────────────────────────────────────────────────────────────

// ── Teilnehmer-Skeleton ────────────────────────────────────────────────────

function ParticipantSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {/* Header-Karte */}
      <Card>
        <div className="animate-pulse space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 rounded-full bg-ink-700" />
            <div className="flex-1 space-y-1.5">
              <div className="h-4 w-32 rounded bg-ink-700" />
              <div className="h-3 w-16 rounded bg-ink-700" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-2.5 w-16 rounded bg-ink-700" />
                <div className="h-4 w-10 rounded bg-ink-700" />
              </div>
            ))}
          </div>
        </div>
      </Card>
      {/* Satzliste-Skeleton */}
      <Card>
        <div className="h-3.5 w-20 rounded bg-ink-700 animate-pulse" />
        <div className="mt-2 space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-3">
              <div className="h-3 w-10 rounded bg-ink-700" />
              <div className="h-3 w-20 rounded bg-ink-700" />
              <div className="ml-auto h-4 w-8 rounded bg-ink-700" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Satz-Zeile ─────────────────────────────────────────────────────────────

function SetRow({
  setNumber,
  repetitions,
  createdAt,
}: {
  setNumber: number;
  repetitions: number;
  createdAt: Date;
}) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span className="w-12 shrink-0 text-xs text-slate-600">Satz {setNumber}</span>
      <span className="tabular-nums text-xs text-slate-500">{formatBerlinTime(createdAt)} Uhr</span>
      <span className="ml-auto tabular-nums font-semibold text-slate-100">{repetitions}</span>
      <span className="text-xs text-slate-600">Wdh.</span>
    </li>
  );
}

// ── Teilnehmerdetail-Ansicht (exportiert) ─────────────────────────────────

export interface HistoryParticipantViewProps {
  challengeDate: string;
  participant: DailyChallengeParticipantDetails | null;
  isLoading: boolean;
  error: string | null;
  onBack: () => void;
  retryLoadParticipant: () => void;
}

export function HistoryParticipantView({
  challengeDate,
  participant,
  isLoading,
  error,
  onBack,
  retryLoadParticipant,
}: HistoryParticipantViewProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Mini-Kopfzeile */}
      <div>
        <BackButton onBack={onBack} />
        {participant && (
          <p className="mt-1 text-xs text-slate-600">{formatChallengeDateLong(challengeDate)}</p>
        )}
      </div>

      {/* Fehler */}
      {error && (
        <Card>
          <CardTitle>Fehler</CardTitle>
          <p className="mt-2 text-sm text-slate-500">
            Die Teilnehmerdetails konnten nicht geladen werden.
          </p>
          <button
            onClick={retryLoadParticipant}
            className="mt-3 rounded-xl border border-ink-600 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:bg-ink-700"
          >
            Erneut versuchen
          </button>
        </Card>
      )}

      {/* Skeleton */}
      {isLoading && !participant && !error && <ParticipantSkeleton />}

      {/* Inhalt */}
      {participant && !error && (
        <>
          {/* Profilkopf */}
          <Card>
            {/* Avatar + Name */}
            <div className="flex items-center gap-3">
              <Avatar url={participant.avatarUrl} name={participant.displayName} size={48} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold text-slate-100">{participant.displayName}</p>
                <p className={`text-sm font-bold ${rankTextColor(participant.rank)}`}>
                  Platz {participant.rank}
                </p>
              </div>
            </div>

            {/* Stats-Raster */}
            <div className="mt-4 grid grid-cols-3 gap-x-4 gap-y-3">
              <StatCell label="Wdh. gesamt"  value={participant.totalRepetitions} />
              <StatCell label="Sätze"         value={participant.setCount} />
              <StatCell label="Bester Satz"   value={participant.maxSet} />
              <StatCell label="Kleinster Satz" value={participant.minSet} />
              <StatCell
                label="Ø Satz"
                value={participant.avgSet != null ? participant.avgSet.toFixed(1) : null}
              />
              <StatCell
                label="Erster Satz"
                value={participant.firstSetAt ? `${formatBerlinTime(participant.firstSetAt)} Uhr` : null}
              />
            </div>
            {participant.lastSetAt && (
              <p className="mt-3 text-xs text-slate-600">
                Letzter Satz: {formatBerlinTime(participant.lastSetAt)} Uhr
              </p>
            )}
          </Card>

          {/* Satzliste */}
          <Card>
            <CardTitle>Satzliste</CardTitle>
            {participant.sets.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Keine Sätze aufgezeichnet.</p>
            ) : (
              <ul className="mt-1 divide-y divide-ink-800">
                {participant.sets.map(s => (
                  <SetRow
                    key={s.entryId}
                    setNumber={s.setNumber}
                    repetitions={s.repetitions}
                    createdAt={s.createdAt}
                  />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
