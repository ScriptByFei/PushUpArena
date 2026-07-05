/**
 * EnrollmentModal – zeigt sich einmalig für neue Übungen.
 * Zeigt immer unenrolledExercises[0] — nach jeder Antwort schrumpft
 * das Array automatisch, sodass die nächste Übung erscheint.
 */
import { useState } from 'react';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';
import type { Exercise } from '@/lib/database.types';
import { Button } from '@/components/ui/Button';

export function EnrollmentModal() {
  const { unenrolledExercises, enroll } = useExercise();
  const [busy, setBusy] = useState(false);

  // Immer die erste unbekannte Übung zeigen — Array schrumpft nach jeder Antwort
  const ex: Exercise | undefined = unenrolledExercises[0];
  if (!ex) return null;

  const isMandatory = ex.slug === 'pushups';

  async function respond(status: 'enrolled' | 'declined') {
    if (busy) return;
    setBusy(true);
    await enroll(ex!.id, status);
    setBusy(false);
    // kein idx nötig — nach enroll() aktualisiert ExerciseContext den Array
  }

  const icon = EXERCISE_ICONS[ex.slug] ?? '/pushup-icon.png';

  return (
    /* Backdrop */
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      {/* Sheet */}
      <div className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-6">
        <div className="mb-1 h-1 w-10 rounded-full bg-ink-600 mx-auto" />

        <div className="mt-5 flex flex-col items-center text-center">
          <img
            src={icon}
            alt={ex.name}
            className="h-20 w-20 rounded-2xl object-cover mb-4"
          />
          <h2 className="text-lg font-bold text-slate-100">
            Bei {ex.name} mitmachen?
          </h2>
          <p className="mt-2 text-sm text-slate-400 max-w-xs">
            Tracke deine {ex.name}, sieh dich in der Rangliste und halte deine Streak aufrecht.
          </p>
          {isMandatory ? (
            <p className="mt-1 text-xs text-brand-400 max-w-xs">
              Pflichtübung — immer dabei.
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500 max-w-xs">
              Du kannst dich jederzeit unter Einstellungen → Übungen verwalten ein- oder austragen.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full"
            loading={busy}
            onClick={() => void respond('enrolled')}
          >
            Mitmachen 💪
          </Button>
          {!isMandatory && (
            <button
              onClick={() => void respond('declined')}
              disabled={busy}
              className="w-full rounded-xl py-3 text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              Nein danke
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
