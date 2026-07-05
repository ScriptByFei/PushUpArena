import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useExercise } from '@/context/ExerciseContext';
import { useWorkouts } from '@/hooks/useWorkouts';
import { useWorkoutLogger } from '@/hooks/useWorkoutLogger';
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
import { formatTime, toDateTimeLocalValue } from '@/lib/date';
import type { WorkoutEntry } from '@/lib/database.types';

const TZ = 'Europe/Berlin';
function berlinToday() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
}
function maxRestDate() {
  const [y, m, d] = berlinToday().split('-').map(Number);
  return new Date(y, m - 1, d + 14).toLocaleDateString('sv-SE');
}
// Frühestes erlaubtes Eintragsdatum: vor 2 Tagen um 00:00 Uhr Berlin-Zeit
function minEntryDatetime() {
  const [y, m, d] = berlinToday().split('-').map(Number);
  const twoDaysAgo = new Date(y, m - 1, d - 2);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${twoDaysAgo.getFullYear()}-${pad(twoDaysAgo.getMonth() + 1)}-${pad(twoDaysAgo.getDate())}T00:00`;
}
function berlinYesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString('sv-SE', { timeZone: TZ });
}
function formatDayLabel(dateStr: string): string {
  const today = berlinToday();
  const yesterday = berlinYesterday();
  if (dateStr === today) return 'Heute';
  if (dateStr === yesterday) return 'Gestern';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

export default function Track() {
  const { exercise, loading: exLoading, error: exError, reload } = useExercise();
  const unit = exercise?.unit === 'reps' ? 'Wdh.' : exercise?.unit ?? '';
  const { submit, submitting } = useWorkoutLogger(exercise?.id, unit);
  const { entries, loading, error, refetch, updateEntry, deleteEntry } = useWorkouts(exercise?.id);
  const { restDays, loading: rdLoading, refetch: refetchRD, addRestDay, deleteRestDay } = useRestDays(exercise?.id);
  const { stats, refetch: refetchStats } = useStats(exercise?.id);
  const toast = useToast();

  // Form mode
  type FormMode = 'training' | 'rest';
  const [mode, setMode] = useState<FormMode>('training');

  // Training fields
  const [amount, setAmount] = useState('');
  const [when, setWhen] = useState(toDateTimeLocalValue());

  // Rest day field
  const [restDate, setRestDate] = useState(berlinToday());
  const [savingRest, setSavingRest] = useState(false);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setWhen(toDateTimeLocalValue());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const [editing, setEditing] = useState<WorkoutEntry | null>(null);
  const [deleting, setDeleting] = useState<WorkoutEntry | null>(null);
  const [deletingRD, setDeletingRD] = useState<{ id: string; rest_date: string } | null>(null);

  type Period = 'all' | 'week' | 'month' | 'year';
  type SortDir = 'desc' | 'asc';
  const [period, setPeriod] = useState<Period>('all');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set([berlinToday()]));

  function toggleDay(dateStr: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  }

  type ListItem =
    | { kind: 'workout'; entry: WorkoutEntry; sortKey: number; dateStr: string }
    | { kind: 'rest'; id: string; rest_date: string; sortKey: number; dateStr: string };

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
        if (period === 'week' && eBerlin < monday) continue;
        if (period === 'month' && eBerlin < firstOfMonth) continue;
        if (period === 'year' && eBerlin < `${y}-01-01`) continue;
      }
      items.push({ kind: 'workout', entry, sortKey: new Date(entry.performed_at).getTime(), dateStr: eBerlin });
    }

    for (const rd of restDays) {
      if (dateFilter && rd.rest_date !== dateFilter) continue;
      if (!dateFilter) {
        if (period === 'week' && rd.rest_date < monday) continue;
        if (period === 'month' && rd.rest_date < firstOfMonth) continue;
        if (period === 'year' && rd.rest_date < `${y}-01-01`) continue;
      }
      const [ry, rm, rd2] = rd.rest_date.split('-').map(Number);
      items.push({ kind: 'rest', id: rd.id, rest_date: rd.rest_date, sortKey: new Date(ry, rm - 1, rd2, 12).getTime(), dateStr: rd.rest_date });
    }

    items.sort((a, b) => sortDir === 'desc' ? b.sortKey - a.sortKey : a.sortKey - b.sortKey);
    return items;
  }, [entries, restDays, period, sortDir, dateFilter]);

  const groupedDays = useMemo(() => {
    const map = new Map<string, ListItem[]>();
    for (const item of mergedList) {
      const existing = map.get(item.dateStr) ?? [];
      existing.push(item);
      map.set(item.dateStr, existing);
    }
    return Array.from(map.entries());
  }, [mergedList]);

  if (exLoading) return <LoadingState />;
  if (exError || !exercise) return <ErrorState message={exError ?? 'Übung fehlt.'} onRetry={reload} />;

  async function onSubmitTraining(e: FormEvent) {
    e.preventDefault();
    const n = parseInt(amount, 10);
    if (!n || n <= 0) { toast.error('Bitte eine gültige Anzahl eingeben.'); return; }
    if (when && when < minEntryDatetime()) { toast.error('Einträge können maximal 2 Tage rückwirkend erfasst werden.'); return; }
    if (when && when > toDateTimeLocalValue()) { toast.error('Einträge können nicht in der Zukunft erfasst werden.'); return; }
    const { error: err } = await submit({
      amount: n, note: null,
      performedAt: when ? new Date(when).toISOString() : undefined,
      prevDailyTotal: stats.today_amount,
    });
    if (!err) { setAmount(''); setWhen(toDateTimeLocalValue()); void refetch(); void refetchStats(); }
  }

  async function onSubmitRestDay(e: FormEvent) {
    e.preventDefault();
    const maxDate = maxRestDate();
    const today = berlinToday();
    if (restDate > maxDate) { toast.error('Maximal 14 Tage im Voraus planbar.'); return; }
    if (restDate < today) { toast.error('Vergangene Tage ohne Training zählen automatisch als Ruhetag.'); return; }
    setSavingRest(true);
    const { error: err } = await addRestDay(restDate);
    setSavingRest(false);
    if (err) { toast.error(err); return; }
    toast.success('Ruhetag gespeichert.');
    setRestDate(berlinToday());
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
        {/* Mode Toggle */}
        <div className="mb-4 flex rounded-xl bg-ink-900/60 p-1">
          {(['training', 'rest'] as FormMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-brand-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'training' ? '🏋️ Training' : '😴 Ruhetag'}
            </button>
          ))}
        </div>

        {mode === 'training' ? (
          <>
            <CardTitle>{exercise.name} eintragen</CardTitle>
            <form onSubmit={onSubmitTraining} className="mt-3 space-y-3" noValidate>
              <Field label={`Anzahl (${unit})`} htmlFor="amount">
                <Input
                  id="amount" type="number" inputMode="numeric"
                  min={1} max={100000} required
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  placeholder="z. B. 20" className="text-center text-2xl font-bold"
                />
              </Field>
              <Field label="Datum & Uhrzeit" htmlFor="when">
                <DateTimeInput id="when" value={when} onChange={setWhen} min={minEntryDatetime()} max={toDateTimeLocalValue()} />
                <p className="mt-1 text-xs text-slate-500">Maximal 2 Tage rückwirkend, kein Datum in der Zukunft.</p>
              </Field>
              <Button type="submit" fullWidth size="lg" loading={submitting}>Eintragen</Button>
            </form>
          </>
        ) : (
          <>
            <CardTitle>Ruhetag planen</CardTitle>
            <p className="mt-0.5 text-xs text-slate-400">
              Plane Ruhetage bis zu 14 Tage im Voraus. Tage ohne Training zählen automatisch als Ruhetag.
            </p>
            <form onSubmit={onSubmitRestDay} className="mt-3 space-y-3" noValidate>
              <Field label="Datum" htmlFor="restDate">
                <div className="relative">
                  <div className="input-base flex items-center justify-between">
                    <span>
                      {new Date(restDate + 'T00:00:00').toLocaleDateString('de-DE', {
                        weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
                      })}
                    </span>
                    <CalendarIcon className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="restDate" type="date"
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    value={restDate}
                    min={berlinToday()}
                    max={maxRestDate()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) { setRestDate(berlinToday()); return; }
                      const maxDate = maxRestDate();
                      if (val < berlinToday()) {
                        setRestDate(berlinToday());
                        toast.notify('Vergangene Tage ohne Training zählen automatisch als Ruhetag.');
                      } else if (val > maxDate) {
                        setRestDate(maxDate);
                        toast.notify('Maximal 14 Tage im Voraus planbar.');
                      } else {
                        setRestDate(val);
                      }
                    }}
                  />
                </div>
              </Field>
              <Button type="submit" fullWidth size="lg" loading={savingRest}>
                Ruhetag speichern
              </Button>
            </form>
          </>
        )}
      </Card>

      {/* Verlauf */}
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
          {(['all', 'week', 'month', 'year'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => { setPeriod(p); setDateFilter(null); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                period === p && !dateFilter
                  ? 'bg-brand-600 text-white'
                  : 'bg-ink-700 text-slate-400 hover:bg-ink-600 hover:text-slate-200'
              }`}
            >
              {p === 'all' ? 'Alle' : p === 'week' ? 'Woche' : p === 'month' ? 'Monat' : 'Jahr'}
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
          ) : groupedDays.length === 0 ? (
            <EmptyState
              icon="📝"
              title={entries.length === 0 && restDays.length === 0 ? 'Noch keine Einträge' : 'Keine Einträge im Zeitraum'}
              description={entries.length === 0 && restDays.length === 0 ? 'Trage oben deinen ersten Satz ein.' : ''}
            />
          ) : (
            <div className="divide-y divide-ink-700">
              {groupedDays.map(([dateStr, items]) => {
                const isOpen = expandedDays.has(dateStr);
                const dayTotal = items
                  .filter((i) => i.kind === 'workout')
                  .reduce((s, i) => s + (i.kind === 'workout' ? i.entry.amount : 0), 0);
                const hasRest = items.some((i) => i.kind === 'rest');
                return (
                  <div key={dateStr}>
                    <button
                      onClick={() => toggleDay(dateStr)}
                      className="flex w-full items-center gap-2 py-3 text-left"
                    >
                      <span className="flex w-36 shrink-0 items-center">
                        <span className="w-9 shrink-0 text-sm font-semibold text-slate-400">
                          {(dateStr !== berlinToday() && dateStr !== berlinYesterday())
                            ? new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'short' }) + ','
                            : ''}
                        </span>
                        <span className="text-sm font-semibold text-slate-200">
                          {(dateStr === berlinToday()) ? 'Heute'
                            : (dateStr === berlinYesterday()) ? 'Gestern'
                            : new Date(dateStr + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </span>
                      </span>
                      <span className="flex-1" />
                      <span className="w-5 shrink-0 text-center text-base">{hasRest ? '😴' : ''}</span>
                      <span className="w-20 shrink-0 text-right text-sm font-bold text-brand-300">
                        {dayTotal > 0 ? `${dayTotal} ${unit}` : ''}
                      </span>
                      <svg viewBox="0 0 20 20" fill="currentColor"
                        className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="pb-2 space-y-1">
                        {items.map((item) =>
                          item.kind === 'workout' ? (
                            <div key={`w-${item.entry.id}`} className="flex items-center gap-3 rounded-xl bg-ink-800/60 px-3 py-2">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600/20 text-sm font-bold text-brand-200">
                                {item.entry.amount}
                              </div>
                              <p className="flex-1 text-xs text-slate-400">{formatTime(item.entry.performed_at)}</p>
                              {new Date(item.entry.performed_at) >= new Date(minEntryDatetime()) && (
                                <button aria-label="Bearbeiten" onClick={() => setEditing(item.entry)}
                                  className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-ink-700 hover:text-slate-200">
                                  <EditIcon className="h-4 w-4" />
                                </button>
                              )}
                              <button aria-label="Löschen" onClick={() => setDeleting(item.entry)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/20 hover:text-rose-300">
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <div key={`r-${item.id}`} className="flex items-center gap-3 rounded-xl bg-ink-800/60 px-3 py-2">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-700 text-base">😴</div>
                              <p className="flex-1 text-xs text-slate-400">Ruhetag</p>
                              <button aria-label="Ruhetag löschen" onClick={() => setDeletingRD({ id: item.id, rest_date: item.rest_date })}
                                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/20 hover:text-rose-300">
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
    </div>
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
