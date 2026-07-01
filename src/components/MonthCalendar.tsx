import { useState } from 'react';
import type { DayData } from '@/hooks/useProfileStats';

interface Props {
  data: DayData[]; // mind. letzter Monat, ältester zuerst
}

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function tileClasses(amount: number, isToday: boolean): string {
  const base = 'flex flex-col items-center rounded-xl py-2 px-0.5 transition-colors';
  const todayRing = isToday ? ' ring-2 ring-brand-400' : '';
  if (amount === 0)    return `${base} bg-ink-800/40 border border-ink-700/40${todayRing}`;
  if (amount <= 25)    return `${base} bg-violet-900/70 border border-violet-800/50${todayRing}`;
  if (amount <= 75)    return `${base} bg-violet-700/80 border border-violet-600/50${todayRing}`;
  return               `${base} bg-brand-600/90 border border-brand-500/60${todayRing}`;
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

export function MonthCalendar({ data }: Props) {
  const [selected, setSelected] = useState<DayData | null>(null);

  const byDate = new Map(data.map((d) => [d.date, d]));

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const todayStr = now.toISOString().slice(0, 10);
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Mo=0

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString('de-DE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  function ds(day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <p className="mb-3 text-center text-sm font-semibold text-slate-300">{monthLabel}</p>

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
          if (day === null) return <div key={`pad-${idx}`} />;
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
