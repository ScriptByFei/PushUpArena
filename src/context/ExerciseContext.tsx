import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import type { Exercise } from '@/lib/database.types';

// Aktuell aktive Übung. Das Modell ist generisch – später kann hier zwischen
// mehreren Übungen umgeschaltet werden.
export const ACTIVE_EXERCISE_SLUG = 'pushups';

interface ExerciseContextValue {
  exercise: Exercise | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const ExerciseContext = createContext<ExerciseContextValue | undefined>(undefined);

export function ExerciseProvider({ children }: { children: ReactNode }) {
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    supabase
      .from('exercises')
      .select('*')
      .eq('slug', ACTIVE_EXERCISE_SLUG)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) {
          setError(err.message);
        } else if (!data) {
          setError(
            'Übung "pushups" nicht gefunden. Wurden die Seed-Daten (0004_seed.sql) eingespielt?',
          );
        } else {
          setExercise(data);
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [nonce]);

  return (
    <ExerciseContext.Provider
      value={{ exercise, loading, error, reload: () => setNonce((n) => n + 1) }}
    >
      {children}
    </ExerciseContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useExercise(): ExerciseContextValue {
  const ctx = useContext(ExerciseContext);
  if (!ctx) throw new Error('useExercise muss innerhalb von ExerciseProvider verwendet werden.');
  return ctx;
}
