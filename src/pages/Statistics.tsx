import { useState } from 'react';
import { useExercise } from '@/context/ExerciseContext';
import { useStatisticsSummary } from '@/hooks/useStatisticsSummary';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { StatisticsOverview } from '@/components/statistics/StatisticsOverview';
import { StatisticsCharts } from '@/components/statistics/StatisticsCharts';
import { StatisticsRecords } from '@/components/statistics/StatisticsRecords';
import { StatisticsAchievements } from '@/components/statistics/StatisticsAchievements';

type StatsTab = 'overview' | 'charts' | 'records' | 'achievements';

const TABS: { key: StatsTab; label: string }[] = [
  { key: 'overview',     label: 'Übersicht'  },
  { key: 'charts',       label: 'Diagramme'  },
  { key: 'records',      label: 'Rekorde'    },
  { key: 'achievements', label: 'Erfolge'    },
];

export default function Statistics() {
  const { exercise, loading: exLoading, error: exError, reload } = useExercise();
  const { stats: summary, loading: summaryLoading, error: summaryError, refetch } = useStatisticsSummary(exercise?.id);
  const [tab, setTab] = useState<StatsTab>('overview');

  const activeTabIdx = TABS.findIndex((t) => t.key === tab);

  if (exLoading) return <LoadingState label="Lade Statistik …" />;
  if (exError || !exercise) return <ErrorState message={exError ?? 'Übung fehlt.'} onRetry={reload} />;

  return (
    <div className="space-y-3.5 pb-8">
      {/* ── Seitentitel ─────────────────────────────────── */}
      <div className="pb-1 pt-1 text-center">
        <h1 className="text-lg font-extrabold text-slate-100">Statistik</h1>
        <p className="mt-0.5 text-[10px] text-slate-600">{exercise.name} · deine Leistungszentrale</p>
      </div>

      {/* ── Tabs — Apple Segmented Control, 4-teilig ──────── */}
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
            onClick={() => setTab(t.key)}
            className={`relative z-10 flex-1 text-[12px] font-semibold transition-colors duration-150 ${
              tab === t.key ? 'text-white' : 'text-slate-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab-Inhalt ──────────────────────────────────── */}
      {tab === 'overview' && (
        summaryLoading ? <LoadingState label="Lade Kennzahlen …" />
        : summaryError ? <ErrorState message={summaryError} onRetry={refetch} />
        : <StatisticsOverview summary={summary} exercise={exercise} />
      )}

      {tab === 'charts' && <StatisticsCharts />}

      {tab === 'records' && (
        summaryLoading ? <LoadingState label="Lade Rekorde …" />
        : summaryError ? <ErrorState message={summaryError} onRetry={refetch} />
        : <StatisticsRecords summary={summary} exercise={exercise} />
      )}

      {tab === 'achievements' && <StatisticsAchievements />}
    </div>
  );
}
