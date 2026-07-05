import { useState } from 'react';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';
import { QuickAdd } from '@/components/QuickAdd';
import type { Exercise } from '@/lib/database.types';

interface FABSheetProps {
  onClose: () => void;
}

export function FABSheet({ onClose }: FABSheetProps) {
  const { enrolledExercises, switchExercise } = useExercise();
  const [selected, setSelected] = useState<Exercise | null>(
    enrolledExercises.length === 1 ? enrolledExercises[0] : null,
  );

  function pick(ex: Exercise) {
    switchExercise(ex);
    setSelected(ex);
  }

  return (
    <div
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
                  <svg
                    viewBox="0 0 24 24"
                    className="ml-auto h-5 w-5 text-slate-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              ))}
            </div>
          </>
        ) : (
          /* ── QuickAdd für gewählte Übung ── */
          <>
            <div className="mb-4 flex items-center gap-3">
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
            <QuickAdd
              exerciseId={selected.id}
              onLogged={onClose}
            />
          </>
        )}
      </div>
    </div>
  );
}
