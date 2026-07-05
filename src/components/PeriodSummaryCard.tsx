import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Card, CardTitle } from '@/components/ui/Card';
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

// ─── Component ──────────────────────────────────────────────────────
interface Props {
  exercise: Exercise | null;
}

type PeriodTab = 'month' | 'week' | 'custom';

export function PeriodSummaryCard({ exercise }: Props) {
  const { user } = useAuth();
  const now = new Date();
  const todayStr = toDateStr(now);

  const [periodTab, setPeriodTab] = useState<PeriodTab>('month');
  const [pYear, setPYear] = useState(now.getFullYear());
  const [pMonth, setPMonth] = useState(now.getMonth());
  const [pWeek, setPWeek] = useState(() => getISOWeek(now));
  const [pWeekYear, setPWeekYear] = useState(() => getISOWeekYear(now));
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [periodTotal, setPeriodTotal] = useState<number | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);

  const maxMonth = now.getMonth();
  const maxYear = now.getFullYear();

  function prevMonth() {
    if (pMonth === 0) { setPYear((y) => y - 1); setPMonth(11); }
    else setPMonth((m) => m - 1);
  }
  function nextMonth() {
    if (pYear > maxYear || (pYear === maxYear && pMonth >= maxMonth)) return;
    if (pMonth === 11) { setPYear((y) => y + 1); setPMonth(0); }
    else setPMonth((m) => m + 1);
  }
  function prevWeek() {
    if (pWeek === 1) { const py = pWeekYear - 1; setPWeekYear(py); setPWeek(getWeeksInYear(py)); }
    else setPWeek((w) => w - 1);
  }
  function nextWeek() {
    const monday = getMondayOfISOWeek(pWeek, pWeekYear);
    if (toDateStr(monday) >= todayStr) return;
    if (pWeek === getWeeksInYear(pWeekYear)) { setPWeekYear((y) => y + 1); setPWeek(1); }
    else setPWeek((w) => w + 1);
  }

  useEffect(() => {
    if (!exercise?.id || !user) return;
    let start: string, end: string;

    if (periodTab === 'month') {
      const firstDay = `${pYear}-${String(pMonth + 1).padStart(2, '0')}-01`;
      const last = new Date(pYear, pMonth + 1, 0);
      start = berlinToUTC(firstDay);
      end = berlinToUTC(toDateStr(last), true);
    } else if (periodTab === 'week') {
      const monday = getMondayOfISOWeek(pWeek, pWeekYear);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      start = berlinToUTC(toDateStr(monday));
      end = berlinToUTC(toDateStr(sunday), true);
    } else {
      if (!customFrom || !customTo || customFrom > customTo) return;
      start = berlinToUTC(customFrom);
      end = berlinToUTC(customTo, true);
    }

    setPeriodLoading(true);
    void (async () => {
      const { data } = await supabase
        .from('workout_entries')
        .select('amount')
        .eq('user_id', user.id)
        .eq('exercise_id', exercise.id)
        .gte('performed_at', start)
        .lte('performed_at', end);
      setPeriodTotal((data ?? []).reduce((s, r) => s + r.amount, 0));
      setPeriodLoading(false);
    })();
  }, [periodTab, pYear, pMonth, pWeek, pWeekYear, customFrom, customTo, exercise?.id, user]);

  const monthLabel = new Date(pYear, pMonth, 1).toLocaleDateString('de-DE', {
    month: 'long', year: 'numeric',
  });
  const weekMonday = getMondayOfISOWeek(pWeek, pWeekYear);
  const weekSunday = new Date(weekMonday);
  weekSunday.setDate(weekMonday.getDate() + 6);
  const weekLabel = `KW ${pWeek} · ${weekMonday.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${weekSunday.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
  const exercisePlural = exercise?.name
    ? exercise.name.endsWith('s') ? exercise.name : exercise.name + 's'
    : '';

  return (
    <Card>
      <CardTitle>Zeitraum · {exercise?.name}</CardTitle>

      {/* Tabs */}
      <div className="mt-3 flex w-full rounded-xl bg-ink-950/60 p-1">
        {(['month', 'week', 'custom'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setPeriodTab(t)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
              periodTab === t ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {t === 'month' ? 'Monat' : t === 'week' ? 'KW' : 'Zeitraum'}
          </button>
        ))}
      </div>

      {/* Monat-Navigation */}
      {periodTab === 'month' && (
        <div className="mt-3 flex items-center justify-between">
          <button onClick={prevMonth} className="rounded-full p-1.5 text-slate-400 hover:bg-ink-700 hover:text-slate-200 transition">
            <ChevronLeft />
          </button>
          <span className="text-sm font-semibold text-slate-200">{monthLabel}</span>
          <button
            onClick={nextMonth}
            disabled={pYear === maxYear && pMonth >= maxMonth}
            className="rounded-full p-1.5 text-slate-400 hover:bg-ink-700 hover:text-slate-200 transition disabled:opacity-25"
          >
            <ChevronRight />
          </button>
        </div>
      )}

      {/* KW-Navigation */}
      {periodTab === 'week' && (
        <div className="mt-3 flex items-center justify-between">
          <button onClick={prevWeek} className="rounded-full p-1.5 text-slate-400 hover:bg-ink-700 hover:text-slate-200 transition">
            <ChevronLeft />
          </button>
          <span className="text-center text-sm font-semibold text-slate-200 leading-tight">{weekLabel}</span>
          <button
            onClick={nextWeek}
            disabled={toDateStr(weekMonday) >= todayStr}
            className="rounded-full p-1.5 text-slate-400 hover:bg-ink-700 hover:text-slate-200 transition disabled:opacity-25"
          >
            <ChevronRight />
          </button>
        </div>
      )}

      {/* Zeitraum-Picker */}
      {periodTab === 'custom' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-slate-400">Von</label>
            <input
              type="date"
              value={customFrom}
              max={customTo || todayStr}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="w-full rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
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
              className="w-full rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
        </div>
      )}

      {/* Ergebnis */}
      <div className="mt-4 rounded-xl bg-ink-900 py-5 text-center">
        {periodLoading ? (
          <p className="text-sm text-slate-500">Lade …</p>
        ) : periodTotal === null ? (
          <p className="text-sm text-slate-500">Zeitraum wählen</p>
        ) : (
          <>
            <p className="text-5xl font-extrabold text-brand-300">
              {periodTotal.toLocaleString('de-DE')}
            </p>
            <p className="mt-1 text-xs text-slate-500">{exercisePlural} in diesem Zeitraum</p>
          </>
        )}
      </div>
    </Card>
  );
}
