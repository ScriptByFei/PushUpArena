import { useState } from 'react';
import { useWorkoutLogger } from '@/hooks/useWorkoutLogger';
import { useQuickAmounts } from '@/hooks/useQuickAmounts';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function QuickAdd({
  exerciseId,
  unit = 'Wdh.',
  onLogged,
}: {
  exerciseId?: string;
  unit?: string;
  onLogged?: (info: { amount: number; entryId: string }) => void;
}) {
  const { submit, submitting } = useWorkoutLogger(exerciseId, unit);
  const { amounts: presets } = useQuickAmounts(exerciseId);
  const { exercise, enrolledExercises, switchExercise } = useExercise();
  const [custom, setCustom] = useState('');
  const [active, setActive] = useState<number | null>(null);
  const [showSwitcher, setShowSwitcher] = useState(false);

  const iconSrc = exercise ? (EXERCISE_ICONS[exercise.slug] ?? '/pushup-icon.png') : '/pushup-icon.png';
  const canSwitch = enrolledExercises.length > 1;

  async function log(amount: number) {
    if (amount <= 0) return;
    setActive(amount);
    const { error, entry } = await submit({ amount });
    setActive(null);
    if (!error && entry) {
      setCustom('');
      onLogged?.({ amount, entryId: entry.id });
    }
  }

  return (
    <>
      <div>
        <div className="grid grid-cols-4 gap-2">
          {presets.filter(n => n > 0).map((n) => {
            const isActive = active === n;
            return (
              <button
                key={n}
                type="button"
                disabled={submitting}
                onClick={() => log(n)}
                className={`rounded-xl py-4 text-lg font-semibold transition active:scale-95 disabled:opacity-60 ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-glow ring-2 ring-brand-400'
                    : 'bg-ink-700 text-slate-100 hover:bg-ink-600'
                }`}
              >
                +{n}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {/* Icon – tappable if multiple exercises enrolled */}
          <button
            type="button"
            onClick={() => canSwitch && setShowSwitcher(true)}
            className={`relative h-full w-full rounded-xl overflow-hidden ${canSwitch ? 'active:scale-95 transition' : ''}`}
            aria-label={canSwitch ? 'Übung wechseln' : exercise?.name}
          >
            <img src={iconSrc} alt={exercise?.name ?? 'Übung'} className="h-full w-full object-cover" />
            {canSwitch && (
              <div className="absolute bottom-1 right-1 rounded-full bg-black/50 p-0.5">
                <svg viewBox="0 0 16 16" fill="white" className="h-2.5 w-2.5">
                  <path d="M5 8l3 3 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                </svg>
              </div>
            )}
          </button>
          {/* form mit contents: Kinder nehmen direkt am Grid teil */}
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault();
              log(parseInt(custom, 10) || 0);
            }}
          >
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Eigene Anzahl"
              className="col-span-2 text-center"
            />
            <Button type="submit" size="lg" loading={submitting && active === null} disabled={!custom}>
              Los
            </Button>
          </form>
        </div>
      </div>

      {/* Exercise Switcher Bottom Sheet */}
      {showSwitcher && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSwitcher(false)}
        >
          <div
            className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-4 pb-10 pt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 h-1 w-10 rounded-full bg-ink-600 mx-auto" />
            <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-slate-500">
              Übung wechseln
            </p>
            <div className="flex flex-col gap-2">
              {enrolledExercises.map((ex) => {
                const isActive = ex.id === exercise?.id;
                return (
                  <button
                    key={ex.id}
                    onClick={() => { switchExercise(ex); setShowSwitcher(false); }}
                    className={`flex items-center gap-4 rounded-2xl px-4 py-3 transition ${
                      isActive
                        ? 'bg-brand-600/20 border border-brand-600/40'
                        : 'bg-ink-800 hover:bg-ink-700'
                    }`}
                  >
                    <img
                      src={EXERCISE_ICONS[ex.slug] ?? '/pushup-icon.png'}
                      alt={ex.name}
                      className="h-12 w-12 rounded-xl object-cover"
                    />
                    <span className={`text-base font-semibold ${isActive ? 'text-brand-300' : 'text-slate-200'}`}>
                      {ex.name}
                    </span>
                    {isActive && (
                      <span className="ml-auto text-xs text-brand-400">Aktiv</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
