import type { Exercise, MyStatisticsSummary } from '@/lib/database.types';

interface RecordRow {
  icon: string;
  label: string;
  value: string;
  date: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function StatisticsRecords({ summary, exercise }: { summary: MyStatisticsSummary; exercise: Exercise }) {
  const unit = exercise.unit === 'reps' ? 'Wdh.' : exercise.unit;

  const records: RecordRow[] = [
    {
      icon: '💥', label: 'Bester Satz',
      value: summary.best_set_amount > 0 ? `${summary.best_set_amount} ${unit}` : '–',
      date: summary.best_set_date,
    },
    {
      icon: '🏆', label: `Meiste ${unit} an einem Tag`,
      value: summary.best_day_amount > 0 ? `${summary.best_day_amount.toLocaleString('de-DE')} ${unit}` : '–',
      date: summary.best_day_date,
    },
    {
      icon: '🔢', label: 'Meiste Sätze an einem Tag',
      value: summary.most_sets_in_day > 0 ? `${summary.most_sets_in_day} Sätze` : '–',
      date: summary.most_sets_day_date,
    },
    {
      icon: '📐', label: 'Höchster Tagesdurchschnitt',
      value: summary.best_avg_per_day > 0 ? `${summary.best_avg_per_day.toLocaleString('de-DE')} ${unit}/Satz` : '–',
      date: summary.best_avg_per_day_date,
    },
    {
      icon: '🔥', label: 'Längste Streak',
      value: summary.longest_streak > 0 ? `${summary.longest_streak} ${summary.longest_streak === 1 ? 'Tag' : 'Tage'}` : '–',
      date: null,
    },
  ];

  return (
    <div className="space-y-2.5">
      {records.map((r) => (
        <div
          key={r.label}
          className="flex items-center gap-3 rounded-2xl border border-ink-700 bg-ink-800/70 px-4 py-3.5 shadow-lg backdrop-blur"
        >
          <span className="shrink-0 text-2xl leading-none">{r.icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{r.label}</p>
            <p className="mt-0.5 text-base font-extrabold leading-tight text-slate-100">{r.value}</p>
          </div>
          {r.date && (
            <span className="shrink-0 text-right text-[10px] leading-tight text-slate-500">
              {formatDate(r.date)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
