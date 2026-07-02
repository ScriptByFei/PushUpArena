import { useState } from 'react';
import type { DayData } from '@/hooks/useProfileStats';

interface Props {
  data: DayData[];
  selectedYear: number;
  selectedMonth: number; // 0-basiert
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function tileClasses(amount: number, isToday: boolean): string {
  const base = 'flex flex-col items-center rounded-xl py-2 px-0.5 transition-colors';
  const ring = isToday ? ' ring-2 ring-brand-400' : '';
  if (amount === 0)  return `${base} bg-ink-800/40 border border-ink-700/40${ring}`;
  if (amount <= 25)  return `${base} bg-violet-900/70 border border-violet-800/50${ring}`;
  if (amount <= 75)  return `${base} bg-violet-700/80 border border-violet-600/50${ring}`;
  return             `${base} bg-brand-600/90 border border-brand-500/60${ring}`;
}

function dayNumberColor(amount: number, isToday: boolean): string {
  if (isToday)      return 'text-brand-300';
  if (amount === 0) return 'text-slate-600';
  if (amount <= 25) return 'text-violet-300';
  if (amount <= 75) return 'text-violet-100';
  return 'text-white';
}

function amountColor(amount: number): string {
  if (amount <= 25) return 'text-violet-400';
  if (amount <= 75) return 'text-violet-200';
  return 'text-brand-200';
}

function formatLong(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
  );
}

export function MonthCalendar({
  data,
  selectedYear,
  selectedMonth,
  canGoPrev,
  canGoNext,
  onPrev,
  onNext,
}: Props) {
  const [selected, setSelected] = useState<DayData | null>(null);

  const byDate = new Map(data.map((d) => [d.date, d]));
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

  const daysInMonth = new Date(Date.UTC(selectedYear, selectedMonth + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(selectedYear, selectedMonth, 1)).getUTCDay() + 6) % 7;

  const monthLabel = new Date(Date.UTC(selectedYear, selectedMonth, 1)).toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  function ds(day: number): string {
    return `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Auswahl zurücksetzen wenn Monat wechselt
  const selectedMonthKey = `${selectedYear}-${selectedMonth}`;

  return (
    <div>
      {/* Monatsnavigation */}
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={onPrev}
          disabled={!canGoPrev}
          className="rounded-full bg-ink-700 p-1.5 text-slate-300 transition hover:bg-ink-600 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Vorheriger Monat"
        >
          <ChevronLeft />
        </button>
        <span className="text-sm font-semibold text-slate-300">{monthLabel}</span>
        <button
          onClick={onNext}
          disabled={!canGoNext}
          className="rounded-full bg-ink-700 p-1.5 text-slate-300 transition hover:bg-ink-600 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Nächster Monat"
        >
          <ChevronRight />
        </button>
      </div>

      {/* Wochentag-Header */}
      <div className="mb-1.5 grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[11px] font-medium text-slate-500">
            {d}
          </div>
        ))}
      </div>

      {/* Kalender-Kacheln */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`${selectedMonthKey}-pad-${idx}`} />;
          const dateStr = ds(day);
          const entry = byDate.get(dateStr);
          const amount = entry?.amount ?? 0;
          const isToday = dateStr === todayStr;

          return (
            <button
              key={dateStr}
              onClick={() =>
                setSelected(
                  selected?.date === dateStr
                    ? null
                    : (entry ?? { date: dateStr, amount: 0, sessions: 0 }),
                )
              }
              className={tileClasses(amount, isToday)}
            >
              <span className={`text-sm font-bold leading-none ${dayNumberColor(amount, isToday)}`}>
                {day}
              </span>
              {amount > 0 && (
                <span className={`mt-1 text-[10px] font-semibold leading-none ${amountColor(amount)}`}>
                  {amount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Detailinfo bei Auswahl */}
      {selected && (
        <div className="mt-3 rounded-xl border border-ink-700 bg-ink-800/80 px-4 py-2.5">
          <p className="text-sm font-semibold text-slate-100">{formatLong(selected.date)}</p>
          {selected.amount === 0 ? (
            <p className="mt-0.5 text-xs text-slate-400">Kein Training</p>
          ) : (
            <p className="mt-0.5 text-xs text-slate-300">
              <span className="font-bold text-brand-300">{selected.amount}</span> Wdh.
              {selected.sessions > 1 && (
                <span className="ml-2 text-slate-400">· {selected.sessions} Sessions</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
