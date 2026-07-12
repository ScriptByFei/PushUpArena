import { useState } from 'react';
import type { DayData } from '@/hooks/useProfileStats';

interface Props {
  data: DayData[]; // 7 Einträge, ältester zuerst (Mon–So der aktuellen Woche)
  dailyGoal?: number;
}

const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MAX_H = 80;

export function WeeklyBarChart({ data, dailyGoal }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const max = Math.max(...data.map((d) => d.amount), dailyGoal ?? 0, 1);

  // Goal line
  const goalLineTop = dailyGoal && dailyGoal > 0
    ? MAX_H - Math.round((dailyGoal / max) * MAX_H)
    : null;

  // Average line (only over days with training)
  const activeDays = data.filter((d) => d.amount > 0);
  const avg = activeDays.length > 0
    ? Math.round(activeDays.reduce((s, d) => s + d.amount, 0) / activeDays.length)
    : null;
  const avgLineTop = avg != null ? MAX_H - Math.round((avg / max) * MAX_H) : null;

  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

  return (
    <div className="relative" style={{ height: MAX_H + 40 }}>
      {/* Ziellinie (gestrichelt, lila) */}
      {goalLineTop !== null && (
        <div
          className="pointer-events-none absolute left-0 right-0"
          style={{ top: 22 + goalLineTop }}
        >
          <div style={{ borderTop: '1.5px dashed rgba(167,139,250,0.55)', width: '100%' }} />
        </div>
      )}

      {/* Durchschnittslinie (solid, subtil) */}
      {avgLineTop !== null && (
        <div
          className="pointer-events-none absolute left-0 right-0 flex items-center"
          style={{ top: 22 + avgLineTop }}
        >
          <div style={{ borderTop: '1px solid rgba(148,163,184,0.35)', flex: 1 }} />
          <span className="ml-1 shrink-0 text-[9px] font-semibold text-slate-500">Ø{avg}</span>
        </div>
      )}

      {/* Balken */}
      <div className="flex h-full items-end justify-between gap-1.5">
        {data.map((day, idx) => {
          const barH = day.amount > 0 ? Math.max(4, Math.round((day.amount / max) * MAX_H)) : 3;
          const weekday = WEEKDAY_SHORT[new Date(day.date + 'T00:00:00Z').getUTCDay()];
          const isToday = day.date === todayStr;
          const isFuture = day.date > todayStr;
          const isActive = activeIdx === idx;

          const formattedDate = new Date(day.date + 'T00:00:00Z').toLocaleDateString('de-DE', {
            weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
          });

          return (
            <div
              key={day.date}
              className="relative flex flex-1 cursor-pointer flex-col items-center gap-0.5"
              onClick={() => setActiveIdx(!isFuture && day.amount > 0 ? (isActive ? null : idx) : null)}
            >
              {/* Tooltip */}
              {isActive && day.amount > 0 && (
                <div className="animate-pop-in absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-xl border border-ink-600/80 bg-ink-900 px-2.5 py-1.5 shadow-xl">
                  <p className="text-center text-[13px] font-extrabold leading-none text-brand-300">{day.amount}</p>
                  <p className="mt-0.5 text-center text-[9px] text-slate-400">{formattedDate}</p>
                </div>
              )}

              {/* Wert-Label */}
              <span className={`text-[10px] font-medium ${day.amount > 0 && !isFuture ? 'text-brand-300' : 'text-transparent'}`}>
                {day.amount > 0 ? day.amount : '·'}
              </span>

              {/* Balken */}
              <div
                className="w-full rounded-t-sm transition-all duration-300"
                style={{
                  height: barH,
                  marginTop: MAX_H - barH,
                  backgroundColor: isFuture || day.amount === 0
                    ? '#1e293b'
                    : isToday
                      ? '#a78bfa'
                      : '#7c3aed',
                  ...(isToday && day.amount > 0
                    ? { boxShadow: '0 0 10px 2px rgba(167,139,250,0.45)', outline: '1.5px solid rgba(167,139,250,0.6)' }
                    : {}),
                  ...(isActive && day.amount > 0
                    ? { opacity: 0.85 }
                    : {}),
                }}
              />

              {/* Wochentag */}
              <span className={`text-[10px] ${isToday ? 'font-bold text-brand-300' : isFuture ? 'text-slate-700' : 'text-slate-500'}`}>
                {weekday}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
