import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useProfileStats } from '@/hooks/useProfileStats';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';
import type { Exercise } from '@/lib/database.types';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { AvatarUpload } from '@/components/AvatarUpload';
import { LogoutIcon } from '@/components/ui/icons';
import { formatDate } from '@/lib/date';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// ─── Zeitraum-Helpers ───────────────────────────────────────────────
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

// ─── StatCell ───────────────────────────────────────────────────────
interface StatCellProps {
  label: string;
  value: string | number;
  accent?: string;
}
function StatCell({ label, value, accent = 'text-brand-300' }: StatCellProps) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-ink-700 bg-ink-800/60 px-3 py-3 text-center">
      <span className={`text-lg font-extrabold ${accent}`}>{value}</span>
      <span className="mt-0.5 text-[11px] leading-tight text-slate-400">{label}</span>
    </div>
  );
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

// ─── Main ───────────────────────────────────────────────────────────
export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const { exercise: activeExercise, enrolledExercises } = useExercise();
  const [localExercise, setLocalExercise] = useState<Exercise | null>(null);
  const exercise = localExercise ?? activeExercise;
  const { stats, loading: statsLoading, error: statsError } = useProfileStats(exercise?.id);
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: '', display_name: '', bio: '' });
  const [saving, setSaving] = useState(false);

  // Zeitraum-Zusammenfassung
  type PeriodTab = 'month' | 'week' | 'custom';
  const [periodTab, setPeriodTab] = useState<PeriodTab>('month');
  const now = new Date();
  const [pYear, setPYear] = useState(now.getFullYear());
  const [pMonth, setPMonth] = useState(now.getMonth());
  const [pWeek, setPWeek] = useState(() => getISOWeek(now));
  const [pWeekYear, setPWeekYear] = useState(() => getISOWeekYear(now));
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [periodTotal, setPeriodTotal] = useState<number | null>(null);
  const [periodLoading, setPeriodLoading] = useState(false);

  const todayStr = toDateStr(now);
  const maxMonth = now.getMonth();
  const maxYear = now.getFullYear();

  function prevMonth() {
    if (pMonth === 0) { setPYear(y => y - 1); setPMonth(11); }
    else setPMonth(m => m - 1);
  }
  function nextMonth() {
    if (pYear > maxYear || (pYear === maxYear && pMonth >= maxMonth)) return;
    if (pMonth === 11) { setPYear(y => y + 1); setPMonth(0); }
    else setPMonth(m => m + 1);
  }
  function prevWeek() {
    if (pWeek === 1) { const py = pWeekYear - 1; setPWeekYear(py); setPWeek(getWeeksInYear(py)); }
    else setPWeek(w => w - 1);
  }
  function nextWeek() {
    const monday = getMondayOfISOWeek(pWeek, pWeekYear);
    if (toDateStr(monday) >= todayStr) return;
    if (pWeek === getWeeksInYear(pWeekYear)) { setPWeekYear(y => y + 1); setPWeek(1); }
    else setPWeek(w => w + 1);
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

  useEffect(() => {
    if (profile) {
      setForm({
        username: profile.username,
        display_name: profile.display_name ?? '',
        bio: profile.bio ?? '',
      });
    }
  }, [profile]);

  if (profileLoading || !profile) return <LoadingState label="Lade Profil …" />;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!USERNAME_RE.test(form.username)) {
      toast.error('Username: 3–20 Zeichen, nur Buchstaben, Zahlen und _.');
      return;
    }
    setSaving(true);
    const { error } = await updateProfile({
      username: form.username,
      display_name: form.display_name.trim() || null,
      bio: form.bio.trim() || null,
    });
    setSaving(false);
    if (error) toast.error(error);
    else { toast.success('Profil gespeichert.'); setEditing(false); }
  }

  const monthLabel = new Date(pYear, pMonth, 1).toLocaleDateString('de-DE', {
    month: 'long', year: 'numeric',
  });
  const weekMonday = getMondayOfISOWeek(pWeek, pWeekYear);
  const weekSunday = new Date(weekMonday);
  weekSunday.setDate(weekMonday.getDate() + 6);
  const weekLabel = `KW ${pWeek} · ${weekMonday.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} – ${weekSunday.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}`;

  return (
    <div className="space-y-4">
      {/* Konto */}
      <Card>
        <CardTitle>Konto</CardTitle>
        <p className="mt-2 text-xs text-slate-500">Angemeldet als {user?.email}</p>
        <Button variant="secondary" fullWidth className="mt-3" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}>
          <LogoutIcon className="h-5 w-5" />
          Abmelden
        </Button>
      </Card>

      {/* Profil-Header */}
      <Card>
        <div className="flex items-center gap-4">
          <AvatarUpload
            url={profile.avatar_url ?? null}
            name={profile.display_name || profile.username}
            userId={profile.id}
            size={64}
            onUploaded={async (newUrl) => {
              const { error } = await updateProfile({ avatar_url: newUrl });
              return { error };
            }}
          />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-extrabold">
              {profile.display_name || profile.username}
            </h2>
            <p className="text-sm text-slate-400">@{profile.username}</p>
          </div>
          {!editing && (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Bearbeiten
            </Button>
          )}
        </div>
        {profile.bio && !editing && <p className="mt-3 text-sm text-slate-300">{profile.bio}</p>}
        <p className="mt-3 text-xs text-slate-500">Dabei seit {formatDate(profile.created_at)}</p>
      </Card>

      {/* Profil bearbeiten */}
      {editing && (
        <Card>
          <CardTitle>Profil bearbeiten</CardTitle>
          <form onSubmit={onSave} className="mt-3 space-y-3">
            <Field label="Username" htmlFor="username" hint="3–20 Zeichen: a–z, 0–9, _">
              <Input id="username" value={form.username} autoCapitalize="none"
                onChange={(e) => setForm({ ...form, username: e.target.value })} />
            </Field>
            <Field label="Anzeigename" htmlFor="display_name">
              <Input id="display_name" maxLength={50} value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </Field>
            <Field label="Bio (optional)" htmlFor="bio">
              <Textarea id="bio" rows={3} maxLength={280} value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(false)}>Abbrechen</Button>
              <Button type="submit" fullWidth loading={saving}>Speichern</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Übungs-Switcher (nur wenn >1 eingeschrieben) */}
      {enrolledExercises.length > 1 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${enrolledExercises.length}, 1fr)` }}>
          {enrolledExercises.map((ex) => {
            const isActive = ex.id === exercise?.id;
            return (
              <button key={ex.id} onClick={() => setLocalExercise(ex)}
                className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  isActive ? 'bg-brand-600 text-white' : 'bg-ink-800 text-slate-400 hover:bg-ink-700'
                }`}
              >
                <img src={EXERCISE_ICONS[ex.slug] ?? '/pushup-icon.png'} alt={ex.name} className="h-5 w-5 rounded-md object-cover" />
                {ex.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Statistik */}
      {statsLoading ? (
        <LoadingState label="Lade Statistiken …" />
      ) : statsError ? (
        <ErrorState message={statsError} />
      ) : (
        <>
          <Card>
            <CardTitle>Statistik</CardTitle>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatCell label="Gesamt" value={stats.totalAmount} />
              <StatCell label="Ø pro Trainingstag" value={stats.avgPerActiveDay} />
              <StatCell label="Längste Streak" value={`${stats.longestStreak}👑`} accent="text-amber-400" />
              <StatCell label="Akt. Streak" value={`${stats.currentStreak}🔥`} accent="text-amber-300" />
              <StatCell label="Bester Tag" value={stats.bestDay ? stats.bestDay.amount : '–'} accent="text-emerald-400" />
              <StatCell label="Trainingstage" value={stats.trainingDays} />
              <StatCell label="Letzte 7 Tage" value={stats.last7Days} />
              <StatCell label="Letzte 30 Tage" value={stats.last30Days} />
            </div>
          </Card>

          {/* Zeitraum-Zusammenfassung */}
          <Card>
            <CardTitle>Zeitraum · {exercise?.name}</CardTitle>

            {/* Tabs */}
            <div className="mt-3 flex w-full rounded-xl bg-ink-950/60 p-1">
              {(['month', 'week', 'custom'] as const).map((t) => (
                <button key={t} onClick={() => setPeriodTab(t)}
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
                <button onClick={nextMonth}
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
                <button onClick={nextWeek}
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
                  <p className="mt-1 text-xs text-slate-500">{exercise?.name} in diesem Zeitraum</p>
                </>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
