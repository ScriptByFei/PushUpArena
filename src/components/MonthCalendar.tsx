import { useState, useEffect, useRef } from 'react';
import type { DayData } from '@/hooks/useProfileStats';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

interface Props {
  data: DayData[];
  restDays?: Set<string>;
  selectedYear: number;
  selectedMonth: number;
  canGoPrev: boolean;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  exerciseId?: string;
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

const REP_COLOR: Record<0 | 1 | 2 | 3, string> = {
  0: '',
  1: 'text-violet-300',
  2: 'text-white',
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

export function MonthCalendar({ data, restDays, selectedYear, selectedMonth, canGoPrev, canGoNext, onPrev, onNext, exerciseId }: Props) {
  const [selected, setSelected] = useState<DayData | null>(null);
  const [daySets, setDaySets] = useState<number[]>([]);
  const [setsLoading, setSetsLoading] = useState(false);
  const { user } = useAuth();
  const detailRef = useRef<HTMLDivElement>(null);

  // Nach Auswahl: scrollen so dass Detail-Block über der fixen Bottom Nav liegt
  useEffect(() => {
    if (!selected) return;
    const id = setTimeout(() => {
      if (!detailRef.current) return;
      const rect = detailRef.current.getBoundingClientRect();
      const bottomNavHeight = 90; // Höhe Bottom Nav inkl. Safe Area
      const padding = 16;
      const hiddenBy = rect.bottom - (window.innerHeight - bottomNavHeight - padding);
      if (hiddenBy > 0) {
        window.scrollBy({ top: hiddenBy, behavior: 'smooth' });
      }
    }, 150);
    return () => clearTimeout(id);
  }, [selected]);

  // Beim Wechsel des ausgewählten Tages: Sätze laden
  useEffect(() => {
    if (!selected || selected.amount === 0 || !exerciseId || !user) {
      setDaySets([]);
      return;
    }
    setSetsLoading(true);
    const start = selected.date + 'T00:00:00+02:00'; // Europe/Berlin CEST
    const end   = selected.date + 'T23:59:59+02:00';
    void (async () => {
      try {
        const { data: rows } = await supabase
          .from('workout_entries')
          .select('amount, performed_at')
          .eq('user_id', user.id)
          .eq('exercise_id', exerciseId)
          .gte('performed_at', new Date(start).toISOString())
          .lte('performed_at', new Date(end).toISOString())
          .order('performed_at', { ascending: true });
        setDaySets((rows ?? []).map((r) => r.amount));
      } catch {
        // ignore
      } finally {
        setSetsLoading(false);
      }
    })();
  }, [selected, exerciseId, user]);

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
        <button onClick={onPrev} disabled={!canGoPrev}
          className="rounded-full p-1.5 text-slate-400 transition hover:bg-ink-700 hover:text-slate-200 disabled:opacity-25"
          aria-label="Vorheriger Monat">
          <ChevronLeft />
        </button>
        <span className="text-sm font-semibold text-slate-200">{monthLabel}</span>
        <button onClick={onNext} disabled={!canGoNext}
          className="rounded-full p-1.5 text-slate-400 transition hover:bg-ink-700 hover:text-slate-200 disabled:opacity-25"
          aria-label="Nächster Monat">
          <ChevronRight />
        </button>
      </div>

      {/* Wochentag-Header */}
      <div className="mb-1 mt-4 grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="text-center text-xs font-medium uppercase tracking-wide text-slate-500">{d}</div>
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
          const isRestDay = amount === 0 && (restDays?.has(dateStr) ?? false);
          const isToday = dateStr === todayStr;
          const isSelected = selected?.date === dateStr;

          return (
            <button
              key={dateStr}
              onClick={() => setSelected(isSelected ? null : (entry ?? { date: dateStr, amount: 0, sessions: 0 }))}
              className={`
                relative flex aspect-square flex-col items-start justify-between rounded-lg p-1 transition-all
                ${isRestDay ? 'bg-sky-900/60' : CELL_BG[level]}
                ${isToday ? 'ring-2 ring-brand-400 ring-offset-1 ring-offset-ink-900' : ''}
                ${isSelected ? 'ring-2 ring-brand-400/70 ring-offset-1 ring-offset-ink-950 scale-105 shadow-md shadow-brand-900/40' : 'hover:scale-105'}
              `}
            >
              {/* Datum – oben links */}
              <span className={`text-[13px] font-semibold leading-none ${isToday ? 'text-brand-300' : level === 0 ? 'text-slate-600' : 'text-white/60'}`}>
                {day}
              </span>
              {/* Ruhetag-Icon oder Liegestützen-Zahl */}
              {isRestDay ? (
                <span className="self-end text-[12px] leading-none">😴</span>
              ) : (
                <span className={`self-end text-[10px] font-extrabold leading-none ${amount > 0 ? REP_COLOR[level] : 'text-transparent select-none'}`}>
                  {amount > 0 ? amount : '0'}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Legende */}
      <div className="mt-2.5 flex items-center justify-end gap-1">
        <span className="text-[9px] text-slate-700">Weniger</span>
        {([0, 1, 2, 3] as const).map((l) => (
          <div key={l} className={`h-2.5 w-2.5 rounded-sm ${CELL_BG[l]}`} />
        ))}
        <span className="text-[9px] text-slate-700">Mehr</span>
      </div>

      {/* Detailinfo */}
      {selected && (
        <div ref={detailRef} className="animate-pop-in mt-3 rounded-xl border border-brand-500/20 bg-ink-800/60 px-4 py-3">
          {/* Kopfzeile */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">
              {new Date(selected.date + 'T00:00:00Z').toLocaleDateString('de-DE', {
                weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
              })}
            </p>
            {selected.amount === 0 && (restDays?.has(selected.date) ?? false) ? (
              <span className="text-xs text-sky-400">😴 Eingetragener Ruhetag</span>
            ) : selected.amount === 0 ? (
              <span className="text-xs text-slate-500">Kein Training</span>
            ) : (
              <span className="text-sm font-bold text-brand-300">
                {selected.amount} gesamt
              </span>
            )}
          </div>

          {/* Satz-Chips */}
          {selected.amount > 0 && (
            <div className="mt-3">
              {setsLoading ? (
                <p className="text-xs text-slate-500">Lade …</p>
              ) : daySets.length > 0 ? (
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${Math.min(daySets.length, 5)}, 1fr)` }}
                >
                  {daySets.map((amount, i) => (
                    <div
                      key={i}
                      className="flex flex-col items-center rounded-xl bg-ink-700 px-2 py-1.5 text-center"
                    >
                      <span className="text-[10px] text-slate-500">Satz {i + 1}</span>
                      <span className="text-base font-extrabold text-brand-300">{amount}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
