import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useProfileStats } from '@/hooks/useProfileStats';
import { useExercise } from '@/context/ExerciseContext';
import { ExerciseDropdown } from '@/components/ExerciseDropdown';
import { useToast } from '@/context/ToastContext';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { AvatarUpload } from '@/components/AvatarUpload';
import { LogoutIcon } from '@/components/ui/icons';
import { formatDate } from '@/lib/date';


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

// ─── Main ───────────────────────────────────────────────────────────
export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const { exercise } = useExercise();
  const { stats, loading: statsLoading, error: statsError } = useProfileStats(exercise?.id);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ display_name: '' });
  const [saving, setSaving] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [realHandle, setRealHandle] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_identities')
      .select('first_name, last_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const handle = `@${data.first_name.trim()} ${data.last_name.trim()}`;
          setRealHandle(handle);
        }
      });
  }, [user]);

  if (profileLoading || !profile) return <LoadingState label="Lade Profil …" />;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await updateProfile({ display_name: form.display_name.trim() || null });
    setSaving(false);
    if (error) toast.error(error);
    else { toast.success('Profil gespeichert.'); setEditing(false); }
  }

  return (
    <div className="space-y-4">
      <ExerciseDropdown />

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
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-xl font-extrabold">
                {profile.display_name || profile.username}
              </h2>
              {!editing && (
                <button
                  onClick={() => { setForm({ display_name: profile.display_name ?? '' }); setEditing(true); }}
                  className="shrink-0 text-base leading-none text-slate-400 hover:text-slate-200 transition"
                  title="Name ändern"
                >
                  ✏️
                </button>
              )}
            </div>
            <p className="text-sm text-slate-400">
              {realHandle ?? `@${profile.username}`}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-1">
            <button
              onClick={() => setConfirmLogout(true)}
              className="rounded-full p-1.5 text-slate-400 hover:bg-ink-700 hover:text-red-400 transition"
              title="Abmelden"
            >
              <LogoutIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="mt-3">
          <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          <p className="text-xs text-slate-600">Dabei seit {formatDate(profile.created_at)}</p>
        </div>
      </Card>

      {/* Profil bearbeiten */}
      {editing && (
        <Card>
          <CardTitle>Name ändern</CardTitle>
          <form onSubmit={onSave} className="mt-3 space-y-3">
            <Field label="Anzeigename" htmlFor="display_name">
              <Input id="display_name" maxLength={50} value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(false)}>Abbrechen</Button>
              <Button type="submit" fullWidth loading={saving}>Speichern</Button>
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
          <Card>
            <CardTitle>Statistik</CardTitle>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatCell label="Gesamt" value={stats.totalAmount} />
              <StatCell label="Ø pro Trainingstag" value={stats.avgPerActiveDay} />
              <StatCell label="Längste Streak" value={`${stats.longestStreak} 👑`} accent="text-amber-400" />
              <StatCell label="Akt. Streak" value={`${stats.currentStreak} 🔥`} accent="text-amber-300" />
              <StatCell label="Bester Tag" value={stats.bestDay ? stats.bestDay.amount : '–'} accent="text-emerald-400" />
              <StatCell label="Trainingstage" value={stats.trainingDays} />
              <StatCell label="Letzte 7 Tage" value={stats.last7Days} />
              <StatCell label="Letzte 30 Tage" value={stats.last30Days} />
            </div>
          </Card>
      )}

      {/* Abmelden-Bestätigung */}
      {confirmLogout && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setConfirmLogout(false)}
        >
          <div
            className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />
            <p className="mb-1 text-center text-base font-bold text-slate-100">Wirklich abmelden?</p>
            <p className="mb-6 text-center text-sm text-slate-500">Du kannst dich jederzeit wieder einloggen.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmLogout(false)}
                className="flex-1 rounded-2xl border border-ink-600 py-3 text-sm font-semibold text-slate-300 hover:bg-ink-700 transition"
              >
                Abbrechen
              </button>
              <button
                onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}
                className="flex-1 rounded-2xl bg-red-500/20 py-3 text-sm font-semibold text-red-400 hover:bg-red-500/30 transition"
              >
                Abmelden
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
