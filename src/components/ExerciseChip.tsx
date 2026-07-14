import { useRef, useState, useEffect } from 'react';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';

export function ExerciseChip({ compact = false }: { compact?: boolean }) {
  const { enrolledExercises, exercise, switchExercise } = useExercise();
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

  if (enrolledExercises.length <= 1 || !exercise) return null;

  return (
    <div ref={ref} className="relative">
      {compact ? (
        /* ── Compact (Header): minimalistisch, kein Hintergrund ── */
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-[48px] items-center gap-1.5 rounded-lg px-2 transition hover:bg-ink-800/40 active:scale-95"
        >
          <img
            src={EXERCISE_ICONS[exercise.slug] ?? ''}
            alt=""
            className="h-5 w-5 shrink-0 object-contain"
          />
          <span className="max-w-[88px] truncate text-[13px] font-semibold text-slate-200">
            {exercise.name}
          </span>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-2.5 w-2.5 shrink-0 text-slate-500/60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      ) : (
        /* ── Standard (nicht im Header) ── */
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-[30px] items-center gap-1.5 rounded-full px-2 transition active:scale-95"
          style={{
            background: 'linear-gradient(to bottom, #818cf8, #4f46e5)',
            boxShadow: '0 2px 8px rgba(79,70,229,0.40)',
          }}
        >
          <img
            src={EXERCISE_ICONS[exercise.slug] ?? ''}
            alt=""
            className="h-4 w-4 shrink-0 object-contain"
          />
          <span className="max-w-[100px] truncate text-[11px] font-semibold text-white">
            {exercise.name}
          </span>
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-3 w-3 shrink-0 text-white/70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-ink-700/50 bg-ink-950/70 shadow-xl backdrop-blur-md">
          {enrolledExercises.map((ex) => {
            const isActive = ex.id === exercise.id;
            return (
              <button
                key={ex.id}
                onClick={() => { switchExercise(ex); setOpen(false); }}
                className={`flex w-full items-center gap-3 px-4 py-2.5 transition ${
                  isActive ? 'bg-brand-600/20 text-brand-300' : 'text-slate-300 hover:bg-ink-700'
                }`}
              >
                <img src={EXERCISE_ICONS[ex.slug] ?? ''} alt={ex.name} className="h-5 w-5 object-contain" />
                <span className="text-sm font-semibold">{ex.name}</span>
                {isActive && (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="ml-auto h-4 w-4">
                    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
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
