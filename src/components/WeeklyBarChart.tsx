import type { DayData } from '@/hooks/useProfileStats';

interface Props {
  data: DayData[]; // 7 Einträge, ältester zuerst
}

const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

export function WeeklyBarChart({ data }: Props) {
  const max = Math.max(...data.map((d) => d.amount), 1);
  const MAX_H = 72;

  return (
    <div className="flex items-end justify-between gap-1.5" style={{ height: MAX_H + 36 }}>
      {data.map((day) => {
        const barH = Math.max(2, Math.round((day.amount / max) * MAX_H));
        const weekday = WEEKDAY_SHORT[new Date(day.date + 'T00:00:00Z').getUTCDay()];
        const isToday = day.date === new Date().toISOString().slice(0, 10);

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
  );
}
