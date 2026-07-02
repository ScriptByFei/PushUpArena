import { useState } from 'react';
import type { DayData } from '@/hooks/useProfileStats';

interface Props {
  data: DayData[];
  selectedYear: number;
  selectedMonth: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function intensity(amount: number): 0 | 1 | 2 | 3 {
  if (amount === 0) return 0;
  if (amount <= 30)  return 1;
  if (amount <= 80)  return 2;
  return 3;
}

const CELL_BG: Record<0 | 1 | 2 | 3, string> = {
  0: 'bg-ink-800/60',
  1: 'bg-violet-900/80',
  2: 'bg-violet-600/90',
  3: 'bg-brand-500',
};

const DAY_COLOR: Record<0 | 1 | 2 | 3, string> = {
  0: 'text-slate-600',
  1: 'text-violet-300',
  2: 'text-violet-100',
  3: 'text-white',
};

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

export function MonthCalendar({ data, selectedYear, selectedMonth, canGoPrev, canGoNext, onPrev, onNext }: Props) {
  const [selected, setSelected] = useState<DayData | null>(null);

  const byDate = new Map(data.map((d) => [d.date, d]));
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

  const daysInMonth = new Date(Date.UTC(selectedYear, selectedMonth + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(selectedYear, selectedMonth, 1)).getUTCDay() + 6) % 7;

  const monthLabel = new Date(Date.UTC(selectedYear, selectedMonth, 1)).toLocaleDateString('de-DE', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  });

  function ds(day: number) {
    return `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthKey = `${selectedYear}-${selectedMonth}`;

  return (
    <div>
      {/* Navigation */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={onPrev}
          disabled={!canGoPrev}
          className="rounded-full p-1.5 text-slate-400 transition hover:bg-ink-700 hover:text-slate-200 disabled:opacity-25"
          aria-label="Vorheriger Monat"
        >
          <ChevronLeft />
        </button>
        <span className="text-sm font-semibold text-slate-200">{monthLabel}</span>
        <button
          onClick={onNext}
          disabled={!canGoNext}
          className="rounded-full p-1.5 text-slate-400 transition hover:bg-ink-700 hover:text-slate-200 disabled:opacity-25"
          aria-label="Nächster Monat"
        >
          <ChevronRight />
        </button>
      </div>

      {/* Wochentag-Header */}
      <div className="mb-1 grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wide text-slate-600">
            {d}
          </div>
        ))}
      </div>

      {/* Kacheln */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((day, idx) => {
          if (day === null) return <div key={`${monthKey}-pad-${idx}`} />;
          const dateStr = ds(day);
          const entry = byDate.get(dateStr);
          const amount = entry?.amount ?? 0;
          const level = intensity(amount);
          const isToday = dateStr === todayStr;
          const isSelected = selected?.date === dateStr;

          return (
            <button
              key={dateStr}
              onClick={() =>
                setSelected(isSelected ? null : (entry ?? { date: dateStr, amount: 0, sessions: 0 }))
              }
              className={`
                relative flex aspect-square items-center justify-center rounded-lg text-xs font-bold transition-all
                ${CELL_BG[level]}
                ${isToday ? 'ring-2 ring-brand-400 ring-offset-1 ring-offset-ink-900' : ''}
                ${isSelected ? 'scale-110 shadow-lg shadow-brand-900/50' : 'hover:scale-105'}
              `}
            >
              <span className={DAY_COLOR[level]}>{day}</span>
            </button>
          );
        })}
      </div>

      {/* Legende */}
      <div className="mt-3 flex items-center justify-end gap-1.5">
        <span className="text-[10px] text-slate-600">Weniger</span>
        {([0, 1, 2, 3] as const).map((l) => (
          <div key={l} className={`h-3 w-3 rounded-sm ${CELL_BG[l]}`} />
        ))}
        <span className="text-[10px] text-slate-600">Mehr</span>
      </div>

      {/* Detailinfo */}
      {selected && (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-2.5">
          <p className="text-sm font-medium text-slate-300">
            {new Date(selected.date + 'T00:00:00Z').toLocaleDateString('de-DE', {
              weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
            })}
          </p>
          {selected.amount === 0 ? (
            <span className="text-xs text-slate-500">Kein Training</span>
          ) : (
            <span className="text-sm font-bold text-brand-300">
              {selected.amount}
              {selected.sessions > 1 && (
                <span className="ml-1.5 text-xs font-normal text-slate-400">· {selected.sessions}×</span>
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
