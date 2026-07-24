// DailyChallengeModal – Phase 3C+: Satzeingabe + Cooldown + isolierter Countdown.
// Hook-Instanz: einmal in DailyChallengeModal, Daten als Props weiter.
// Countdown in eigener DailyChallengeCountdown-Komponente → kein sekündlicher
// Re-Render des Modal-Baums mehr.
// Phase 3D: Deine Leistung, Satzliste, Live-Rangliste, Verlauf.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useDailyChallenge } from '@/hooks/useDailyChallenge';
import { useCountdown } from '@/hooks/useCountdown';
import { formatBerlinTime } from '@/lib/date';
import { LeaderboardCard } from '@/components/DailyChallengeLeaderboard';
import { HistoryList } from '@/components/DailyChallengeHistory';
import { HistoryDayView, HistoryParticipantView } from '@/components/DailyChallengeHistoryDetail';
import type {
  DailyChallengeHistoryDay,
  DailyChallengeLeaderboardEntry,
  DailyChallengeSet,
  DailyChallengeDayDetails,
  DailyChallengeParticipantDetails,
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
// Alle Geschwister (TeilnahmeCard, SatzEingabeCard, …) bleiben stabil.

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
    <p className="mt-1.5 font-mono tabular-nums text-3xl font-bold tracking-tight text-slate-100">
      {formatCountdown(seconds)}
    </p>
  );
}

/** Frontend-Validierung der Wiederholungszahl; gibt Fehlermeldung oder null zurück. */
function validateReps(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return 'Gib die Anzahl der Wiederholungen ein.';
  if (!/^\d+$/.test(trimmed)) return 'Bitte gib eine ganze Zahl ein.';
  const n = parseInt(trimmed, 10);
  if (n < 10)  return 'Ein Satz muss mindestens 10 Wiederholungen enthalten.';
  if (n > 100) return 'Pro Satz sind maximal 100 Wiederholungen erlaubt.';
  return null;
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

type Tab = 'heute' | 'verlauf';

// ── Skeleton ───────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <Card>
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
    <Card>
      <CardTitle>{isActive ? 'Challenge läuft' : 'Challenge pausiert'}</CardTitle>
      <DailyChallengeCountdown
        targetTime={targetTime}
        serverNow={serverNow}
        onEnd={onCountdownEnd}
      />
      <p className="mt-1.5 text-xs text-slate-500">
        {isActive
          ? 'Täglich von 05:00 bis 00:00 Uhr'
          : 'Die nächste Challenge startet um 05:00 Uhr.'}
      </p>
    </Card>
  );
}

// ── Teilnahmekarte ─────────────────────────────────────────────────────────

const RULES = [
  'Jeder Satz muss direkt eingetragen werden.',
  '10 bis 100 Wiederholungen pro Satz.',
  'Mindestens 30 Sekunden Abstand zwischen zwei Sätzen.',
  'Gespeicherte Sätze können nicht bearbeitet werden.',
] as const;

