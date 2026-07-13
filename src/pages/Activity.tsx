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

/** Returns the Monday (00:00 local) of the week that contains `date`. */
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // 0 = Mon
  d.setDate(d.getDate() - dow);
  return d;
}

export default function Activity() {
  const { exercise } = useExercise();
  const { stats, loading, error } = useProfileStats(exercise?.id);
  const { goal } = useGoals(exercise?.id);
  const { restDays } = useRestDays(exercise?.id);
  const restDaySet = new Set(restDays.map((r) => r.rest_date));

  const today = new Date();
  const todayStr = today.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

  // ── Monatskalender-Navigation ─────────────────────────────────────────────
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());

  const minYear = today.getFullYear() - 1;
  const canGoPrevMonth = calYear > minYear || calMonth > 0;
  const canGoNextMonth = calYear < today.getFullYear() || calMonth < today.getMonth();

  function goPrevMonth() {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); }
    else setCalMonth((m) => m - 1);
  }
  function goNextMonth() {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); }
    else setCalMonth((m) => m + 1);
  }

  // ── Wochendiagramm-Navigation ─────────────────────────────────────────────
  const [weekOffset, setWeekOffset] = useState(0); // 0 = aktuelle Woche, -1 = letzte Woche, …

  if (loading) return <LoadingState label="Lade Aktivität …" />;
  if (error) return <ErrorState message={error} />;

  // Monday of the currently-displayed week
  const currentWeekMonday = getMondayOf(today);
  const targetMonday = new Date(currentWeekMonday);
  targetMonday.setDate(currentWeekMonday.getDate() + weekOffset * 7);

  // 7 days (Mon–Sun) for the target week
  const selectedWeekData: DayData[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(targetMonday);
    d.setDate(targetMonday.getDate() + i);
    const ds = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    return stats.dailyData.find((day) => day.date === ds) ?? { date: ds, amount: 0, sessions: 0 };
  });

  const selectedKw   = getISOWeekNumber(targetMonday);
  const selectedYear = targetMonday.getFullYear();

  // Title for the week card
  const weekTitle =
    weekOffset === 0 ? 'Diese Woche' :
    weekOffset === -1 ? 'Letzte Woche' :
    `KW ${selectedKw} · ${selectedYear}`;

  // How far back can we go? To the week containing the oldest data point, max 52 weeks.
  const oldestDateStr = stats.dailyData.reduce<string>(
    (oldest, d) => (d.date < oldest ? d.date : oldest),
    todayStr,
  );
  const oldestMonday  = getMondayOf(new Date(oldestDateStr));
  const weeksOfData   = Math.round((currentWeekMonday.getTime() - oldestMonday.getTime()) / (7 * 86400000));
  const minWeekOffset = -Math.min(weeksOfData, 52);

  const canGoBack    = weekOffset > minWeekOffset;
  const canGoForward = weekOffset < 0;

  return (
    <div className="space-y-3">
      {/* Zeitraum-Zusammenfassung */}
      <PeriodSummaryCard exercise={exercise} />

      {/* Wochendiagramm mit KW-Navigation */}
      <Card>
        <div className="flex items-center justify-between">
          {/* Zurück-Pfeil */}
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            disabled={!canGoBack}
            aria-label="Vorherige Woche"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-ink-700 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-25"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M10.5 3.5 5.5 8l5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>

          {/* Titel + KW-Badge */}
          <div className="flex items-baseline gap-2">
            <CardTitle>{weekTitle}</CardTitle>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              KW {selectedKw}
            </span>
          </div>

          {/* Vor-Pfeil */}
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            disabled={!canGoForward}
            aria-label="Nächste Woche"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-ink-700 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-25"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5.5 3.5 10.5 8l-5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </button>
        </div>

        <div className="mt-3">
          <WeeklyBarChart data={selectedWeekData} dailyGoal={goal?.daily_goal ?? undefined} />
        </div>
      </Card>

      {/* Monatskalender */}
      <Card className="!pt-2">
        <CardTitle>Aktivitätskalender</CardTitle>
        <MonthCalendar
          data={stats.dailyData}
          restDays={restDaySet}
          selectedYear={calYear}
          selectedMonth={calMonth}
          canGoPrev={canGoPrevMonth}
          canGoNext={canGoNextMonth}
          onPrev={goPrevMonth}
          onNext={goNextMonth}
          exerciseId={exercise?.id}
        />
      </Card>

      {/* Verlauf mit Bearbeitungsmöglichkeit */}
      <WorkoutHistory exerciseId={exercise?.id} unit={exercise?.unit === 'reps' ? 'Wdh.' : exercise?.unit ?? ''} />
    </div>
  );
}
