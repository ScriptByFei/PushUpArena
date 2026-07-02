import { useState } from 'react';
import { useExercise } from '@/context/ExerciseContext';
import { useProfileStats } from '@/hooks/useProfileStats';
import { useGoals } from '@/hooks/useGoals';
import { Card, CardTitle } from '@/components/ui/Card';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { MonthCalendar } from '@/components/MonthCalendar';
import { WeeklyBarChart } from '@/components/WeeklyBarChart';

export default function Activity() {
  const { exercise } = useExercise();
  const { stats, loading, error } = useProfileStats(exercise?.id);
  const { goal } = useGoals(exercise?.id);

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
      {/* Letzte 7 Tage */}
      {stats.last7DaysData.length > 0 && (
        <Card>
          <CardTitle>Letzte 7 Tage</CardTitle>
          <div className="mt-3">
            <WeeklyBarChart data={stats.last7DaysData} dailyGoal={goal?.daily_goal ?? 0} />
          </div>
        </Card>
      )}

      {/* Monatskalender */}
      <Card>
        <CardTitle>Aktivitätskalender</CardTitle>
        <MonthCalendar
          data={stats.dailyData}
          selectedYear={calYear}
          selectedMonth={calMonth}
          canGoPrev={canGoPrev}
          canGoNext={canGoNext}
          onPrev={goPrev}
          onNext={goNext}
        />
      </Card>
    </div>
  );
}
