import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';
import { useRestDays } from '@/hooks/useRestDays';
import { useToast } from '@/context/ToastContext';
import { QuickAdd } from '@/components/QuickAdd';
import { Button } from '@/components/ui/Button';
import { CalendarIcon } from '@/components/ui/icons';
import type { Exercise } from '@/lib/database.types';

const TZ = 'Europe/Berlin';
function berlinToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}
function maxRestDate() {
  const [y, m, d] = berlinToday().split('-').map(Number);
  return new Date(y, m - 1, d + 14).toLocaleDateString('sv-SE');
}

type Tab = 'training' | 'rest';

interface FABSheetProps {
  onClose: () => void;
  /** Pre-select a tab when the sheet opens (only visible when 1 exercise enrolled). */
  initialTab?: Tab;
}

export function FABSheet({ onClose, initialTab = 'training' }: FABSheetProps) {
  const { enrolledExercises, switchExercise } = useExercise();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Exercise | null>(
    enrolledExercises.length === 1 ? enrolledExercises[0] : null,
  );
  const [tab, setTab] = useState<Tab>(initialTab);

  function pick(ex: Exercise) {
    switchExercise(ex);
    setSelected(ex);
  }

  function openVerlauf() {
    onClose();
    navigate('/track', { replace: true });
  }

  return (
    <div
      data-no-drawer="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pb-10 pt-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />

        {selected === null ? (
          /* ── Übungsauswahl ── */
          <>
            <p className="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-slate-500">
              Was möchtest du eintragen?
            </p>
            <div className="flex flex-col gap-2">
              {enrolledExercises.map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => pick(ex)}
                  className="flex items-center gap-4 rounded-2xl bg-ink-800 px-4 py-3 transition active:scale-95 hover:bg-ink-700"
                >
                  <img
                    src={EXERCISE_ICONS[ex.slug] ?? '/pushup-icon.png'}
                    alt={ex.name}
                    className="h-12 w-12 rounded-xl object-cover"
                  />
                  <span className="text-base font-semibold text-slate-200">{ex.name}</span>
                  <svg viewBox="0 0 24 24" className="ml-auto h-5 w-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              ))}
            </div>
            {/* Verlauf-Link */}
            <button
              onClick={openVerlauf}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-ink-700 py-3 text-sm text-slate-400 transition hover:border-ink-600 hover:text-slate-200"
            >
              <CalendarIcon className="h-4 w-4" />
              Verlauf anzeigen
            </button>
          </>
        ) : (
          /* ── Training / Ruhetag ── */
          <>
            {/* Header mit Zurück */}
            <div className="mb-3 flex items-center gap-3">
              {enrolledExercises.length > 1 && (
                <button
                  onClick={() => setSelected(null)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-brand-400 hover:bg-ink-800 transition"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Zurück
                </button>
              )}
              <p className="flex-1 text-center text-sm font-semibold text-slate-300">
                {selected.name}
              </p>
              {enrolledExercises.length > 1 && <div className="w-14" />}
            </div>

            {/* Tab Toggle */}
            <div className="mb-4 flex rounded-xl bg-ink-950/60 p-1">
              {(['training', 'rest'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
                    tab === t ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {t === 'training' ? '🏋️ Training' : '😴 Ruhetag'}
                </button>
              ))}
            </div>

            {tab === 'training' ? (
              <>
                <QuickAdd exerciseId={selected.id} onLogged={onClose} onExerciseSwitch={setSelected} />
                {/* Verlauf-Link */}
                <button
                  onClick={openVerlauf}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-ink-700 py-2.5 text-sm text-slate-400 transition hover:border-ink-600 hover:text-slate-200"
                >
                  <CalendarIcon className="h-4 w-4" />
                  Verlauf &amp; bearbeiten
                </button>
              </>
            ) : (
              <RestDayTab exerciseId={selected.id} onClose={onClose} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Ruhetag-Tab ──────────────────────────────────────────────────────────────
function RestDayTab({ exerciseId, onClose }: { exerciseId: string; onClose: () => void }) {
  const { addRestDay } = useRestDays(exerciseId);
  const toast = useToast();
  const [restDate, setRestDate] = useState(berlinToday());
  const [saving, setSaving] = useState(false);

  async function save() {
    if (restDate < berlinToday()) {
      toast.notify('Vergangene Tage ohne Training zählen automatisch als Ruhetag.');
      return;
    }
    if (restDate > maxRestDate()) {
      toast.error('Maximal 14 Tage im Voraus planbar.');
      return;
    }
    setSaving(true);
    const { error } = await addRestDay(restDate);
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success('Ruhetag gespeichert.');
    onClose();
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Plane Ruhetage bis zu 14 Tage im Voraus. Vergangene Tage ohne Training zählen automatisch als Ruhetag.
      </p>
      <div className="relative">
        <div className="input-base flex items-center justify-between">
          <span>
            {new Date(restDate + 'T00:00:00').toLocaleDateString('de-DE', {
              weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
            })}
          </span>
          <CalendarIcon className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="date"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={restDate}
          min={berlinToday()}
          max={maxRestDate()}
          onChange={(e) => setRestDate(e.target.value || berlinToday())}
        />
      </div>
      <Button fullWidth size="lg" loading={saving} onClick={save}>
        Ruhetag speichern
      </Button>
    </div>
  );
}
