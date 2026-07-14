import { useRef, useState, useEffect } from 'react';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';

export function ExerciseDropdown() {
  const { enrolledExercises, exercise: activeExercise, switchExercise } = useExercise();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  if (enrolledExercises.length <= 1) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-[40px] w-full items-center gap-2.5 rounded-xl border border-ink-700/50 bg-transparent px-3.5 transition hover:bg-ink-800/50"
      >
        <img
          src={EXERCISE_ICONS[activeExercise?.slug ?? ''] ?? ''}
          alt={activeExercise?.name ?? ''}
          className="h-7 w-7 shrink-0 object-contain"
        />
        <span className="flex-1 text-left text-sm font-semibold text-slate-100">
          {activeExercise?.name ?? ''}
        </span>
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-3.5 w-3.5 shrink-0 text-slate-400/70 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-ink-700/50 bg-ink-950/60 shadow-xl backdrop-blur-md">
          {enrolledExercises.map((ex) => {
            const isActive = ex.id === activeExercise?.id;
            return (
              <button
                key={ex.id}
                onClick={() => { switchExercise(ex); setOpen(false); }}
                className={`flex w-full items-center gap-3 px-4 py-3 transition ${
                  isActive ? 'bg-brand-600/20 text-brand-300' : 'text-slate-300 hover:bg-ink-800/60'
                }`}
              >
                <img
                  src={EXERCISE_ICONS[ex.slug] ?? ''}
                  alt={ex.name}
                  className="h-6 w-6 object-contain"
                />
                <span className="text-sm font-semibold">{ex.name}</span>
                {isActive && (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="ml-auto h-4 w-4">
                    <path
                      fillRule="evenodd"
                      d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
