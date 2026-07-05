/**
 * EnrollmentModal – zeigt sich einmalig für neue Übungen.
 * User kann "Mitmachen" oder "Nein danke" wählen.
 */
import { useState } from 'react';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';
import type { Exercise } from '@/lib/database.types';
import { Button } from '@/components/ui/Button';

export function EnrollmentModal() {
  const { unenrolledExercises, enroll } = useExercise();
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);

  // Show first unenrolled exercise
  const ex: Exercise | undefined = unenrolledExercises[idx];
  if (!ex) return null;

  async function respond(status: 'enrolled' | 'declined') {
    if (busy) return;
    setBusy(true);
    await enroll(ex!.id, status);
    setIdx((i) => i + 1);
    setBusy(false);
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
            Tracke deine {ex.name}, sieh dich in der Rangliste und halte deine Streak aufrecht. Du kannst jederzeit in den Einstellungen austragen.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full"
            onClick={() => void respond('enrolled')}
            disabled={busy}
          >
            Mitmachen 💪
          </Button>
          <button
            onClick={() => void respond('declined')}
            disabled={busy}
            className="w-full rounded-xl py-3 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            Nein danke
          </button>
        </div>
      </div>
    </div>
  );
}
