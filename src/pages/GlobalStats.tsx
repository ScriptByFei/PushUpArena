import { useGlobalStats } from '@/hooks/useGlobalStats';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { Card, CardTitle } from '@/components/ui/Card';

function StatRow({ icon, label, value, sub }: { icon: string; label: string; value: number; sub?: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-ink-800/70 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{icon}</span>
        <div>
          <span className="text-sm font-medium text-slate-300">{label}</span>
          {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
      </div>
      <span className="tabular-nums text-lg font-extrabold text-brand-300">
        {value.toLocaleString('de-DE')}
      </span>
    </div>
  );
}

export default function GlobalStats() {
  const { stats, loading, error } = useGlobalStats();

  if (loading) return <LoadingState label="Lade globale Statistik …" />;
  if (error || !stats) return <ErrorState message={error ?? 'Fehler beim Laden.'} />;

  const totalReps = stats.total_pushups + stats.total_pullups + stats.total_dips;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center py-4">
        <h1 className="text-xl font-extrabold text-slate-100">Globale Statistik</h1>
        <p className="mt-1 text-xs text-slate-500">Alle Members zusammen</p>
      </div>

      {/* Community */}
      <Card>
        <CardTitle>Community</CardTitle>
        <div className="mt-3 space-y-2">
          <StatRow icon="👥" label="Members gesamt" value={stats.total_members} />
          <StatRow
            icon="🔥"
            label="Aktive Members"
            value={stats.active_members}
            sub="haben in den letzten 7 Tagen trainiert"
          />
        </div>
      </Card>

      {/* Gesamte Wiederholungen */}
      <Card>
        <CardTitle>Gesamte Wiederholungen</CardTitle>
        <div className="mt-3 space-y-2">
          <StatRow icon="💪" label="PushUps" value={stats.total_pushups} />
          <StatRow icon="🏋️" label="PullUps" value={stats.total_pullups} />
          <StatRow icon="⬇️" label="Dips"    value={stats.total_dips} />
        </div>
        {/* Summe */}
        <div className="mt-3 flex items-center justify-between border-t border-ink-700 pt-3">
          <span className="text-sm font-semibold text-slate-400">Gesamt</span>
          <span className="tabular-nums text-xl font-extrabold text-amber-300">
            {totalReps.toLocaleString('de-DE')}
          </span>
        </div>
      </Card>
    </div>
  );
}
