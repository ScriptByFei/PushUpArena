import { useState } from 'react';
import { useExercise } from '@/context/ExerciseContext';
import { useProfileStats } from '@/hooks/useProfileStats';
import type { DayData } from '@/hooks/useProfileStats';
import { Card, CardTitle } from '@/components/ui/Card';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { MonthCalendar } from '@/components/MonthCalendar';
import { WeeklyBarChart } from '@/components/WeeklyBarChart';
import { useGoals } from '@/hooks/useGoals';
import { useRestDays } from '@/hooks/useRestDays';
import { PeriodSummaryCard } from '@/components/PeriodSummaryCard';
import { WorkoutHistory } from '@/components/WorkoutHistory';

function getISOWeekNumber(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const w1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

export default function Activity() {
  const { exercise } = useExercise();
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

  // Current ISO week (Mon–Sun) from dailyData
  const todayStr = today.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const dow = (today.getDay() + 6) % 7; // 0=Mon
  const kw = getISOWeekNumber(today);

  const currentWeekData: DayData[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - dow + i);
    const ds = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    return stats.dailyData.find((day) => day.date === ds) ?? { date: ds, amount: 0, sessions: 0 };
  });

  const hasWeekData = currentWeekData.some((d) => d.date <= todayStr);

  return (
    <div className="space-y-3">
      {/* Zeitraum-Zusammenfassung */}
      <PeriodSummaryCard exercise={exercise} />

      {/* Diese Woche */}
      {hasWeekData && (
        <Card>
          <div className="flex items-baseline justify-between">
            <CardTitle>Diese Woche</CardTitle>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">KW {kw}</span>
          </div>
          <div className="mt-3">
            <WeeklyBarChart data={currentWeekData} dailyGoal={goal?.daily_goal ?? undefined} />
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

      {/* Verlauf mit Bearbeitungsmöglichkeit */}
      <WorkoutHistory exerciseId={exercise?.id} unit={exercise?.unit === 'reps' ? 'Wdh.' : exercise?.unit ?? ''} />
    </div>
  );
}
