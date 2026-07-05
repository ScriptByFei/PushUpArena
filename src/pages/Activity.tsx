import { useState } from 'react';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';
import type { Exercise } from '@/lib/database.types';
import { useProfileStats } from '@/hooks/useProfileStats';
import { Card, CardTitle } from '@/components/ui/Card';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { MonthCalendar } from '@/components/MonthCalendar';
import { WeeklyBarChart } from '@/components/WeeklyBarChart';
import { useGoals } from '@/hooks/useGoals';
import { useRestDays } from '@/hooks/useRestDays';

export default function Activity() {
  const { exercise: activeExercise, enrolledExercises } = useExercise();
  const [localExercise, setLocalExercise] = useState<Exercise | null>(null);
  const exercise = localExercise ?? activeExercise;
  const { stats, loading, error } = useProfileStats(exercise?.id);
  const { goal } = useGoals(exercise?.id);
  const { restDays } = useRestDays(exercise?.id);
  const restDaySet = new Set(restDays.map((r) => r.rest_date));

  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const minYear = today.getFullYear() - 1;
  const canGoPrev = calYear > minYear || calMonth > 0;
  const canGoNext = calYear < today.getFullYear() || calMonth < today.getMonth();

  function goPrev() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
  }
  function goNext() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
  }

  if (loading) return <LoadingState label="Lade Aktivität …" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="space-y-4">
      {/* Übungs-Switcher (nur wenn >1 eingeschrieben) */}
      {enrolledExercises.length > 1 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${enrolledExercises.length}, 1fr)` }}>
          {enrolledExercises.map((ex) => {
            const isActive = ex.id === exercise?.id;
            return (
              <button
                key={ex.id}
                onClick={() => setLocalExercise(ex)}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  isActive ? 'bg-brand-600 text-white' : 'bg-ink-800 text-slate-400 hover:bg-ink-700'
                }`}
              >
                <img src={EXERCISE_ICONS[ex.slug] ?? '/pushup-icon.png'} alt={ex.name} className="h-5 w-5 rounded-md object-cover" />
                {ex.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Letzte 7 Tage */}
      {stats.last7DaysData.length > 0 && (
        <Card>
          <CardTitle>Letzte 7 Tage</CardTitle>
          <div className="mt-3">
            <WeeklyBarChart data={stats.last7DaysData} dailyGoal={goal?.daily_goal ?? undefined} />
          </div>
        </Card>
      )}

      {/* Monatskalender */}
      <Card className="!pt-2">
        <CardTitle>Aktivitätskalender</CardTitle>
        <MonthCalendar
          data={stats.dailyData}
          restDays={restDaySet}
          selectedYear={calYear}
          selectedMonth={calMonth}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onPrev={goPrev}
          onNext={goNext}
          exerciseId={exercise?.id}
        />
      </Card>
    </div>
  );
}
