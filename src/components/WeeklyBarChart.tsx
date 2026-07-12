import { useState } from 'react';
import type { DayData } from '@/hooks/useProfileStats';

interface Props {
  data: DayData[]; // 7 Einträge, ältester zuerst (Mon–So der aktuellen Woche)
  dailyGoal?: number;
}

const WEEKDAY_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WEEKDAY_LONG  = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

const TIP_H = 56; // Reserved px at the top for the tooltip
const BAR_H = 80; // Max bar height
const LBL_H = 20; // Weekday label area

export function WeeklyBarChart({ data, dailyGoal }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const max = Math.max(...data.map((d) => d.amount), dailyGoal ?? 0, 1);
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

  const activeDays = data.filter((d) => d.amount > 0);
  const avg =
    activeDays.length > 0
      ? Math.round(activeDays.reduce((s, d) => s + d.amount, 0) / activeDays.length)
      : null;

  // ── Active day info for tooltip ─────────────────────────────────────────────
  const activeDay   = activeIdx !== null ? data[activeIdx] : null;
  const actUtcDay   = activeDay ? new Date(activeDay.date + 'T00:00:00Z').getUTCDay() : 0;
  const actFormatted = activeDay
    ? new Date(activeDay.date + 'T00:00:00Z').toLocaleDateString('de-DE', {
        day: 'numeric', month: 'short', timeZone: 'UTC',
      })
    : '';
  const actIsFuture = activeDay ? activeDay.date > todayStr : false;

  // Tooltip horizontal position: center on active bar, clamp at edges
  const tooltipStyle: React.CSSProperties | null =
    activeIdx === null
      ? null
      : activeIdx === 0
        ? { left: 0 }
        : activeIdx === data.length - 1
          ? { right: 0 }
          : { left: `${((activeIdx + 0.5) / data.length) * 100}%`, transform: 'translateX(-50%)' };

  return (
    <div
      className="relative select-none"
      style={{ height: TIP_H + BAR_H + LBL_H }}
      onClick={() => setActiveIdx(null)}
    >
      {/* ── Tooltip ─────────────────────────────────────────────────────── */}
      {activeDay && !actIsFuture && tooltipStyle && (
        <div
          className="animate-pop-in pointer-events-none absolute top-0 z-30 whitespace-nowrap rounded-xl border border-ink-600/80 bg-ink-900 px-2.5 py-1.5 shadow-xl"
          style={tooltipStyle}
        >
          <p className="text-center text-[10px] font-semibold text-slate-300">
            {WEEKDAY_LONG[actUtcDay]}
          </p>
          <p className="text-center text-[10px] text-slate-500">{actFormatted}</p>
          {activeDay.amount > 0 ? (
            <>
              <p className="mt-0.5 text-center text-[13px] font-extrabold leading-tight text-brand-300">
                {activeDay.amount} Wdh.
              </p>
              {activeDay.sessions > 0 && (
                <p className="text-center text-[10px] text-slate-500">
                  {activeDay.sessions} {activeDay.sessions === 1 ? 'Satz' : 'Sätze'}
                </p>
              )}
            </>
          ) : (
            <p className="mt-0.5 text-center text-[11px] text-slate-500">Kein Training</p>
          )}
        </div>
      )}

      {/* ── Ziellinie (gestrichelt, lila) ───────────────────────────────── */}
      {dailyGoal && dailyGoal > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{ top: TIP_H + BAR_H - Math.round((dailyGoal / max) * BAR_H) }}
        >
          <div style={{ borderTop: '1.5px dashed rgba(167,139,250,0.55)' }} />
        </div>
      )}

      {/* ── Durchschnittslinie (solid, subtil) ──────────────────────────── */}
      {avg !== null && (
        <div
          className="pointer-events-none absolute inset-x-0 flex items-center"
          style={{ top: TIP_H + BAR_H - Math.round((avg / max) * BAR_H) }}
        >
          <div style={{ borderTop: '1px solid rgba(148,163,184,0.35)', flex: 1 }} />
          <span className="ml-1 shrink-0 text-[9px] font-semibold text-slate-500">Ø{avg}</span>
        </div>
      )}

      {/* ── Balken-Spalten ──────────────────────────────────────────────── */}
      <div
        className="absolute inset-x-0 flex gap-1.5"
        style={{ top: TIP_H, height: BAR_H + LBL_H }}
        onClick={(e) => e.stopPropagation()}
      >
        {data.map((day, idx) => {
          const barH     = day.amount > 0 ? Math.max(6, Math.round((day.amount / max) * BAR_H)) : 3;
          const utcDay   = new Date(day.date + 'T00:00:00Z').getUTCDay();
          const isToday  = day.date === todayStr;
          const isFuture = day.date > todayStr;
          const isActive = activeIdx === idx;

          // ── Bar color ──
          let barBg = '#7c3aed';
          if (isFuture || day.amount === 0) barBg = '#1e293b';
          else if (isToday) barBg = '#a78bfa';
          if (isActive && day.amount > 0) barBg = '#c4b5fd'; // brighter when selected

          // ── Bar shadow / outline ──
          const barShadow =
            isActive && day.amount > 0
              ? '0 0 10px 3px rgba(167,139,250,0.55)'
              : isToday && day.amount > 0
                ? '0 0 10px 2px rgba(167,139,250,0.45)'
                : undefined;
          const barOutline =
            isActive && day.amount > 0
              ? '1.5px solid rgba(196,181,253,0.85)'
              : isToday && day.amount > 0
                ? '1.5px solid rgba(167,139,250,0.6)'
                : undefined;

          // ── Aria label ──
          const ariaLabel =
            day.amount > 0
              ? `${WEEKDAY_LONG[utcDay]}, ${day.amount} Wiederholungen${
                  day.sessions > 0
                    ? ` in ${day.sessions} ${day.sessions === 1 ? 'Satz' : 'Sätzen'}`
                    : ''
                }`
              : isFuture
                ? WEEKDAY_LONG[utcDay]
                : `${WEEKDAY_LONG[utcDay]}, kein Training`;

          return (
            <button
              key={day.date}
              type="button"
              className="relative flex flex-1 flex-col items-center justify-end"
              style={{ height: BAR_H + LBL_H, cursor: isFuture ? 'default' : 'pointer' }}
              aria-label={ariaLabel}
              onClick={(e) => {
                e.stopPropagation();
                if (!isFuture) setActiveIdx(isActive ? null : idx);
              }}
            >
              {/* Balken */}
              <div
                className="w-full rounded-sm transition-all duration-200"
                style={{
                  height: barH,
                  marginBottom: LBL_H,
                  backgroundColor: barBg,
                  boxShadow: barShadow,
                  outline: barOutline,
                }}
              />

              {/* Wochentagslabel */}
              <span
                className={`absolute bottom-0 left-0 right-0 text-center text-[10px] leading-5 ${
                  isToday
                    ? 'font-bold text-brand-300'
                    : isFuture
                      ? 'text-slate-700'
                      : isActive
                        ? 'font-semibold text-slate-300'
                        : 'text-slate-500'
                }`}
              >
                {WEEKDAY_SHORT[utcDay]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
