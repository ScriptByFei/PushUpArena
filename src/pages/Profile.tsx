import { FormEvent, useEffect, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useProfileStats } from '@/hooks/useProfileStats';
import { useExercise } from '@/context/ExerciseContext';
import { useToast } from '@/context/ToastContext';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { AvatarUpload } from '@/components/AvatarUpload';
import { MonthCalendar } from '@/components/MonthCalendar';
import { WeeklyBarChart } from '@/components/WeeklyBarChart';
import { useGoals } from '@/hooks/useGoals';
import { formatDate } from '@/lib/date';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

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

export default function Profile() {
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const { exercise } = useExercise();
  const { stats, loading: statsLoading, error: statsError } = useProfileStats(exercise?.id);
  const { goal } = useGoals(exercise?.id);
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: '', display_name: '', bio: '' });
  const [saving, setSaving] = useState(false);

  const now = new Date();
  const todayYear = now.getUTCFullYear();
  const todayMonth = now.getUTCMonth();
  const [calYear, setCalYear] = useState(todayYear);
  const [calMonth, setCalMonth] = useState(todayMonth);

  // Daten reichen max. 182 Tage zurück (~6 Monate)
  const minDate = new Date(Date.UTC(todayYear, todayMonth, now.getUTCDate()) - 181 * 86_400_000);
  const canGoPrev =
    calYear > minDate.getUTCFullYear() ||
    (calYear === minDate.getUTCFullYear() && calMonth > minDate.getUTCMonth());
  const canGoNext = calYear < todayYear || (calYear === todayYear && calMonth < todayMonth);

  function goPrev() {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1); }
    else setCalMonth((m) => m - 1);
  }
  function goNext() {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1); }
    else setCalMonth((m) => m + 1);
  }

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
    else {
      toast.success('Profil gespeichert.');
      setEditing(false);
    }
  }

  return (
    <div className="space-y-4">
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
              <Input
                id="username"
                value={form.username}
                autoCapitalize="none"
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </Field>
            <Field label="Anzeigename" htmlFor="display_name">
              <Input
                id="display_name"
                maxLength={50}
                value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              />
            </Field>
            <Field label="Bio (optional)" htmlFor="bio">
              <Textarea
                id="bio"
                rows={3}
                maxLength={280}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
              <Button type="submit" fullWidth loading={saving}>
                Speichern
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Statistik */}
      {statsLoading ? (
        <LoadingState label="Lade Statistiken …" />
      ) : statsError ? (
        <ErrorState message={statsError} />
      ) : (
        <>
          {/* Stat-Kacheln 2×4 */}
          <Card>
            <CardTitle>Statistik</CardTitle>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatCell label="Gesamt" value={stats.totalAmount} />
              <StatCell label="Ø pro Trainingstag" value={stats.avgPerActiveDay} />
              <StatCell label="Längste Streak" value={`${stats.longestStreak} 👑`} accent="text-amber-400" />
              <StatCell label="Akt. Streak" value={`${stats.currentStreak} 🔥`} accent="text-amber-300" />
              <StatCell
                label="Bester Tag"
                value={stats.bestDay ? stats.bestDay.amount : '–'}
                accent="text-emerald-400"
              />
              <StatCell label="Trainingstage" value={stats.trainingDays} />
              <StatCell label="Letzte 7 Tage" value={stats.last7Days} />
              <StatCell label="Letzte 30 Tage" value={stats.last30Days} />
            </div>
          </Card>

          {/* Letzte 7 Tage – Balkendiagramm */}
          {stats.last7DaysData.length > 0 && (
            <Card>
              <CardTitle>Letzte 7 Tage</CardTitle>
              <div className="mt-3">
                <WeeklyBarChart data={stats.last7DaysData} dailyGoal={goal?.daily_goal ?? 0} />
              </div>
            </Card>
          )}

          {/* Monatskalender */}
          <Card>
            <CardTitle>Aktivitätskalender</CardTitle>
            <p className="mb-3 mt-0.5 text-xs text-slate-400">Tippe auf einen Tag für Details</p>
            <MonthCalendar
              data={stats.dailyData}
              selectedYear={calYear}
              selectedMonth={calMonth}
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
              onPrev={goPrev}
              onNext={goNext}
            />
          </Card>

        </>
      )}
    </div>
  );
}
