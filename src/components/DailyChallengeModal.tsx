// DailyChallengeModal – Phase 3B: Status + Teilnahme mit echten Daten.
// Der Hook wird einmal in DailyChallengeModal instanziiert und als Props weitergereicht.
// Phase 3C ergänzt: Satzeingabe, Rangliste, Statistik, Satzliste, Verlauf.

import { useEffect, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { useDailyChallenge } from '@/hooks/useDailyChallenge';

// ── Hilfsfunktionen ────────────────────────────────────────────────────────

/** Sekunden → "HH:MM:SS", negativ wird auf "00:00:00" geclampt. */
function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
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

interface StatusCardProps {
  isActive: boolean;
  secondsUntilStart: number;
  secondsUntilEnd: number;
}

function StatusCard({ isActive, secondsUntilStart, secondsUntilEnd }: StatusCardProps) {
  const countdown = isActive ? secondsUntilEnd : secondsUntilStart;
  return (
    <Card>
      <CardTitle>{isActive ? 'Challenge läuft' : 'Challenge pausiert'}</CardTitle>
      <p className="mt-1.5 font-mono text-3xl font-bold tracking-tight text-slate-100">
        {formatCountdown(countdown)}
      </p>
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

interface TeilnahmeCardProps {
  isActive: boolean;
  hasJoined: boolean;
  isJoining: boolean;
  actionError: string | null;
  joinChallenge: () => Promise<void>;
}

function TeilnahmeCard({
  isActive,
  hasJoined,
  isJoining,
  actionError,
  joinChallenge,
}: TeilnahmeCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleConfirmJoin = async () => {
    await joinChallenge();
    setConfirmOpen(false);
  };

  // Challenge inaktiv → kein Teilnahme-Button, nur Hinweis
  if (!isActive) {
    return (
      <Card>
        <CardTitle>Teilnahme</CardTitle>
        <p className="mt-2 text-sm text-slate-500">
          Die Teilnahme ist ab 05:00 Uhr möglich.
        </p>
      </Card>
    );
  }

  // Bereits teilgenommen
  if (hasJoined) {
    return (
      <Card>
        <CardTitle>Teilnahme</CardTitle>
        <p className="mt-2 text-sm font-medium text-brand-300">Du nimmst heute teil.</p>
      </Card>
    );
  }

  // Teilnahme noch möglich → Regeln + Button
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
        {actionError && (
          <p className="mt-3 text-sm text-red-400">{actionError}</p>
        )}
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={isJoining}
          className="mt-4 w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-500 active:bg-brand-700 disabled:opacity-50"
        >
          Heute teilnehmen
        </button>
      </Card>

      {/* Bestätigungsdialog (z-[60] — über dem Modal-z-50) */}
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
            <p className="text-center text-base font-bold text-slate-100">
              Daily Challenge starten?
            </p>
            <p className="mt-2 mb-6 text-center text-sm text-slate-400">
              Nach der Teilnahme werden deine Sätze dauerhaft für den heutigen
              Challenge-Tag gespeichert.
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

// ── Platzhalter-Karte ──────────────────────────────────────────────────────

function PlaceholderCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <p className="mt-2 text-sm text-slate-500">
        {subtitle ?? 'Wird in Phase 3C implementiert.'}
      </p>
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
  isActive: boolean;
  hasJoined: boolean;
  isLoadingStatus: boolean;
  secondsUntilStart: number;
  secondsUntilEnd: number;
  isJoining: boolean;
  actionError: string | null;
  joinChallenge: () => Promise<void>;
}

function HeuteTab({
  isActive,
  hasJoined,
  isLoadingStatus,
  secondsUntilStart,
  secondsUntilEnd,
  isJoining,
  actionError,
  joinChallenge,
}: HeuteTabProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Status + Teilnahme: Skeleton während des ersten Ladens */}
      {isLoadingStatus ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : (
        <>
          <StatusCard
            isActive={isActive}
            secondsUntilStart={secondsUntilStart}
            secondsUntilEnd={secondsUntilEnd}
          />
          <TeilnahmeCard
            isActive={isActive}
            hasJoined={hasJoined}
            isJoining={isJoining}
            actionError={actionError}
            joinChallenge={joinChallenge}
          />
        </>
      )}

      {/* Noch nicht implementierte Karten bleiben als Platzhalter */}
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
// useDailyChallenge wird genau einmal hier instanziiert. Alle Kind-Komponenten
// erhalten die Daten als Props — keine zweite Hook-Instanz, keine doppelten Requests.

interface DailyChallengeModalProps {
  onClose: () => void;
}

export function DailyChallengeModal({ onClose }: DailyChallengeModalProps) {
  const {
    isActive,
    hasJoined,
    isLoadingStatus,
    secondsUntilStart,
    secondsUntilEnd,
    isJoining,
    actionError,
    joinChallenge,
  } = useDailyChallenge();

  const [activeTab, setActiveTab] = useState<Tab>('heute');

  // Hintergrundscrollen sperren während Modal offen ist
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
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
      {/* Safe-Area oben */}
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }} />

      {/* Header ──────────────────────────────────────────────────────────── */}
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

        {/* Tabs */}
        <div className="flex gap-1">
          <TabPill
            label="Heute"
            active={activeTab === 'heute'}
            onClick={() => setActiveTab('heute')}
          />
          <TabPill
            label="Verlauf"
            active={activeTab === 'verlauf'}
            onClick={() => setActiveTab('verlauf')}
          />
        </div>
      </div>

      {/* Scrollbarer Inhalt */}
      <div
        className="flex-1 overflow-y-auto px-4 pt-4"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {activeTab === 'heute' ? (
          <HeuteTab
            isActive={isActive}
            hasJoined={hasJoined}
            isLoadingStatus={isLoadingStatus}
            secondsUntilStart={secondsUntilStart}
            secondsUntilEnd={secondsUntilEnd}
            isJoining={isJoining}
            actionError={actionError}
            joinChallenge={joinChallenge}
          />
        ) : (
          <VerlaufTab />
        )}
      </div>
    </div>
  );
}
