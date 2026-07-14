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
  const [activeIdx,  setActiveIdx]  = useState<number | null>(null);
  const [activeLine, setActiveLine] = useState<'avg' | 'goal' | null>(null);

  const max = Math.max(...data.map((d) => d.amount), dailyGoal ?? 0, 1);
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

  const activeDays = data.filter((d) => d.amount > 0);
  const avg =
    activeDays.length > 0
      ? Math.round(activeDays.reduce((s, d) => s + d.amount, 0) / activeDays.length)
      : null;

  // ── Bar tooltip data ─────────────────────────────────────────────────────────
  const activeDay    = activeIdx !== null ? data[activeIdx] : null;
  const actUtcDay    = activeDay ? new Date(activeDay.date + 'T00:00:00Z').getUTCDay() : 0;
  const actFormatted = activeDay
    ? new Date(activeDay.date + 'T00:00:00Z').toLocaleDateString('de-DE', {
        day: 'numeric', month: 'short', timeZone: 'UTC',
      })
    : '';
  const actIsFuture = activeDay ? activeDay.date > todayStr : false;

  const barTooltipStyle: React.CSSProperties | null =
    activeIdx === null
      ? null
      : activeIdx === 0
        ? { left: 0 }
        : activeIdx === data.length - 1
          ? { right: 0 }
          : { left: `${((activeIdx + 0.5) / data.length) * 100}%`, transform: 'translateX(-50%)' };

  // ── Reference line y-positions ───────────────────────────────────────────────
  const avgY  = avg  !== null              ? TIP_H + BAR_H - Math.round((avg        / max) * BAR_H) : null;
  const goalY = dailyGoal && dailyGoal > 0  ? TIP_H + BAR_H - Math.round((dailyGoal / max) * BAR_H) : null;

  const hasLegend = avg !== null || (dailyGoal != null && dailyGoal > 0);

  // ── Interaction ──────────────────────────────────────────────────────────────
  function clearAll()  { setActiveIdx(null); setActiveLine(null); }

  function tapBar(idx: number, isFuture: boolean) {
    setActiveLine(null);
    if (!isFuture) setActiveIdx(prev => prev === idx ? null : idx);
  }

  function tapLegend(line: 'avg' | 'goal') {
    setActiveIdx(null);
    setActiveLine(prev => prev === line ? null : line);
  }

  return (
    <div className="select-none">

      {/* ── Chart area ──────────────────────────────────────────────────────── */}
      <div
        className="relative"
        style={{ height: TIP_H + BAR_H + LBL_H }}
        onClick={clearAll}
      >

        {/* Bar tooltip */}
        {activeDay && !actIsFuture && barTooltipStyle && (
          <div
            className="animate-pop-in pointer-events-none absolute top-0 z-30 whitespace-nowrap rounded-xl border border-ink-600/80 bg-ink-900 px-2.5 py-1.5 shadow-xl"
            style={barTooltipStyle}
          >
            <p className="text-center text-[10px] font-semibold text-slate-300">{WEEKDAY_LONG[actUtcDay]}</p>
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

        {/* Avg legend tooltip */}
        {activeLine === 'avg' && avg !== null && (
          <div
            className="animate-pop-in pointer-events-none absolute top-0 z-30 whitespace-nowrap rounded-xl border border-ink-600/80 bg-ink-900 px-2.5 py-1.5 shadow-xl"
            style={{ left: '50%', transform: 'translateX(-50%)' }}
          >
            <p className="text-center text-[10px] font-semibold text-brand-300">Ø {avg} Wdh.</p>
            <p className="text-center text-[10px] text-slate-500">Durchschnitt pro Trainingstag</p>
          </div>
        )}

        {/* Goal legend tooltip */}
        {activeLine === 'goal' && dailyGoal != null && dailyGoal > 0 && (
          <div
            className="animate-pop-in pointer-events-none absolute top-0 z-30 whitespace-nowrap rounded-xl border border-ink-600/80 bg-ink-900 px-2.5 py-1.5 shadow-xl"
            style={{ left: '50%', transform: 'translateX(-50%)' }}
          >
            <p className="text-center text-[10px] font-semibold text-amber-300">🎯 {dailyGoal} Wdh.</p>
            <p className="text-center text-[10px] text-slate-500">Tagesziel</p>
          </div>
        )}

        {/* ── Tagesziel-Linie: solid, amber/gold ─────────────────────────── */}
        {goalY !== null && (
          <div
            className="pointer-events-none absolute inset-x-0"
            style={{ top: goalY - 1, borderTop: '1.5px solid rgba(251,191,36,0.68)' }}
          />
        )}

        {/* ── Durchschnittslinie: 2px dashed, violett ────────────────────── */}
        {avgY !== null && avg !== null && (
          <div
            className="pointer-events-none absolute inset-x-0"
            style={{ top: avgY - 1, borderTop: '2px dashed rgba(139,92,246,0.82)' }}
          />
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
            const aboveAvg = avg !== null && day.amount > 0 && day.amount >= avg;
            const belowAvg = avg !== null && day.amount > 0 && day.amount < avg;

            // Bar color
            let barBg = '#7c3aed';
            if (isFuture || day.amount === 0) barBg = '#1e293b';
            else if (isToday) barBg = '#a78bfa';
            if (isActive && day.amount > 0) barBg = '#c4b5fd';

            // Opacity: below avg → etwas gedimmt
            const barOpacity =
              !isFuture && !isActive && !isToday && belowAvg ? 0.52 : 1;

            // Shadow / outline
            let barShadow: string | undefined;
            let barOutline: string | undefined;
            if (isActive && day.amount > 0) {
              barShadow  = '0 0 10px 3px rgba(167,139,250,0.55)';
              barOutline = '1.5px solid rgba(196,181,253,0.85)';
            } else if (isToday && day.amount > 0) {
              barShadow  = '0 0 10px 2px rgba(167,139,250,0.45)';
              barOutline = '1.5px solid rgba(167,139,250,0.6)';
            } else if (aboveAvg && !isFuture) {
              barShadow = '0 0 7px 2px rgba(124,58,237,0.35)';
            }

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
                onClick={(e) => { e.stopPropagation(); tapBar(idx, isFuture); }}
              >
                <div
                  className="w-full rounded-sm transition-all duration-200"
                  style={{
                    height: barH,
                    marginBottom: LBL_H,
                    backgroundColor: barBg,
                    boxShadow: barShadow,
                    outline: barOutline,
                    opacity: barOpacity,
                  }}
                />
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

      {/* ── Legende unter dem Diagramm ──────────────────────────────────────── */}
      {hasLegend && (
        <div className="mt-2 flex items-center gap-5 px-0.5">
          {avg !== null && (
            <button
              type="button"
              onClick={() => tapLegend('avg')}
              className={`flex items-center gap-1.5 transition-opacity ${
                activeLine === 'avg' ? 'opacity-100' : 'opacity-60 hover:opacity-90'
              }`}
            >
              {/* Dashed line icon */}
              <svg width="20" height="6" viewBox="0 0 20 6" fill="none" aria-hidden>
                <line
                  x1="0" y1="3" x2="20" y2="3"
                  stroke="rgba(139,92,246,0.9)"
                  strokeWidth="2"
                  strokeDasharray="3 2.5"
                />
              </svg>
              <span className="text-[11px] text-slate-500">Ø {avg}</span>
            </button>
          )}
          {dailyGoal != null && dailyGoal > 0 && (
            <button
              type="button"
              onClick={() => tapLegend('goal')}
              className={`flex items-center gap-1.5 transition-opacity ${
                activeLine === 'goal' ? 'opacity-100' : 'opacity-60 hover:opacity-90'
              }`}
            >
              {/* Solid line icon */}
              <svg width="20" height="6" viewBox="0 0 20 6" fill="none" aria-hidden>
                <line
                  x1="0" y1="3" x2="20" y2="3"
                  stroke="rgba(251,191,36,0.75)"
                  strokeWidth="1.5"
                />
              </svg>
              <span className="text-[11px] text-slate-500">🎯 {dailyGoal}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
