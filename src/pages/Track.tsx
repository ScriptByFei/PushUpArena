import { FormEvent, useState } from 'react';
import { useExercise } from '@/context/ExerciseContext';
import { useWorkouts } from '@/hooks/useWorkouts';
import { useWorkoutLogger } from '@/hooks/useWorkoutLogger';
import { useStats } from '@/hooks/useStats';
import { useToast } from '@/context/ToastContext';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
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
  const [note, setNote] = useState('');

  const [editing, setEditing] = useState<WorkoutEntry | null>(null);
  const [deleting, setDeleting] = useState<WorkoutEntry | null>(null);

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
      note,
      performedAt: when ? new Date(when).toISOString() : undefined,
    });
    if (!err) {
      setAmount('');
      setNote('');
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
            <Input id="when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Notiz (optional)" htmlFor="note">
            <Textarea
              id="note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Wie lief der Satz?"
            />
          </Field>
          <Button type="submit" fullWidth size="lg" loading={submitting}>
            Eintragen
          </Button>
        </form>
      </Card>

      {/* Historie */}
      <Card>
        <CardTitle>Verlauf</CardTitle>
        <div className="mt-3">
          {loading ? (
            <LoadingState label="Lade Einträge …" />
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : entries.length === 0 ? (
            <EmptyState
              icon="📝"
              title="Noch keine Einträge"
              description="Trage oben deinen ersten Satz ein."
            />
          ) : (
            <ul className="divide-y divide-ink-700">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600/20 text-base font-bold text-brand-200">
                    {entry.amount}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-200">
                      {formatRelativeDay(entry.performed_at)} · {formatTime(entry.performed_at)}
                    </p>
                    {entry.note && (
                      <p className="truncate text-xs text-slate-400">{entry.note}</p>
                    )}
                  </div>
                  <button
                    aria-label="Bearbeiten"
                    onClick={() => setEditing(entry)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-ink-700 hover:text-slate-200"
                  >
                    <EditIcon className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Löschen"
                    onClick={() => setDeleting(entry)}
                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                  >
                    <TrashIcon className="h-4 w-4" />
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
  const [note, setNote] = useState(entry.note ?? '');
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
          note: note.trim() ? note.trim() : null,
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
          <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
        <Field label="Notiz (optional)">
          <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
