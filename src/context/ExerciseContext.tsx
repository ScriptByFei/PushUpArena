import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Exercise } from '@/lib/database.types';

export const EXERCISE_ICONS: Record<string, string> = {
  pushups: '/pushup-icon.png',
  pullups: '/pullup-icon.png',
  dips:    '/dips-icon.png',
};

const STORAGE_KEY = 'pua_active_exercise_slug';

interface ExerciseContextValue {
  exercise: Exercise | null;
  enrolledExercises: Exercise[];
  unenrolledExercises: Exercise[];
  declinedExercises: Exercise[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  switchExercise: (ex: Exercise) => void;
  enroll: (exerciseId: string, status: 'enrolled' | 'declined') => Promise<void>;
}

const ExerciseContext = createContext<ExerciseContextValue | undefined>(undefined);

export function ExerciseProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [declinedIds, setDeclinedIds] = useState<Set<string>>(new Set());
  const [respondedIds, setRespondedIds] = useState<Set<string>>(new Set());
  const [activeSlug, setActiveSlug] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? 'pushups',
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data: exData, error: exErr } = await supabase
      .from('exercises')
      .select('*')
      .order('display_order', { ascending: true });

    if (exErr) {
      setError(exErr.message);
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: enrollData } = await (supabase as any)
      .from('exercise_enrollments')
      .select('exercise_id, status')
      .eq('user_id', user.id);

    const enrolled = new Set<string>();
    const declined = new Set<string>();
    const responded = new Set<string>();
    for (const row of (enrollData ?? []) as { exercise_id: string; status: string }[]) {
      responded.add(row.exercise_id);
      if (row.status === 'enrolled') enrolled.add(row.exercise_id);
      if (row.status === 'declined') declined.add(row.exercise_id);
    }

    // Neue User: automatisch in Pushups einschreiben wenn noch kein Enrollment existiert
    if (responded.size === 0 && exData && exData.length > 0) {
      const pushups = exData.find((e) => e.slug === 'pushups');
      if (pushups) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('exercise_enrollments').upsert(
          { user_id: user.id, exercise_id: pushups.id, status: 'enrolled', responded_at: new Date().toISOString() },
          { onConflict: 'user_id,exercise_id' },
        );
        enrolled.add(pushups.id);
        responded.add(pushups.id);
      }
    }

    setAllExercises(exData ?? []);
    setEnrolledIds(enrolled);
    setDeclinedIds(declined);
    setRespondedIds(responded);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, nonce]);

  useEffect(() => {
    void load();
  }, [load]);

  const enrolledExercises = allExercises.filter((e) => enrolledIds.has(e.id));
  const declinedExercises = allExercises.filter((e) => declinedIds.has(e.id));
  const unenrolledExercises = allExercises.filter((e) => !respondedIds.has(e.id));

  const exercise =
    enrolledExercises.find((e) => e.slug === activeSlug) ??
    enrolledExercises[0] ??
    null;

  function switchExercise(ex: Exercise) {
    setActiveSlug(ex.slug);
    localStorage.setItem(STORAGE_KEY, ex.slug);
  }

  async function enroll(exerciseId: string, status: 'enrolled' | 'declined') {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('exercise_enrollments').upsert(
      {
        user_id: user.id,
        exercise_id: exerciseId,
        status,
        responded_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,exercise_id' },
    );
    setRespondedIds((prev) => new Set([...prev, exerciseId]));
    if (status === 'enrolled') {
      setEnrolledIds((prev) => new Set([...prev, exerciseId]));
      setDeclinedIds((prev) => { const s = new Set(prev); s.delete(exerciseId); return s; });
    } else {
      setDeclinedIds((prev) => new Set([...prev, exerciseId]));
      setEnrolledIds((prev) => { const s = new Set(prev); s.delete(exerciseId); return s; });
    }
  }

  return (
    <ExerciseContext.Provider
      value={{
        exercise,
        enrolledExercises,
        unenrolledExercises,
        declinedExercises,
        loading,
        error,
        reload: () => setNonce((n) => n + 1),
        switchExercise,
        enroll,
      }}
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
