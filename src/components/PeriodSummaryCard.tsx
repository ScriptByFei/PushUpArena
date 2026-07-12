import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import type { Exercise } from '@/lib/database.types';

// ─── Helpers ────────────────────────────────────────────────────────
function berlinToUTC(dateStr: string, endOfDay = false): string {
  const month = parseInt(dateStr.split('-')[1]);
  const offset = month >= 4 && month <= 10 ? '+02:00' : '+01:00';
  const time = endOfDay ? '23:59:59' : '00:00:00';
  return new Date(`${dateStr}T${time}${offset}`).toISOString();
}

function getISOWeek(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const w1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

function getISOWeekYear(d: Date): number {
  const date = new Date(d);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  return date.getFullYear();
}

function getWeeksInYear(year: number): number {
  return getISOWeek(new Date(year, 11, 28));
}

function getMondayOfISOWeek(week: number, year: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = (jan4.getDay() + 6) % 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + (week - 1) * 7);
  return monday;
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function toBerlinDateStr(d: Date): string {
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
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

// ─── Types ──────────────────────────────────────────────────────────
type PeriodTab = 'week' | 'month' | 'year' | 'custom';

interface PeriodStats {
  total: number;
  trainingDays: number;
  avgPerDay: number;
  bestDay: { date: string; amount: number } | null;
}

const TABS: { key: PeriodTab; label: string }[] = [
  { key: 'week',   label: 'Woche'  },
  { key: 'month',  label: 'Monat'  },
  { key: 'year',   label: 'Jahr'   },
  { key: 'custom', label: 'Eigener' },
];

interface Props {
  exercise: Exercise | null;
}

// ─── Component ──────────────────────────────────────────────────────
export function PeriodSummaryCard({ exercise }: Props) {
  const { user } = useAuth();
  const now = new Date();
  const todayStr = toBerlinDateStr(now);

  const [periodTab, setPeriodTab] = useState<PeriodTab>('week');
  const [pYear, setPYear]         = useState(now.getFullYear());
  const [pMonth, setPMonth]       = useState(now.getMonth());
  const [pWeek, setPWeek]         = useState(() => getISOWeek(now));
  const [pWeekYear, setPWeekYear] = useState(() => getISOWeekYear(now));
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo]     = useState('');
  const [periodStats, setPeriodStats] = useState<PeriodStats | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);

  const maxYear  = now.getFullYear();
  const maxMonth = now.getMonth();

  // ── Navigation ──────────────────────────────────────────────────
  function prevMonth() {
    if (pMonth === 0) { setPYear((y) => y - 1); setPMonth(11); }
    else setPMonth((m) => m - 1);
  }
  function nextMonth() {
    if (pYear >= maxYear && pMonth >= maxMonth) return;
    if (pMonth === 11) { setPYear((y) => y + 1); setPMonth(0); }
    else setPMonth((m) => m + 1);
  }
  function prevWeek() {
    if (pWeek === 1) { const py = pWeekYear - 1; setPWeekYear(py); setPWeek(getWeeksInYear(py)); }
    else setPWeek((w) => w - 1);
  }
  function nextWeek() {
    const nextW = pWeek === getWeeksInYear(pWeekYear) ? 1 : pWeek + 1;
    const nextY = pWeek === getWeeksInYear(pWeekYear) ? pWeekYear + 1 : pWeekYear;
    if (toBerlinDateStr(getMondayOfISOWeek(nextW, nextY)) > todayStr) return;
    if (pWeek === getWeeksInYear(pWeekYear)) { setPWeekYear((y) => y + 1); setPWeek(1); }
    else setPWeek((w) => w + 1);
  }
  function prevYear() { if (pYear > 2020) setPYear((y) => y - 1); }
  function nextYear() { if (pYear < maxYear) setPYear((y) => y + 1); }

  // ── Data fetching ───────────────────────────────────────────────
  useEffect(() => {
    if (!exercise?.id || !user) return;

    let start: string, end: string;

    if (periodTab === 'month') {
      const firstDay = `${pYear}-${String(pMonth + 1).padStart(2, '0')}-01`;
      const last = new Date(pYear, pMonth + 1, 0);
      start = berlinToUTC(firstDay);
      end   = berlinToUTC(toDateStr(last), true);
    } else if (periodTab === 'week') {
      const monday = getMondayOfISOWeek(pWeek, pWeekYear);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      start = berlinToUTC(toBerlinDateStr(monday));
      end   = berlinToUTC(toBerlinDateStr(sunday), true);
    } else if (periodTab === 'year') {
      start = berlinToUTC(`${pYear}-01-01`);
      end   = pYear < maxYear ? berlinToUTC(`${pYear}-12-31`, true) : berlinToUTC(todayStr, true);
    } else {
      if (!customFrom || !customTo || customFrom > customTo) {
        setPeriodStats(null);
        setPeriodLoading(false);
        return;
      }
      start = berlinToUTC(customFrom);
      end   = berlinToUTC(customTo, true);
    }

    setPeriodLoading(true);
    void (async () => {
      const { data } = await supabase
        .from('workout_entries')
        .select('amount, performed_at')
        .eq('user_id', user.id)
        .eq('exercise_id', exercise.id)
        .gte('performed_at', start)
        .lte('performed_at', end);

      // Aggregate by Berlin date
      const byDate = new Map<string, number>();
      for (const row of data ?? []) {
        const dateStr = new Date(row.performed_at as string).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
        byDate.set(dateStr, (byDate.get(dateStr) ?? 0) + (row.amount as number));
      }

      const total        = Array.from(byDate.values()).reduce((s, v) => s + v, 0);
      const trainingDays = byDate.size;
      const avgPerDay    = trainingDays > 0 ? Math.round(total / trainingDays) : 0;
      const bestEntry    = Array.from(byDate.entries()).reduce<[string, number] | null>(
        (best, entry) => (!best || entry[1] > best[1] ? entry : best), null
      );
      const bestDay = bestEntry ? { date: bestEntry[0], amount: bestEntry[1] } : null;

      setPeriodStats({ total, trainingDays, avgPerDay, bestDay });
      setPeriodLoading(false);
    })();
  }, [periodTab, pYear, pMonth, pWeek, pWeekYear, customFrom, customTo, exercise?.id, user]);

  // ── Labels ──────────────────────────────────────────────────────
  const activeTabIdx = Math.max(0, TABS.findIndex((t) => t.key === periodTab));

  const monthLabel = new Date(pYear, pMonth, 1).toLocaleDateString('de-DE', {
    month: 'long', year: 'numeric',
  });

  const weekMonday = getMondayOfISOWeek(pWeek, pWeekYear);
  const weekSunday = new Date(weekMonday);
  weekSunday.setDate(weekMonday.getDate() + 6);
  const weekLabel = `KW ${pWeek} · ${weekMonday.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${weekSunday.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}`;

  const exercisePlural = exercise?.name
    ? exercise.name.endsWith('s') ? exercise.name : exercise.name + 's'
    : '';

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-800/70 px-4 py-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        Zeitraum · {exercise?.name}
      </p>

      {/* Apple Segmented Control — 4 Tabs */}
      <div className="relative flex h-[40px] items-center rounded-xl border border-ink-700/60 bg-ink-950/60 p-1">
        <div
          className="pointer-events-none absolute inset-y-1 rounded-[8px] bg-brand-600 shadow-sm transition-all duration-200 ease-out"
          style={{
            width: 'calc((100% - 8px) / 4)',
            left: `calc(4px + ${activeTabIdx} * (100% - 8px) / 4)`,
          }}
        />
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setPeriodTab(t.key)}
            className={`relative z-10 flex-1 text-[12px] font-semibold transition-colors duration-150 ${
              periodTab === t.key ? 'text-white' : 'text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Period navigation */}
      {periodTab === 'week' && (
        <div className="mt-2.5 flex items-center justify-between">
          <button onClick={prevWeek} className="rounded-full p-1 text-slate-400 hover:bg-ink-700 hover:text-slate-200 transition">
            <ChevronLeft />
          </button>
          <span className="text-center text-xs font-semibold text-slate-200 leading-tight">{weekLabel}</span>
          <button
            onClick={nextWeek}
            disabled={(() => {
              const nw = pWeek === getWeeksInYear(pWeekYear) ? 1 : pWeek + 1;
              const ny = pWeek === getWeeksInYear(pWeekYear) ? pWeekYear + 1 : pWeekYear;
              return toBerlinDateStr(getMondayOfISOWeek(nw, ny)) > todayStr;
            })()}
            className="rounded-full p-1 text-slate-400 hover:bg-ink-700 hover:text-slate-200 transition disabled:opacity-25"
          >
            <ChevronRight />
          </button>
        </div>
      )}

      {periodTab === 'month' && (
        <div className="mt-2.5 flex items-center justify-between">
          <button onClick={prevMonth} className="rounded-full p-1 text-slate-400 hover:bg-ink-700 hover:text-slate-200 transition">
            <ChevronLeft />
          </button>
          <span className="text-sm font-semibold text-slate-200">{monthLabel}</span>
          <button
            onClick={nextMonth}
            disabled={pYear === maxYear && pMonth >= maxMonth}
            className="rounded-full p-1 text-slate-400 hover:bg-ink-700 hover:text-slate-200 transition disabled:opacity-25"
          >
            <ChevronRight />
          </button>
        </div>
      )}

      {periodTab === 'year' && (
        <div className="mt-2.5 flex items-center justify-between">
          <button onClick={prevYear} disabled={pYear <= 2020}
            className="rounded-full p-1 text-slate-400 hover:bg-ink-700 hover:text-slate-200 transition disabled:opacity-25">
            <ChevronLeft />
          </button>
          <span className="text-sm font-semibold text-slate-200">{pYear}</span>
          <button onClick={nextYear} disabled={pYear >= maxYear}
            className="rounded-full p-1 text-slate-400 hover:bg-ink-700 hover:text-slate-200 transition disabled:opacity-25">
            <ChevronRight />
          </button>
        </div>
      )}

      {periodTab === 'custom' && (
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Von</label>
            <input
              type="date"
              value={customFrom}
              max={customTo || todayStr}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-full rounded-xl border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Bis</label>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              max={todayStr}
              onChange={(e) => setCustomTo(e.target.value)}
              className="w-full rounded-xl border border-ink-600 bg-ink-800 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="mt-3 rounded-xl bg-ink-900/80 py-3 text-center">
        {periodLoading ? (
          <p className="text-sm text-slate-500">Lade …</p>
        ) : periodStats === null ? (
          <p className="text-sm text-slate-500">Zeitraum wählen</p>
        ) : (
          <>
            <p className="text-4xl font-extrabold text-brand-300">
              {periodStats.total.toLocaleString('de-DE')}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {exercisePlural} in diesem Zeitraum
            </p>
            {periodStats.total > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-1 border-t border-ink-700/60 pt-3">
                <div className="text-center">
                  <p className="text-[17px] font-extrabold leading-none text-slate-100">
                    {periodStats.avgPerDay.toLocaleString('de-DE')}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">Ø / Tag</p>
                </div>
                <div className="border-x border-ink-700/60 text-center">
                  <p className="text-[17px] font-extrabold leading-none text-slate-100">
                    {periodStats.bestDay?.amount.toLocaleString('de-DE') ?? '–'}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">Bester Tag</p>
                </div>
                <div className="text-center">
                  <p className="text-[17px] font-extrabold leading-none text-slate-100">
                    {periodStats.trainingDays}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">Trainingstage</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
