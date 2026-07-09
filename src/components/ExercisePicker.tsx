import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';

const LABELS: Record<string, string> = {
  pushups: 'PushUp',
  pullups: 'PullUp',
  dips: 'Dips',
};

export function ExercisePicker() {
  const { enrolledExercises, exercise, switchExercise } = useExercise();

  if (enrolledExercises.length <= 1) return null;

  return (
    <div className="flex gap-1 rounded-2xl bg-ink-800 p-1">
      {enrolledExercises.map((ex) => {
        const isActive = exercise?.id === ex.id;
        return (
          <button
            key={ex.id}
            onClick={() => switchExercise(ex)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 transition-all ${
              isActive
                ? 'bg-brand-600 shadow-sm'
                : 'hover:bg-ink-700'
            }`}
          >
            <img
              src={EXERCISE_ICONS[ex.slug] ?? ''}
              alt={ex.name}
              className={`h-5 w-5 object-contain ${isActive ? 'brightness-0 invert' : 'opacity-50'}`}
            />
            <span className={`text-sm font-bold ${isActive ? 'text-white' : 'text-slate-400'}`}>
              {LABELS[ex.slug] ?? ex.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
