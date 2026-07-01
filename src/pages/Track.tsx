import { FormEvent, useMemo, useState } from 'react';
import { useExercise } from '@/context/ExerciseContext';
import { useWorkouts } from '@/hooks/useWorkouts';
import { useWorkoutLogger } from '@/hooks/useWorkoutLogger';
import { useStats } from '@/hooks/useStats';
import { useToast } from '@/context/ToastContext';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { DateTimeInput } from '@/components/ui/DateTimeInput';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { EditIcon, TrashIcon } from '@/components/ui/icons';
import { formatRelativeDay, formatTime, toDateTimeLocalValue } from '@/lib/date';
import type { WorkoutEntry } from '@/lib/database.types';

export default function Track() {
  const { exercise, loading: exLoading, error: exError, reload } = useExercise();
  const unit = exercise?.unit === 'reps' ? 'Wdh.' : exercise?.unit ?? '';
  const { submit, submitting } = useWorkoutLogger(exercise?.id, unit);
  const { entries, loading, error, refetch, updateEntry, deleteEntry } = useWorkouts(exercise?.id);
  const { stats, refetch: refetchStats } = useStats(exercise?.id);
  const toast = useToast();

  const [amount, setAmount] = useState('');
  const [when, setWhen] = useState(toDateTimeLocalValue());

  const [editing, setEditing] = useState<WorkoutEntry | null>(null);
  const [deleting, setDeleting] = useState<WorkoutEntry | null>(null);

  type Period = 'all' | 'today' | 'week' | 'month';
  type SortDir = 'desc' | 'asc';
  const [period, setPeriod] = useState<Period>('all');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const filteredEntries = useMemo(() => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay() + (startOfDay.getDay() === 0 ? -6 : 1));
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const filtered = entries.filter((e) => {
      const d = new Date(e.performed_at);
      if (period === 'today') return d >= startOfDay;
      if (period === 'week') return d >= startOfWeek;
      if (period === 'month') return d >= startOfMonth;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const diff = new Date(a.performed_at).getTime() - new Date(b.performed_at).getTime();
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [entries, period, sortDir]);

  if (exLoading) return <LoadingState />;
  if (exError || !exercise) return <ErrorState message={exError ?? 'Übung fehlt.'} onRetry={reload} />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = parseInt(amount, 10);
    if (!n || n <= 0) {
      toast.error('Bitte eine gültige Anzahl eingeben.');
      return;
    }
    const { error: err } = await submit({
      amount: n,
      note: null,
      performedAt: when ? new Date(when).toISOString() : undefined,
    });
    if (!err) {
      setAmount('');
      setWhen(toDateTimeLocalValue());
      void refetch();
      void refetchStats();
    }
  }

  return (
    <div className="space-y-4">
      {/* Statistik */}
      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          { label: 'Heute', value: stats.today_amount },
          { label: 'Woche', value: stats.week_amount },
          { label: 'Gesamt', value: stats.total_amount },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-ink-700 bg-ink-800/70 p-3">
            <div className="text-xs uppercase tracking-wide text-slate-400">{s.label}</div>
            <div className="mt-0.5 text-xl font-extrabold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Eingabeformular */}
      <Card>
        <CardTitle>{exercise.name} eintragen</CardTitle>
        <form onSubmit={onSubmit} className="mt-3 space-y-3">
          <Field label={`Anzahl (${unit})`} htmlFor="amount">
            <Input
              id="amount"
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="z. B. 20"
              className="text-center text-2xl font-bold"
            />
          </Field>
          <Field label="Datum & Uhrzeit" htmlFor="when">
            <DateTimeInput id="when" value={when} onChange={setWhen} />
          </Field>
          <Button type="submit" fullWidth size="lg" loading={submitting}>
            Eintragen
          </Button>
        </form>
      </Card>

      {/* Historie */}
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
        {/* Zeitraum-Filter */}
        <div className="mt-2 flex gap-1.5">
          {(['all', 'today', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-brand-600 text-white'
                  : 'bg-ink-700 text-slate-400 hover:bg-ink-600 hover:text-slate-200'
              }`}
            >
              {p === 'all' ? 'Alle' : p === 'today' ? 'Heute' : p === 'week' ? 'Woche' : 'Monat'}
            </button>
          ))}
        </div>
        <div className="mt-3">
          {loading ? (
            <LoadingState label="Lade Einträge …" />
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : filteredEntries.length === 0 ? (
            <EmptyState
              icon="📝"
              title={entries.length === 0 ? 'Noch keine Einträge' : 'Keine Einträge im Zeitraum'}
              description={entries.length === 0 ? 'Trage oben deinen ersten Satz ein.' : ''}
            />
          ) : (
            <ul className="divide-y divide-ink-700">
              {filteredEntries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600/20 text-base font-bold text-brand-200">
                    {entry.amount}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      {formatRelativeDay(entry.performed_at)} · {formatTime(entry.performed_at)}
                    </p>
                  </div>
                  <button
                    aria-label="Bearbeiten"
                    onClick={() => setEditing(entry)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-ink-700 hover:text-slate-200"
                  >
                    <EditIcon className="h-5 w-5" />
                  </button>
                  <button
                    aria-label="Löschen"
                    onClick={() => setDeleting(entry)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {editing && (
        <EditModal
          entry={editing}
          unit={unit}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            const { error: err } = await updateEntry(editing.id, patch);
            if (err) toast.error(err);
            else {
              toast.success('Eintrag aktualisiert.');
              setEditing(null);
              void refetchStats();
            }
          }}
        />
      )}

      <Modal
        open={!!deleting}
        title="Eintrag löschen?"
        confirmLabel="Löschen"
        confirmVariant="danger"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const { error: err } = await deleteEntry(deleting.id);
          if (err) toast.error(err);
          else {
            toast.success('Eintrag gelöscht.');
            void refetchStats();
          }
          setDeleting(null);
        }}
      >
        Dieser Eintrag ({deleting?.amount} {unit}) wird dauerhaft entfernt.
      </Modal>
    </div>
  );
}

function EditModal({
  entry,
  unit,
  onClose,
  onSave,
}: {
  entry: WorkoutEntry;
  unit: string;
  onClose: () => void;
  onSave: (patch: { amount: number; note: string | null; performed_at: string }) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(entry.amount));
  const [when, setWhen] = useState(toDateTimeLocalValue(new Date(entry.performed_at)));
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      open
      title="Eintrag bearbeiten"
      confirmLabel="Speichern"
      loading={saving}
      onClose={onClose}
      onConfirm={async () => {
        const n = parseInt(amount, 10);
        if (!n || n <= 0) return;
        setSaving(true);
        await onSave({
          amount: n,
          note: null,
          performed_at: new Date(when).toISOString(),
        });
        setSaving(false);
      }}
    >
      <div className="space-y-3 text-left">
        <Field label={`Anzahl (${unit})`}>
          <Input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="text-center"
          />
        </Field>
        <Field label="Datum & Uhrzeit">
          <DateTimeInput value={when} onChange={setWhen} />
        </Field>
      </div>
    </Modal>
  );
}
