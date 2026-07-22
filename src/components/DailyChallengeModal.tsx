// DailyChallengeModal – Phase 3C+: Satzeingabe + Cooldown + isolierter Countdown.
// Hook-Instanz: einmal in DailyChallengeModal, Daten als Props weiter.
// Countdown in eigener DailyChallengeCountdown-Komponente → kein sekündlicher
// Re-Render des Modal-Baums mehr.
// Phase 3D: Deine Leistung, Satzliste, Live-Rangliste, Verlauf.

import { useEffect, useRef, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useDailyChallenge } from '@/hooks/useDailyChallenge';
import { useCountdown } from '@/hooks/useCountdown';
import type { DailyChallengeSet } from '@/lib/dailyChallenge.types';

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
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />
            <p className="text-center text-base font-bold text-slate-100">Daily Challenge starten?</p>
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
    const last = mySets[mySets.length - 1];
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
          className="input disabled:opacity-50"
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

// ── Platzhalter-Karte ──────────────────────────────────────────────────────

function PlaceholderCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <p className="mt-2 text-sm text-slate-500">
        {subtitle ?? 'Wird in Phase 3D implementiert.'}
      </p>
    </Card>
  );
}

// ── Tab-Pill ───────────────────────────────────────────────────────────────

function TabPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
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
  actionError: string | null;
  mySets: DailyChallengeSet[];
  joinChallenge: () => Promise<void>;
  logSet: (reps: number) => Promise<{ ok: boolean; secondsRemaining?: number }>;
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
  actionError,
  mySets,
  joinChallenge,
  logSet,
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

      <PlaceholderCard
        title="Deine Leistung"
        subtitle="Gesamtwiederholungen, Satzanzahl und bester Satz des heutigen Tages."
      />
      <PlaceholderCard
        title="Live-Rangliste"
        subtitle="Echtzeit-Rangliste aller Teilnehmer von heute."
      />
      <PlaceholderCard
        title="Deine Satze"
        subtitle="Alle heute gespeicherten Satze mit Uhrzeit und Wiederholungen."
      />
    </div>
  );
}

// ── Verlauf-Tab ────────────────────────────────────────────────────────────

function VerlaufTab() {
  return (
    <div className="flex flex-col gap-3">
      <Card>
        <p className="text-sm text-slate-500">Der Challenge-Verlauf wird hier angezeigt.</p>
      </Card>
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
    hasJoined,
    challengeDate,
    startsAt,
    endsAt,
    serverNow,
    isJoining,
    isLoggingSet,
    actionError,
    mySets,
    joinChallenge,
    logSet,
    refreshStatus,
  } = useDailyChallenge();

  const [activeTab, setActiveTab] = useState<Tab>('heute');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
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
            className="rounded-xl p-1.5 text-slate-400 transition hover:bg-ink-800 hover:text-slate-200"
            aria-label="Schließen"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex gap-1">
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
            onCountdownEnd={() => void refreshStatus()}
            isJoining={isJoining}
            isLoggingSet={isLoggingSet}
            actionError={actionError}
            mySets={mySets}
            joinChallenge={joinChallenge}
            logSet={logSet}
          />
        ) : (
          <VerlaufTab />
        )}
      </div>
    </div>
  );
}
