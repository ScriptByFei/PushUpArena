import { useState } from 'react';
import type { DayData } from '@/hooks/useProfileStats';

interface Props {
  data: DayData[]; // 182 Einträge, ältester zuerst
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

function cellBg(amount: number): string {
  if (amount === 0) return '#1e293b';
  if (amount <= 25) return '#3b0764';
  if (amount <= 50) return '#6d28d9';
  if (amount <= 100) return '#7c3aed';
  return '#a78bfa';
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function ActivityHeatmap({ data }: Props) {
  const [selected, setSelected] = useState<DayData | null>(null);

  // Pad the beginning so the first cell lands on the correct weekday (Mon=0)
  const firstDayOfWeek = (new Date(data[0].date + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0=Mon
  const padded = [...Array<null>(firstDayOfWeek).fill(null), ...data];
  const totalCols = Math.ceil(padded.length / 7);

  // Month labels: find the first cell of each month
  const monthLabels: { col: number; label: string }[] = [];
  for (let i = 0; i < padded.length; i++) {
    const cell = padded[i];
    if (!cell) continue;
    if (cell.date.slice(8, 10) === '01' || i === firstDayOfWeek) {
      const col = Math.floor(i / 7);
      const d = new Date(cell.date + 'T00:00:00Z');
      const label = d.toLocaleDateString('de-DE', { month: 'short', timeZone: 'UTC' });
      if (!monthLabels.find((m) => m.col === col)) {
        monthLabels.push({ col, label });
      }
    }
  }

  const CELL = 12;
  const GAP = 2;
  const STEP = CELL + GAP;
  const LABEL_W = 20;

  return (
    <div>
      <div className="overflow-x-auto pb-2">
        <div style={{ width: LABEL_W + totalCols * STEP, minWidth: 'max-content' }}>
          {/* Monatsbeschriftung */}
          <div className="relative mb-1" style={{ height: 14, marginLeft: LABEL_W }}>
            {monthLabels.map(({ col, label }) => (
              <span
                key={col}
                className="absolute text-[10px] text-slate-500"
                style={{ left: col * STEP }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Grid */}
          <div className="flex gap-0">
            {/* Wochentag-Labels */}
            <div
              className="flex shrink-0 flex-col"
              style={{ gap: GAP, marginRight: GAP, width: LABEL_W - GAP }}
            >
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="flex items-center justify-end text-[9px] text-slate-600"
                  style={{ height: CELL }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Wochen-Spalten */}
            <div
              style={{
                display: 'grid',
                gridTemplateRows: `repeat(7, ${CELL}px)`,
                gridAutoFlow: 'column',
                gap: GAP,
              }}
            >
              {padded.map((cell, idx) =>
                cell === null ? (
                  <div key={`pad-${idx}`} style={{ width: CELL, height: CELL }} />
                ) : (
                  <button
                    key={cell.date}
                    onClick={() => setSelected(selected?.date === cell.date ? null : cell)}
                    style={{
                      width: CELL,
                      height: CELL,
                      backgroundColor: cellBg(cell.amount),
                      borderRadius: 2,
                    }}
                    aria-label={`${cell.date}: ${cell.amount}`}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Farbskala */}
      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
        <span>Weniger</span>
        {[0, 15, 38, 75, 120].map((v) => (
          <div
            key={v}
            className="rounded-sm"
            style={{ width: 10, height: 10, backgroundColor: cellBg(v) }}
          />
        ))}
        <span>Mehr</span>
      </div>

      {/* Detailinfo bei Auswahl */}
      {selected && (
        <div className="mt-3 rounded-xl border border-ink-700 bg-ink-800/80 px-4 py-2.5 text-sm">
          <p className="font-semibold text-slate-100">{formatDisplayDate(selected.date)}</p>
          {selected.amount === 0 ? (
            <p className="text-xs text-slate-400">Kein Training</p>
          ) : (
            <p className="text-xs text-slate-300">
              <span className="font-bold text-brand-300">{selected.amount}</span> Wdh.
              {selected.sessions > 1 && (
                <span className="ml-2 text-slate-400">({selected.sessions} Sessions)</span>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
