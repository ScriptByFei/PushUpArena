import type { DayData } from '@/hooks/useProfileStats';

interface Props {
  data: DayData[]; // 7 Einträge, ältester zuerst
  dailyGoal?: number; // optional – zeigt gestrichelte Ziellinie
}

const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function WeeklyBarChart({ data, dailyGoal }: Props) {
  const max = Math.max(...data.map((d) => d.amount), dailyGoal ?? 0, 1);
  const MAX_H = 72;

  // Position der Ziellinie (px von oben im Balkenbereich)
  const goalLineTop = dailyGoal && dailyGoal > 0
    ? MAX_H - Math.round((dailyGoal / max) * MAX_H)
    : null;

  return (
    <div className="relative" style={{ height: MAX_H + 36 }}>
      {/* Gestrichelte Ziellinie */}
      {goalLineTop !== null && (
        <div
          className="pointer-events-none absolute left-0 right-0"
          style={{ top: 20 + goalLineTop }} // 20px = Platz für den Wert-Label oben
        >
          <div
            style={{
              borderTop: '1.5px dashed rgba(167,139,250,0.55)',
              width: '100%',
            }}
          />
        </div>
      )}

      {/* Balken */}
      <div className="flex h-full items-end justify-between gap-1.5">
        {data.map((day) => {
          const barH = Math.max(2, Math.round((day.amount / max) * MAX_H));
          const weekday = WEEKDAY_SHORT[new Date(day.date + 'T00:00:00Z').getUTCDay()];
          const isToday = day.date === new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
              {/* Wert */}
              <span className={`text-[10px] font-medium ${day.amount > 0 ? 'text-brand-300' : 'text-transparent'}`}>
                {day.amount > 0 ? day.amount : '·'}
              </span>
              {/* Balken */}
              <div
                className="w-full rounded-t-sm"
                style={{
                  height: barH,
                  backgroundColor: day.amount === 0
                    ? '#1e293b'
                    : isToday
                      ? '#a78bfa'
                      : '#7c3aed',
                  marginTop: MAX_H - barH,
                }}
              />
              {/* Wochentag */}
              <span className={`text-[10px] ${isToday ? 'font-bold text-brand-300' : 'text-slate-500'}`}>
                {weekday}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