function TeilnahmeCard({
  isActive,
  hasJoined,
  isJoining,
  actionError,
  joinChallenge,
}: {
  isActive: boolean;
  hasJoined: boolean;
  isJoining: boolean;
  actionError: string | null;
  joinChallenge: () => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirmJoin = async () => {
    await joinChallenge();
    setConfirmOpen(false);
  };

  if (!isActive) {
    return (
      <Card>
        <CardTitle>Teilnahme</CardTitle>
        <p className="mt-2 text-sm text-slate-500">Die Teilnahme ist ab 05:00 Uhr möglich.</p>
      </Card>
    );
  }

  if (hasJoined) {
    return (
      <Card>
        <CardTitle>Teilnahme</CardTitle>
        <p className="mt-2 text-sm font-medium text-brand-300">Du nimmst heute teil.</p>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardTitle>Teilnahme</CardTitle>
        <ul className="mt-2.5 space-y-1.5">
          {RULES.map(rule => (
            <li key={rule} className="flex items-start gap-2 text-sm text-slate-400">
              <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-600" />
              {rule}
            </li>
          ))}
        </ul>
        {actionError && <p className="mt-3 text-sm text-red-400">{actionError}</p>}
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={isJoining}
          className="mt-4 w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-500 active:bg-brand-700 disabled:opacity-50"
        >
          Heute teilnehmen
        </button>
      </Card>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-join-title"
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmOpen(false)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setConfirmOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />
            <p id="confirm-join-title" className="text-center text-base font-bold text-slate-100">Daily Challenge starten?</p>
            <p className="mt-2 mb-6 text-center text-sm text-slate-400">
              Nach der Teilnahme werden deine Sätze dauerhaft für den heutigen Challenge-Tag gespeichert.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={isJoining}
                className="flex-1 rounded-2xl border border-ink-600 py-3 text-sm font-semibold text-slate-300 transition hover:bg-ink-700 disabled:opacity-50"
              >
                Abbrechen
              </button>
              <button
                onClick={() => void handleConfirmJoin()}
                disabled={isJoining}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-60"
              >
                {isJoining && <Spinner size="sm" />}
                Teilnahme bestätigen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Satzeingabe-Karte ──────────────────────────────────────────────────────
// Wird nur gerendert wenn isActive && hasJoined.
// Cooldown-Initialisierung: aus mySets (letzter Satz < 30s ago).
// Nach erfolgreichem logSet: sofortiger lokaler 30s-Countdown, danach
// durch mySets-Update mit Serverzeit überschrieben (genauere Basis).
// Bei COOLDOWN_ACTIVE vom Server: verbleibende Sekunden korrigieren.

interface SatzEingabeCardProps {
  isActive: boolean;
  hasJoined: boolean;
  challengeDate: string | null;
  isLoggingSet: boolean;
  actionError: string | null;
  mySets: DailyChallengeSet[];
  logSet: (reps: number) => Promise<{ ok: boolean; secondsRemaining?: number }>;
}

function SatzEingabeCard({
  isActive,
  hasJoined,
  challengeDate,
  isLoggingSet,
  actionError,
  mySets,
  logSet,
}: SatzEingabeCardProps) {
  const [inputValue, setInputValue]   = useState('');
  const [localError, setLocalError]   = useState<string | null>(null);
  const [successMsg, setSuccessMsg]   = useState<string | null>(null);
  const [hasTried, setHasTried]       = useState(false);
  const [cooldownEndsAt, setCooldownEndsAt] = useState<number | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  const inputRef       = useRef<HTMLInputElement>(null);
  const successTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cooldown-Countdown
  useEffect(() => {
    if (!cooldownEndsAt) { setCooldownSeconds(0); return; }

    const tick = () => {
      const rem = Math.max(0, (cooldownEndsAt - Date.now()) / 1000);
      setCooldownSeconds(Math.ceil(rem));
      if (rem <= 0) setCooldownEndsAt(null);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [cooldownEndsAt]);

  // Cooldown aus mySets ableiten (Initialzustand + nach neuem Satz)
  useEffect(() => {
    if (mySets.length === 0) return;
    const last = mySets[0]; // index 0 = neuester Satz (RPC liefert DESC)
    const endsAt = last.createdAt.getTime() + 30_000;
    if (endsAt > Date.now()) {
      setCooldownEndsAt(endsAt);
    }
  }, [mySets]);

  // Challenge endet → Eingabe sperren + Reset
  useEffect(() => {
    if (!isActive) {
      setInputValue('');
      setLocalError(null);
      setSuccessMsg(null);
      setCooldownEndsAt(null);
      if (successTimer.current) clearTimeout(successTimer.current);
    }
  }, [isActive]);

  // Neuer Challenge-Tag → vollständiger Reset
  useEffect(() => {
    setInputValue('');
    setLocalError(null);
    setSuccessMsg(null);
    setCooldownEndsAt(null);
    setHasTried(false);
    if (successTimer.current) clearTimeout(successTimer.current);
  }, [challengeDate]);

  // Cleanup bei Unmount
  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  // Nicht anzeigen wenn Challenge inaktiv oder nicht beigetreten
  if (!isActive || !hasJoined) return null;

  const isBlocked = isLoggingSet || cooldownSeconds > 0;

  const handleSubmit = async () => {
    if (isBlocked) return;
    // Laufenden Erfolgs-Timer stoppen
    if (successTimer.current) { clearTimeout(successTimer.current); successTimer.current = null; }
    setSuccessMsg(null);

    const validationError = validateReps(inputValue);
    if (validationError) {
      setLocalError(validationError);
      return;
    }
    setLocalError(null);
    setHasTried(true);

    const reps = parseInt(inputValue.trim(), 10);

    // Sofortiger lokaler Cooldown-Start (wird durch mySets-Update korrigiert)
    setCooldownEndsAt(Date.now() + 30_000);

    const result = await logSet(reps);

    if (result.ok) {
      setInputValue('');
      setSuccessMsg(`Satz mit ${reps} Wiederholungen gespeichert.`);
      successTimer.current = setTimeout(() => setSuccessMsg(null), 4_000);
      inputRef.current?.focus();
    } else {
      // Cooldown zurücksetzen wenn kein Server-Cooldown aktiv
      if (result.secondsRemaining != null) {
        // Server korrigiert verbleibende Zeit
        setCooldownEndsAt(Date.now() + result.secondsRemaining * 1_000);
      } else {
        setCooldownEndsAt(null);
      }
    }
  };

  const handleBlur = () => {
    if (inputValue) {
      const err = validateReps(inputValue);
      setLocalError(err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!isBlocked) void handleSubmit();
    }
  };

  // Server-Fehlermeldung nur nach eigenem Versuch anzeigen (kein Stale-Error aus joinChallenge)
  const serverError = hasTried ? actionError : null;
  const hasError = !!(localError || serverError);

  const buttonLabel = isLoggingSet
    ? null
    : cooldownSeconds > 0
    ? `Warte noch ${cooldownSeconds}s`
    : 'Satz speichern';

  return (
    <Card>
      <CardTitle>Satz eintragen</CardTitle>
      <p className="mt-1 text-xs text-slate-500">
        Trage den Satz direkt nach der Ausführung ein.
      </p>

      <div className="mt-3">
        <label
          htmlFor="reps-input"
          className="mb-1.5 block text-sm font-medium text-slate-300"
        >
          Wiederholungen
        </label>
        <input
          ref={inputRef}
          id="reps-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={inputValue}
          onChange={e => {
            setInputValue(e.target.value);
            if (localError) setLocalError(null);
            if (successMsg) setSuccessMsg(null);
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={isLoggingSet || !isActive}
          min={10}
          max={100}
          placeholder="z. B. 25"
          aria-describedby={hasError ? 'reps-error' : undefined}
          aria-invalid={hasError || undefined}
          className="input-base disabled:opacity-50"
        />

        {/* Validierungs- oder Serverfehler */}
        {(localError || serverError) && (
          <p
            id="reps-error"
            role="alert"
            className="mt-1.5 text-sm text-red-400"
          >
            {localError ?? serverError}
          </p>
        )}

        {/* Erfolgsmeldung */}
        {successMsg && (
          <p
            aria-live="polite"
            className="mt-1.5 text-sm font-medium text-brand-300"
          >
            {successMsg}
          </p>
        )}
      </div>

      <button
        onClick={() => void handleSubmit()}
        disabled={isBlocked}
        aria-busy={isLoggingSet}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-500 active:bg-brand-700 disabled:opacity-50"
      >
        {isLoggingSet && <Spinner size="sm" />}
        {buttonLabel ?? 'Satz speichern'}
      </button>
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

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="tabular-nums text-lg font-bold leading-none text-slate-100">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}

// ── Leistungskarte ─────────────────────────────────────────────────────────

interface PerformanceCardProps {
  hasJoined: boolean;
  mySets: DailyChallengeSet[];
  isLoadingMySets: boolean;
  setsError: string | null;
  refreshMySets: () => Promise<void>;
}

function PerformanceCard({
  hasJoined,
  mySets,
  isLoadingMySets,
  setsError,
  refreshMySets,
}: PerformanceCardProps) {
  // Statistik nur neu berechnen wenn sich mySets ändert – kein Countdown-Einfluss
  const stats = useMemo(() => computeStats(mySets), [mySets]);

  if (setsError) {
    return (
      <Card>
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
      <Card>
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

  if (!hasJoined) {
    return (
      <Card>
        <CardTitle>Deine Leistung</CardTitle>
        <p className="mt-2 text-sm text-slate-500">
          Nimm heute teil, um deine Challenge-Leistung zu sehen.
        </p>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card>
        <CardTitle>Deine Leistung</CardTitle>
        <p className="mt-2 text-sm text-slate-500">Noch kein Satz eingetragen.</p>
        <p className="mt-1 text-xs text-slate-600">
          Deine Statistik erscheint nach deinem ersten Satz.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>Deine Leistung</CardTitle>
      {/* Gesamtwiederholungen – prominentester Wert */}
      <p className="mt-1.5 tabular-nums text-3xl font-bold tracking-tight text-slate-100">
        {stats.totalRepetitions}
      </p>
      <p className="text-xs text-slate-500">Wiederholungen gesamt</p>
      {/* 2×2-Raster */}
      <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-ink-800 pt-3.5">
        <StatCell label="Sätze"          value={String(stats.setCount)} />
        <StatCell label="Bester Satz"    value={String(stats.maxSet)}   />
        <StatCell label="Kleinster Satz" value={String(stats.minSet)}   />
        <StatCell
          label="Ø pro Satz"
          value={stats.averageSet.toLocaleString('de-DE', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}
        />
      </div>
    </Card>
  );
}

// ── Satzliste ──────────────────────────────────────────────────────────────

// ── Edit-Countdown ─────────────────────────────────────────────────────────
// Zeigt verbleibende Minuten/Sekunden bis das Bearbeitungsfenster schließt.

function EditCountdown({ editUntil }: { editUntil: Date | null }) {
  const [secs, setSecs] = useState<number>(() =>
    editUntil ? Math.max(0, Math.floor((editUntil.getTime() - Date.now()) / 1000)) : 0
  );

  useEffect(() => {
    if (!editUntil) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((editUntil.getTime() - Date.now()) / 1000));
      setSecs(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [editUntil]);

  if (!editUntil || secs <= 0) return null;
  const mins  = Math.floor(secs / 60);
  const s     = secs % 60;
  const label = mins > 0
    ? `Bearbeitbar noch ${mins} Min. ${s < 10 ? '0' : ''}${s} Sek.`
    : `Bearbeitbar noch ${s} Sek.`;

  return <p className="mt-0.5 text-[10.5px] tabular-nums text-slate-500">{label}</p>;
}

// ── MySetsCard ─────────────────────────────────────────────────────────────

interface MySetsCardProps {
  hasJoined: boolean;
  mySets: DailyChallengeSet[];
  isLoadingMySets: boolean;
  setsError: string | null;
  refreshMySets: () => Promise<void>;
  updateSet: (entryId: string, repetitions: number) => Promise<{ ok: boolean }>;
  deleteSet: (entryId: string) => Promise<{ ok: boolean }>;
  isEditingSet: boolean;
  isDeletingSet: boolean;
}

function MySetsCard({
  hasJoined,
  mySets,
  isLoadingMySets,
  setsError,
  refreshMySets,
  updateSet,
  deleteSet,
  isEditingSet,
  isDeletingSet,
}: MySetsCardProps) {
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editValue, setEditValue]         = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleStartEdit = (set: DailyChallengeSet) => {
    setEditingId(set.id);
    setEditValue(String(set.repetitions));
    setConfirmDeleteId(null);
  };

  const handleCancelEdit = () => { setEditingId(null); setEditValue(''); };

  const handleSaveEdit = async (set: DailyChallengeSet) => {
    const reps = parseInt(editValue.trim(), 10);
    if (isNaN(reps) || reps < 10 || reps > 100) return;
    if (reps === set.repetitions) { handleCancelEdit(); return; }
    const result = await updateSet(set.id, reps);
    if (result.ok) setEditingId(null);
  };

  const handleConfirmDelete = async (entryId: string) => {
    const result = await deleteSet(entryId);
    if (result.ok) setConfirmDeleteId(null);
  };

  if (setsError) {
    return (
      <Card>
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
      <Card>
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

  if (!hasJoined) {
    return (
      <Card>
        <CardTitle>Deine Sätze</CardTitle>
        <p className="mt-2 text-sm text-slate-500">
          Nach deiner Teilnahme werden deine Sätze hier angezeigt.
        </p>
      </Card>
    );
  }

  if (mySets.length === 0) {
    return (
      <Card>
        <CardTitle>Deine Sätze</CardTitle>
        <p className="mt-2 text-sm text-slate-500">Noch kein Satz eingetragen.</p>
      </Card>
    );
  }

  const total = mySets.length;

  return (
    <Card>
      <CardTitle>Deine Sätze</CardTitle>
      <ul className="mt-1.5 divide-y divide-ink-800">
        {mySets.map((set, i) => {
          // Satznummer: neueste = total, älteste = 1
          const setNumber  = total - i;
          const secsLeft   = set.editUntil
            ? Math.max(0, Math.floor((set.editUntil.getTime() - Date.now()) / 1000))
            : 0;
          const isEditable = secsLeft > 0;
          const isThisEdit = editingId === set.id;
          const isThisDel  = confirmDeleteId === set.id;

          return (
            <li key={set.id} className="py-2.5">
              {/* Haupt-Zeile */}
              <div className="flex items-center justify-between gap-2">
                {/* Links: Satznummer + Zeit + Countdown */}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-200">Satz {setNumber}</p>
                  <p className="tabular-nums text-xs text-slate-500">
                    {formatBerlinTime(set.createdAt)} Uhr
                  </p>
                  {isEditable && <EditCountdown editUntil={set.editUntil} />}
                </div>

                {/* Rechts: Aktionen + Wert */}
                <div className="flex shrink-0 items-center gap-1.5">
                  {isEditable ? (
                    <>
                      <button
                        onClick={() => handleStartEdit(set)}
                        disabled={isEditingSet || isDeletingSet}
                        aria-label={`Satz ${setNumber} bearbeiten`}
                        title="Bearbeiten"
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-ink-700 hover:text-slate-200 disabled:opacity-40"
                      >
                        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                          <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      <button
                        onClick={() => { setConfirmDeleteId(set.id); setEditingId(null); }}
                        disabled={isEditingSet || isDeletingSet}
                        aria-label={`Satz ${setNumber} löschen`}
                        title="Löschen"
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                      >
                        <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4" aria-hidden="true">
                          <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </>
                  ) : (
                    <span className="mr-1 text-[11px] text-slate-600" title="Bearbeitungsfenster abgelaufen">🔒</span>
                  )}
                  <div className="text-right">
                    <p className="tabular-nums text-lg font-bold leading-none text-slate-100">
                      {set.repetitions}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">Wdh.</p>
                  </div>
                </div>
              </div>

              {/* Inline-Bearbeitungsformular */}
              {isThisEdit && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  void handleSaveEdit(set);
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    autoFocus
                    className="w-20 rounded-xl border border-ink-600 bg-ink-800 px-3 py-1.5 text-sm font-semibold tabular-nums text-slate-100 focus:border-brand-400 focus:outline-none"
                    placeholder="10–100"
                  />
                  <span className="text-xs text-slate-500">Wdh.</span>
                  <button
                    onClick={() => void handleSaveEdit(set)}
                    disabled={isEditingSet}
                    className="rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-500 disabled:opacity-60"
                  >
                    {isEditingSet ? '…' : 'Speichern'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="rounded-xl border border-ink-600 px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:bg-ink-700"
                  >
                    Abbrechen
                  </button>
                </div>
              )}

              {/* Lösch-Bestätigung */}
              {isThisDel && (
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
                  <span className="flex-1 text-xs text-red-300">Satz {setNumber} wirklich löschen?</span>
                  <button
                    onClick={() => void handleConfirmDelete(set.id)}
                    disabled={isDeletingSet}
                    className="rounded-lg bg-red-500/30 px-3 py-1 text-xs font-semibold text-red-300 transition hover:bg-red-500/50 disabled:opacity-60"
                  >
                    {isDeletingSet ? '…' : 'Löschen'}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="rounded-lg px-2 py-1 text-xs text-slate-500 transition hover:text-slate-300"
                  >
                    Abbrechen
                  </button>
                </div>
              )}
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
      className={`mb-3 rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
        active
          ? 'bg-brand-600/30 text-brand-300'
          : 'text-slate-500 hover:bg-ink-800 hover:text-slate-300'
      }`}
    >
      {label}
    </button>
  );
}

// ── Heute-Tab ──────────────────────────────────────────────────────────────

interface HeuteTabProps {
  // hasStatus = false solange der initiale Statusabruf noch läuft (status === null)
  hasStatus: boolean;
  isActive: boolean;
  hasJoined: boolean;
  challengeDate: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  serverNow: Date | null;
  onCountdownEnd: () => void;
  isJoining: boolean;
  isLoggingSet: boolean;
  isLoadingMySets: boolean;
  isLoadingLeaderboard: boolean;
  actionError: string | null;
  setsError: string | null;
  leaderboardError: string | null;
  mySets: DailyChallengeSet[];
  leaderboard: DailyChallengeLeaderboardEntry[];
  joinChallenge: () => Promise<void>;
  logSet: (reps: number) => Promise<{ ok: boolean; secondsRemaining?: number }>;
  updateSet: (entryId: string, repetitions: number) => Promise<{ ok: boolean }>;
  deleteSet: (entryId: string) => Promise<{ ok: boolean }>;
  isEditingSet: boolean;
  isDeletingSet: boolean;
  refreshMySets: () => Promise<void>;
  refreshLeaderboard: () => Promise<void>;
}

function HeuteTab({
  hasStatus,
  isActive,
  hasJoined,
  challengeDate,
  startsAt,
  endsAt,
  serverNow,
  onCountdownEnd,
  isJoining,
  isLoggingSet,
  isLoadingMySets,
  isLoadingLeaderboard,
  actionError,
  setsError,
  leaderboardError,
  mySets,
  leaderboard,
  joinChallenge,
  logSet,
  updateSet,
  deleteSet,
  isEditingSet,
  isDeletingSet,
  refreshMySets,
  refreshLeaderboard,
}: HeuteTabProps) {
  // actionError aus joinChallenge soll nicht in SatzEingabeCard erscheinen.
  // SatzEingabeCard verwendet intern hasTried-Guard — hier wird die gleiche
  // actionError-Referenz weitergegeben; die Karte filtert selbst.
  //
  // Skeleton nur beim initialen Laden (hasStatus = false).
  // Hintergrund-Refreshes (onCountdownEnd) aktualisieren status still →
  // kein Skeleton-Flash, kein Unmount von TeilnahmeCard.
  return (
    <div className="flex flex-col gap-3">
      {!hasStatus ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : (
        <>
          <StatusCard
            isActive={isActive}
            startsAt={startsAt}
            endsAt={endsAt}
            serverNow={serverNow}
            onCountdownEnd={onCountdownEnd}
          />
          <TeilnahmeCard
            isActive={isActive}
            hasJoined={hasJoined}
            isJoining={isJoining}
            actionError={actionError}
            joinChallenge={joinChallenge}
          />
          <SatzEingabeCard
            isActive={isActive}
            hasJoined={hasJoined}
            challengeDate={challengeDate}
            isLoggingSet={isLoggingSet}
            actionError={actionError}
            mySets={mySets}
            logSet={logSet}
          />
        </>
      )}

      <PerformanceCard
        hasJoined={hasJoined}
        mySets={mySets}
        isLoadingMySets={isLoadingMySets}
        setsError={setsError}
        refreshMySets={refreshMySets}
      />
      <LeaderboardCard
        isActive={isActive}
        hasJoined={hasJoined}
        leaderboard={leaderboard}
        isLoadingLeaderboard={isLoadingLeaderboard}
        leaderboardError={leaderboardError}
        refreshLeaderboard={refreshLeaderboard}
      />
      <MySetsCard
        hasJoined={hasJoined}
        mySets={mySets}
        isLoadingMySets={isLoadingMySets}
        setsError={setsError}
        refreshMySets={refreshMySets}
        updateSet={updateSet}
        deleteSet={deleteSet}
        isEditingSet={isEditingSet}
        isDeletingSet={isDeletingSet}
      />
    </div>
  );
}

// ── Verlauf-Tab (mit interner Navigation list → day → participant) ─────────

type HistoryView = 'list' | 'day' | 'participant';

interface VerlaufTabProps {
  historyView: HistoryView;
  selectedChallengeDate: string | null;
  // Verlaufsliste
  history: DailyChallengeHistoryDay[];
  isLoadingHistory: boolean;
  historyError: string | null;
  refreshHistory: () => Promise<void>;
  // Tagesdetail
  dayDetails: DailyChallengeDayDetails | null;
  isLoadingDayDetails: boolean;
  dayDetailsError: string | null;
  // Teilnehmerdetail
  participantDetails: DailyChallengeParticipantDetails | null;
  isLoadingParticipantDetails: boolean;
  participantDetailsError: string | null;
  // Navigation-Handler
  onSelectDay: (challengeDate: string) => void;
  onSelectParticipant: (userId: string) => void;
  onBackToList: () => void;
  onBackToDay: () => void;
  retryLoadDay: () => void;
  retryLoadParticipant: () => void;
}

function VerlaufTab({
  historyView,
  selectedChallengeDate,
  history,
  isLoadingHistory,
  historyError,
  refreshHistory,
  dayDetails,
  isLoadingDayDetails,
  dayDetailsError,
  participantDetails,
  isLoadingParticipantDetails,
  participantDetailsError,
  onSelectDay,
  onSelectParticipant,
  onBackToList,
  onBackToDay,
  retryLoadDay,
  retryLoadParticipant,
}: VerlaufTabProps) {
  if (historyView === 'day' && selectedChallengeDate) {
    return (
      <HistoryDayView
        challengeDate={selectedChallengeDate}
        dayDetails={dayDetails}
        isLoading={isLoadingDayDetails}
        error={dayDetailsError}
        onBack={onBackToList}
        onSelectParticipant={onSelectParticipant}
        retryLoadDay={retryLoadDay}
      />
    );
  }

  if (historyView === 'participant' && selectedChallengeDate) {
    return (
      <HistoryParticipantView
        challengeDate={selectedChallengeDate}
        participant={participantDetails}
        isLoading={isLoadingParticipantDetails}
        error={participantDetailsError}
        onBack={onBackToDay}
        retryLoadParticipant={retryLoadParticipant}
      />
    );
  }

  // Default: Liste
  return (
    <HistoryList
      history={history}
      isLoadingHistory={isLoadingHistory}
      historyError={historyError}
      refreshHistory={refreshHistory}
      onSelectDay={onSelectDay}
    />
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
    hasJoined,
    challengeDate,
    startsAt,
    endsAt,
    serverNow,
    leaderboard,
    mySets,
    isJoining,
    isLoggingSet,
    isLoadingMySets,
    isLoadingLeaderboard,
    actionError,
    setsError,
    leaderboardError,
    history,
    isLoadingHistory,
    historyError,
    selectedDayDetails,
    isLoadingDayDetails,
    dayDetailsError,
    selectedParticipantDetails,
    isLoadingParticipantDetails,
    participantDetailsError,
    joinChallenge,
    logSet,
    updateSet,
    deleteSet,
    isEditingSet,
    isDeletingSet,
    refreshStatus,
    refreshMySets,
    refreshLeaderboard,
    refreshHistory,
    loadHistoryDay,
    loadHistoryParticipant,
  } = useDailyChallenge();

  const [activeTab, setActiveTab] = useState<Tab>('heute');

  // Lazy History-Loading: einmalig beim ersten Wechsel zum Verlauf-Tab.
  // Ref statt State, damit der Effekt keinen Re-Render auslöst.
  const hasRequestedHistoryRef = useRef(false);
  useEffect(() => {
    if (activeTab !== 'verlauf') return;
    if (hasRequestedHistoryRef.current) return;
    hasRequestedHistoryRef.current = true;
    void refreshHistory();
  }, [activeTab, refreshHistory]);

  // ── Verlauf-interne Navigation ───────────────────────────────────────────
  const [historyView, setHistoryView]                       = useState<'list' | 'day' | 'participant'>('list');
  const [selectedChallengeDate, setSelectedChallengeDate]   = useState<string | null>(null);
  const [selectedParticipantId, setSelectedParticipantId]   = useState<string | null>(null);

  const handleSelectDay = (challengeDate: string) => {
    setHistoryView('day');
    setSelectedChallengeDate(challengeDate);
    void loadHistoryDay(challengeDate);
  };

  const handleSelectParticipant = (userId: string) => {
    if (!selectedChallengeDate) return;
    setHistoryView('participant');
    setSelectedParticipantId(userId);
    void loadHistoryParticipant(selectedChallengeDate, userId);
  };

  const handleBackToList = () => {
    setHistoryView('list');
    setSelectedChallengeDate(null);
    setSelectedParticipantId(null);
  };

  const handleBackToDay = () => {
    setHistoryView('day');
    setSelectedParticipantId(null);
  };

  const handleRetryDay = () => {
    if (selectedChallengeDate) void loadHistoryDay(selectedChallengeDate);
  };

  const handleRetryParticipant = () => {
    if (selectedChallengeDate && selectedParticipantId) {
      void loadHistoryParticipant(selectedChallengeDate, selectedParticipantId);
    }
  };

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
      aria-label="Daily Challenge"
      onKeyDown={handleKeyDown}
    >
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }} />

      {/* Header */}
      <div className="shrink-0 border-b border-ink-800 px-4 pb-0 pt-2">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-lg font-extrabold text-slate-100">Daily Challenge</h2>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-ink-800 hover:text-slate-200"
            aria-label="Schließen"
          >
            <CloseIcon />
          </button>
        </div>
        <div role="tablist" aria-label="Challenge-Ansicht" className="flex gap-1">
          <TabPill label="Heute"   active={activeTab === 'heute'}   onClick={() => setActiveTab('heute')}   />
          <TabPill label="Verlauf" active={activeTab === 'verlauf'} onClick={() => setActiveTab('verlauf')} />
        </div>
      </div>

      {/* Scrollbarer Inhalt */}
      <div
        className="flex-1 overflow-y-auto px-4 pt-4"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {activeTab === 'heute' ? (
          <HeuteTab
            hasStatus={status !== null}
            isActive={isActive}
            hasJoined={hasJoined}
            challengeDate={challengeDate}
            startsAt={startsAt}
            endsAt={endsAt}
            serverNow={serverNow}
            onCountdownEnd={handleCountdownEnd}
            isJoining={isJoining}
            isLoggingSet={isLoggingSet}
            isLoadingMySets={isLoadingMySets}
            isLoadingLeaderboard={isLoadingLeaderboard}
            actionError={actionError}
            setsError={setsError}
            leaderboardError={leaderboardError}
            mySets={mySets}
            leaderboard={leaderboard}
            joinChallenge={joinChallenge}
            logSet={logSet}
            updateSet={updateSet}
            deleteSet={deleteSet}
            isEditingSet={isEditingSet}
            isDeletingSet={isDeletingSet}
            refreshMySets={refreshMySets}
            refreshLeaderboard={refreshLeaderboard}
          />
        ) : (
          <VerlaufTab
            historyView={historyView}
            selectedChallengeDate={selectedChallengeDate}
            history={history}
            isLoadingHistory={isLoadingHistory}
            historyError={historyError}
            refreshHistory={refreshHistory}
            dayDetails={selectedDayDetails}
            isLoadingDayDetails={isLoadingDayDetails}
            dayDetailsError={dayDetailsError}
            participantDetails={selectedParticipantDetails}
            isLoadingParticipantDetails={isLoadingParticipantDetails}
            participantDetailsError={participantDetailsError}
            onSelectDay={handleSelectDay}
            onSelectParticipant={handleSelectParticipant}
            onBackToList={handleBackToList}
            onBackToDay={handleBackToDay}
            retryLoadDay={handleRetryDay}
            retryLoadParticipant={handleRetryParticipant}
          />
        )}
      </div>
    </div>
  );
}
