import { useMemo, useRef, useState } from 'react';
import { useWorkouts } from '@/hooks/useWorkouts';
import { useRestDays } from '@/hooks/useRestDays';
import { useStats } from '@/hooks/useStats';
import { useToast } from '@/context/ToastContext';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { DateTimeInput } from '@/components/ui/DateTimeInput';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { CalendarIcon, EditIcon, TrashIcon } from '@/components/ui/icons';
import { formatRelativeDay, formatTime, toDateTimeLocalValue } from '@/lib/date';
import type { WorkoutEntry } from '@/lib/database.types';

const TZ = 'Europe/Berlin';
function berlinToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}
function minEntryDatetime() {
  const [y, m, d] = berlinToday().split('-').map(Number);
  const twoDaysAgo = new Date(y, m - 1, d - 2);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${twoDaysAgo.getFullYear()}-${pad(twoDaysAgo.getMonth() + 1)}-${pad(twoDaysAgo.getDate())}T00:00`;
}

interface Props {
  exerciseId: string | undefined;
  unit: string;
}

type Period = 'all' | 'today' | 'week' | 'month';
type SortDir = 'desc' | 'asc';

export function WorkoutHistory({ exerciseId, unit }: Props) {
  const { entries, loading, error, refetch, updateEntry, deleteEntry } = useWorkouts(exerciseId);
  const { restDays, loading: rdLoading, refetch: refetchRD, deleteRestDay } = useRestDays(exerciseId);
  const { refetch: refetchStats } = useStats(exerciseId);
  const toast = useToast();

  const [period, setPeriod] = useState<Period>('all');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const [editing, setEditing] = useState<WorkoutEntry | null>(null);
  const [deleting, setDeleting] = useState<WorkoutEntry | null>(null);
  const [deletingRD, setDeletingRD] = useState<{ id: string; rest_date: string } | null>(null);

  type ListItem =
    | { kind: 'workout'; entry: WorkoutEntry; sortKey: number }
    | { kind: 'rest'; id: string; rest_date: string; sortKey: number };

  const mergedList = useMemo<ListItem[]>(() => {
    const today = berlinToday();
    const [y, m, d] = today.split('-').map(Number);
    const tmpDate = new Date(y, m - 1, d);
    const dow = (tmpDate.getDay() + 6) % 7;
    const monDate = new Date(y, m - 1, d - dow);
    const pad = (n: number) => String(n).padStart(2, '0');
    const monday = `${monDate.getFullYear()}-${pad(monDate.getMonth() + 1)}-${pad(monDate.getDate())}`;
    const firstOfMonth = `${y}-${pad(m)}-01`;

    const items: ListItem[] = [];

    for (const entry of entries) {
      const eBerlin = new Date(entry.performed_at).toLocaleDateString('sv-SE', { timeZone: TZ });
      if (dateFilter && eBerlin !== dateFilter) continue;
      if (!dateFilter) {
        if (period === 'today' && eBerlin !== today) continue;
        if (period === 'week' && eBerlin < monday) continue;
        if (period === 'month' && eBerlin < firstOfMonth) continue;
      }
      items.push({ kind: 'workout', entry, sortKey: new Date(entry.performed_at).getTime() });
    }

    for (const rd of restDays) {
      if (dateFilter && rd.rest_date !== dateFilter) continue;
      if (!dateFilter) {
        if (period === 'today' && rd.rest_date !== today) continue;
        if (period === 'week' && rd.rest_date < monday) continue;
        if (period === 'month' && rd.rest_date < firstOfMonth) continue;
      }
      const [ry, rm, rd2] = rd.rest_date.split('-').map(Number);
      items.push({ kind: 'rest', id: rd.id, rest_date: rd.rest_date, sortKey: new Date(ry, rm - 1, rd2, 12).getTime() });
    }

    items.sort((a, b) => sortDir === 'desc' ? b.sortKey - a.sortKey : a.sortKey - b.sortKey);
    return items;
  }, [entries, restDays, period, sortDir, dateFilter]);

  return (
    <>
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Verlauf</CardTitle>
          <button
            onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-ink-700 hover:text-slate-200"
          >
            {sortDir === 'desc' ? '↓ Neueste' : '↑ Älteste'}
          </button>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          {(['all', 'today', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setDateFilter(null); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                period === p && !dateFilter
                  ? 'bg-brand-600 text-white'
                  : 'bg-ink-700 text-slate-400 hover:bg-ink-600 hover:text-slate-200'
              }`}
            >
              {p === 'all' ? 'Alle' : p === 'today' ? 'Heute' : p === 'week' ? 'Woche' : 'Monat'}
            </button>
          ))}
          <div className="relative ml-auto mr-4 flex items-center gap-1">
            {dateFilter && (
              <span className="flex items-center gap-1 rounded-full bg-brand-600/20 px-2 py-0.5 text-[10px] text-brand-300">
                {new Date(dateFilter + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                <button onClick={() => setDateFilter(null)} className="leading-none hover:text-white">×</button>
              </span>
            )}
            <div className="relative">
              <CalendarIcon className={`h-5 w-5 ${dateFilter ? 'text-brand-400' : 'text-slate-400'}`} />
              <input
                ref={dateInputRef} type="date"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={dateFilter ?? ''}
                max={berlinToday()}
                onChange={(e) => { setPeriod('all'); setDateFilter(e.target.value || null); }}
              />
            </div>
          </div>
        </div>

        <div className="mt-3">
          {loading || rdLoading ? (
            <LoadingState label="Lade Einträge …" />
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : mergedList.length === 0 ? (
            <EmptyState
              icon="📝"
              title={entries.length === 0 && restDays.length === 0 ? 'Noch keine Einträge' : 'Keine Einträge im Zeitraum'}
              description={entries.length === 0 && restDays.length === 0 ? 'Trage deinen ersten Satz ein.' : ''}
            />
          ) : (
            <ul className="divide-y divide-ink-700">
              {mergedList.map((item) =>
                item.kind === 'workout' ? (
                  <li key={`w-${item.entry.id}`} className="flex items-center gap-3 py-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600/20 text-base font-bold text-brand-200">
                      {item.entry.amount}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-200">
                        {formatRelativeDay(item.entry.performed_at)} · {formatTime(item.entry.performed_at)}
                      </p>
                    </div>
                    {new Date(item.entry.performed_at) >= new Date(minEntryDatetime()) && (
                      <button aria-label="Bearbeiten" onClick={() => setEditing(item.entry)}
                        className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-ink-700 hover:text-slate-200">
                        <EditIcon className="h-5 w-5" />
                      </button>
                    )}
                    <button aria-label="Löschen" onClick={() => setDeleting(item.entry)}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/20 hover:text-rose-300">
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </li>
                ) : (
                  <li key={`r-${item.id}`} className="flex items-center gap-3 py-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-700 text-xl">
                      😴
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-200">
                        {new Date(item.rest_date + 'T00:00:00').toLocaleDateString('de-DE', {
                          weekday: 'short', day: '2-digit', month: '2-digit',
                        })}
                      </p>
                      <p className="text-xs text-slate-500">Ruhetag</p>
                    </div>
                    <button aria-label="Ruhetag löschen" onClick={() => setDeletingRD({ id: item.id, rest_date: item.rest_date })}
                      className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/20 hover:text-rose-300">
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </li>
                )
              )}
            </ul>
          )}
        </div>
      </Card>

      {editing && (
        <EditModal
          entry={editing} unit={unit}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const { error: err } = await updateEntry(editing.id, patch);
            if (err) toast.error(err);
            else { toast.success('Eintrag aktualisiert.'); setEditing(null); void refetchStats(); }
          }}
        />
      )}

      <Modal open={!!deleting} title="Eintrag löschen?" confirmLabel="Löschen" confirmVariant="danger"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const { error: err } = await deleteEntry(deleting.id);
          if (err) toast.error(err);
          else { toast.success('Eintrag gelöscht.'); void refetchStats(); }
          setDeleting(null);
        }}>
        Dieser Eintrag ({deleting?.amount} {unit}) wird dauerhaft entfernt.
      </Modal>

      <Modal open={!!deletingRD} title="Ruhetag löschen?" confirmLabel="Löschen" confirmVariant="danger"
        onClose={() => setDeletingRD(null)}
        onConfirm={async () => {
          if (!deletingRD) return;
          await deleteRestDay(deletingRD.id);
          toast.success('Ruhetag gelöscht.');
          setDeletingRD(null);
          void refetchRD();
        }}>
        Ruhetag vom {deletingRD && new Date(deletingRD.rest_date + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} wird entfernt.
      </Modal>
    </>
  );
}

function EditModal({ entry, unit, onClose, onSave }: {
  entry: WorkoutEntry; unit: string;
  onClose: () => void;
  onSave: (patch: { amount: number; note: string | null; performed_at: string }) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(entry.amount));
  const [when, setWhen] = useState(toDateTimeLocalValue(new Date(entry.performed_at)));
  const [saving, setSaving] = useState(false);
  return (
    <Modal open title="Eintrag bearbeiten" confirmLabel="Speichern" loading={saving}
      onClose={onClose}
      onConfirm={async () => {
        const n = parseInt(amount, 10);
        if (!n || n <= 0) return;
        setSaving(true);
        await onSave({ amount: n, note: null, performed_at: new Date(when).toISOString() });
        setSaving(false);
      }}>
      <div className="space-y-3 text-left">
        <Field label={`Anzahl (${unit})`}>
          <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="text-center" />
        </Field>
        <Field label="Datum & Uhrzeit">
          <DateTimeInput value={when} onChange={setWhen} min={minEntryDatetime()} max={toDateTimeLocalValue()} />
        </Field>
      </div>
    </Modal>
  );
}

// Re-export Button for convenience (used in Track.tsx)
export { Button };
