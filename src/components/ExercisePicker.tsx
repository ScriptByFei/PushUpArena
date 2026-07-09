import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';

export function ExercisePicker() {
  const { enrolledExercises, exercise, switchExercise } = useExercise();

  if (enrolledExercises.length <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4">
      {enrolledExercises.map((ex) => {
        const isActive = exercise?.id === ex.id;
        return (
          <button
            key={ex.id}
            onClick={() => switchExercise(ex)}
            className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all ${
              isActive
                ? 'border-2 border-brand-400 bg-ink-800'
                : 'border border-ink-700 bg-ink-800 opacity-50'
            }`}
            style={
              isActive
                ? { boxShadow: '0 0 14px 3px rgba(139,92,246,0.45)' }
                : undefined
            }
          >
            <img
              src={EXERCISE_ICONS[ex.slug] ?? ''}
              alt={ex.name}
              className="h-9 w-9 object-contain"
            />
          </button>
        );
      })}
    </div>
  );
}
