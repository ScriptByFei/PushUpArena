// DailyChallengeModal – Phase 3A: Grundstruktur mit Tabs und Platzhalterkarten.
// Phase 3B fügt useDailyChallenge, Teilnahme-Button und Satzeingabe hinzu.

import { useEffect, useState } from 'react';
import { Card, CardTitle } from '@/components/ui/Card';

// ── Inline-Icon ────────────────────────────────────────────────────────────
function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

// ── Tab-Typen ──────────────────────────────────────────────────────────────
type Tab = 'heute' | 'verlauf';

// ── Platzhalter-Karte (Heute-Tab) ──────────────────────────────────────────
function PlaceholderCard({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <p className="mt-2 text-sm text-slate-500">
        {subtitle ?? 'Wird in Phase 3B implementiert.'}
      </p>
    </Card>
  );
}

// ── Haupt-Komponente ───────────────────────────────────────────────────────
interface DailyChallengeModalProps {
  onClose: () => void;
}

export function DailyChallengeModal({ onClose }: DailyChallengeModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('heute');

  // Hintergrundscrollen sperren
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Backdrop-Klick schließt Modal
  const handleBackdropKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink-950"
      role="dialog"
      aria-modal="true"
      aria-label="Daily Challenge"
      onKeyDown={handleBackdropKeyDown}
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

        {/* Tabs ─────────────────────────────────────────────────────────── */}
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

      {/* Inhalt ──────────────────────────────────────────────────────────── */}
      <div
        className="flex-1 overflow-y-auto px-4 pt-4"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {activeTab === 'heute' ? <HeuteTab /> : <VerlaufTab />}
      </div>
    </div>
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
function HeuteTab() {
  return (
    <div className="flex flex-col gap-3">
      <PlaceholderCard
        title="Status"
        subtitle="Zeigt ob die Challenge aktiv ist und wie viel Zeit noch bleibt."
      />
      <PlaceholderCard
        title="Teilnahme"
        subtitle="Teilnahme-Button erscheint hier."
      />
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
