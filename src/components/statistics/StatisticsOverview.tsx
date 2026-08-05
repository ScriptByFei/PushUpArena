import type { Exercise, MyStatisticsSummary } from '@/lib/database.types';

interface StatTile {
  icon: string;
  label: string;
  value: string;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function StatisticsOverview({ summary, exercise }: { summary: MyStatisticsSummary; exercise: Exercise }) {
  const unit = exercise.unit === 'reps' ? 'Wdh.' : exercise.unit;

  const tiles: StatTile[] = [
    { icon: '💪', label: `Gesamt ${unit}`, value: summary.total_amount.toLocaleString('de-DE') },
    { icon: '📋', label: 'Gesamt-Sätze', value: summary.total_sets.toLocaleString('de-DE') },
    { icon: '📅', label: 'Aktive Trainingstage', value: summary.training_days.toLocaleString('de-DE') },
    { icon: '🔥', label: 'Aktuelle Streak', value: `${summary.current_streak} ${summary.current_streak === 1 ? 'Tag' : 'Tage'}` },
    { icon: '🏔️', label: 'Längste Streak', value: `${summary.longest_streak} ${summary.longest_streak === 1 ? 'Tag' : 'Tage'}` },
    { icon: '📊', label: `Ø ${unit}/Satz`, value: summary.avg_per_set.toLocaleString('de-DE') },
    { icon: '📈', label: `Ø ${unit}/Training`, value: summary.avg_per_training.toLocaleString('de-DE') },
    {
      icon: '⭐',
      label: 'Beste Tagesleistung',
      value: summary.best_day_amount > 0
        ? `${summary.best_day_amount.toLocaleString('de-DE')} · ${formatDate(summary.best_day_date)}`
        : '–',
    },
    { icon: '🏋️', label: 'Gesamttrainings', value: summary.training_days.toLocaleString('de-DE') },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex flex-col items-center justify-center rounded-2xl border border-ink-700 bg-ink-800/70 px-3 py-4 text-center shadow-lg backdrop-blur"
        >
          <span className="text-xl leading-none">{tile.icon}</span>
          <span className="mt-2 tabular-nums text-lg font-extrabold leading-none text-slate-100">
            {tile.value}
          </span>
          <span className="mt-1.5 text-[10px] leading-tight text-slate-500">{tile.label}</span>
        </div>
      ))}
    </div>
  );
}
