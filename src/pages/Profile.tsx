import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useProfileStats } from '@/hooks/useProfileStats';
import { useExercise } from '@/context/ExerciseContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { AvatarUpload } from '@/components/AvatarUpload';
import { LogoutIcon } from '@/components/ui/icons';
import { formatDate } from '@/lib/date';

// ─── StatCell ────────────────────────────────────────────────────────────────

interface StatCellProps {
  icon: string;
  label: string;
  value: string | number;
  highlight?: 'orange' | 'gold' | 'medal';
  accent?: string;
}

function StatCell({ icon, label, value, highlight, accent }: StatCellProps) {
  const valueColor = highlight === 'orange'
    ? 'text-orange-400'
    : highlight === 'gold'
    ? 'text-amber-400'
    : highlight === 'medal'
    ? 'text-brand-300'
    : accent ?? 'text-brand-300';

  const borderClass = highlight === 'orange'
    ? 'border-orange-500/25'
    : highlight === 'gold'
    ? 'border-amber-500/25'
    : highlight === 'medal'
    ? 'border-brand-500/25'
    : 'border-ink-700';

  const glowStyle: React.CSSProperties = highlight === 'orange'
    ? { boxShadow: '0 0 0 1px rgba(251,146,60,0.15), 0 0 18px rgba(251,146,60,0.1)' }
    : highlight === 'gold'
    ? { boxShadow: '0 0 0 1px rgba(245,158,11,0.15), 0 0 18px rgba(245,158,11,0.1)' }
    : highlight === 'medal'
    ? { boxShadow: '0 0 0 1px rgba(99,102,241,0.15), 0 0 14px rgba(99,102,241,0.08)' }
    : {};

  return (
    <div
      className={`flex h-[76px] flex-col items-center justify-center rounded-xl border bg-ink-800/60 px-2 text-center ${borderClass}`}
      style={glowStyle}
    >
      <span className="text-[13px] leading-none">{icon}</span>
      <span className={`mt-1.5 text-[17px] font-extrabold leading-none ${valueColor}`}>{value}</span>
      <span className="mt-1 text-[10px] leading-tight text-slate-500">{label}</span>
    </div>
  );
}

// ─── SectionLabel ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-600">
      {children}
    </p>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

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
  const [medalCounts, setMedalCounts] = useState<{ gold: number; silver: number; bronze: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_identities')
      .select('first_name, last_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setRealHandle(`@${data.first_name.trim()} ${data.last_name.trim()}`);
      });
  }, [user]);

  useEffect(() => {
    if (!exercise?.id || !user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).rpc('get_my_medal_counts', { p_exercise: exercise.id })
      .then(({ data }: { data: { gold_count: number; silver_count: number; bronze_count: number }[] | null }) => {
        if (data?.[0]) {
          setMedalCounts({ gold: data[0].gold_count, silver: data[0].silver_count, bronze: data[0].bronze_count });
        }
      });
  }, [exercise?.id, user]);

  if (profileLoading || !profile) return <LoadingState label="Lade Profil …" />;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await updateProfile({ display_name: form.display_name.trim() || null });
    setSaving(false);
    if (error) toast.error(error);
    else { toast.success('Profil gespeichert.'); setEditing(false); }
  }

  const totalMedals = medalCounts
    ? medalCounts.gold + medalCounts.silver + medalCounts.bronze
    : null;


  return (
    <div className="space-y-3">
      {/* ── Avatar-Reset-Hinweis ──────────────────────────────────── */}
      {!profile.avatar_url && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <span className="mt-0.5 shrink-0 text-base">📸</span>
          <span>
            Profilbilder wurden zurückgesetzt. Tippe auf den Avatar um ein neues Bild hochzuladen.
          </span>
        </div>
      )}

      {/* ── Profil-Karte ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-ink-700 bg-ink-800/60 px-4 py-3">
        <div className="flex items-center gap-3">
          <AvatarUpload
            url={profile.avatar_url ?? null}
            name={profile.display_name || profile.username}
            userId={profile.id}
            size={80}
            onUploaded={async (newUrl) => {
              const { error } = await updateProfile({ avatar_url: newUrl });
              return { error };
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-xl font-extrabold text-white">
                {profile.display_name || profile.username}
              </h2>
              {!editing && (
                <button
                  onClick={() => { setForm({ display_name: profile.display_name ?? '' }); setEditing(true); }}
                  className="shrink-0 text-sm leading-none text-slate-500 hover:text-slate-200 transition"
                  title="Name ändern"
                >
                  ✏️
                </button>
              )}
            </div>
            <p className="text-[13px] text-slate-400 leading-tight">
              {realHandle ?? `@${profile.username}`}
            </p>
            <p className="text-[11px] text-slate-500 truncate mt-0.5">{user?.email}</p>
            <p className="text-[10px] text-slate-700 mt-0.5">Dabei seit {formatDate(profile.created_at)}</p>
          </div>
          <button
            onClick={() => setConfirmLogout(true)}
            className="shrink-0 rounded-full p-1.5 text-slate-500 hover:bg-ink-700 hover:text-red-400 transition"
            title="Abmelden"
          >
            <LogoutIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Name bearbeiten ───────────────────────────────────────── */}
      {editing && (
        <div className="rounded-2xl border border-ink-700 bg-ink-800/60 px-4 py-4">
          <p className="mb-3 text-sm font-semibold text-slate-300">Name ändern</p>
          <form onSubmit={onSave} className="space-y-3">
            <Field label="Anzeigename" htmlFor="display_name">
              <Input id="display_name" maxLength={50} value={form.display_name}
                onChange={(e) => setForm({ ...form, display_name: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" fullWidth onClick={() => setEditing(false)}>Abbrechen</Button>
              <Button type="submit" fullWidth loading={saving}>Speichern</Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Hero-Kacheln ─────────────────────────────────────────── */}
      {!statsLoading && (
        <div
          className="rounded-2xl border border-brand-500/20 px-4 py-3"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(8,8,15,0.85) 100%)',
            boxShadow: '0 0 32px rgba(99,102,241,0.08)',
          }}
        >
          <div className="flex items-stretch">
            <div className="flex flex-1 flex-col items-center justify-center py-1 text-center">
              <p className="text-2xl font-extrabold text-orange-400 leading-none">
                {stats.currentStreak}
              </p>
              <p className="mt-1.5 text-[11px] text-slate-400">🔥 Streak</p>
            </div>
            <div className="w-px self-stretch bg-white/10" />
            <div className="flex flex-1 flex-col items-center justify-center py-1 text-center">
              <p className="text-2xl font-extrabold text-brand-300 leading-none">
                {stats.totalAmount.toLocaleString('de-DE')}
              </p>
              <p className="mt-1.5 text-[11px] text-slate-400">💪 Gesamt</p>
            </div>
            <div className="w-px self-stretch bg-white/10" />
            <div className="flex flex-1 flex-col items-center justify-center py-1 text-center">
              <p className="text-2xl font-extrabold text-amber-400 leading-none">
                {totalMedals ?? '–'}
              </p>
              <p className="mt-1.5 text-[11px] text-slate-400">🏅 Medaillen</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Statistiken ───────────────────────────────────────────── */}
      {statsLoading ? (
        <LoadingState label="Lade Statistiken …" />
      ) : statsError ? (
        <ErrorState message={statsError} />
      ) : (
        <div className="space-y-3">
          {/* Training */}
          <div className="space-y-2">
            <SectionLabel>Training</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              <StatCell icon="📈" label="Ø pro Tag" value={stats.avgPerActiveDay} />
              <StatCell icon="📅" label="Trainingstage" value={stats.trainingDays} />
              <StatCell icon="📆" label="Letzte 30 Tage" value={stats.last30Days} />
            </div>
          </div>

          {/* Rekorde */}
          <div className="space-y-2">
            <SectionLabel>Rekorde</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              <StatCell icon="🟢" label="Bester Tag" value={stats.bestDay ? stats.bestDay.amount : '–'} accent="text-emerald-400" />
              <StatCell icon="👑" label="Längste Streak" value={`${stats.longestStreak}d`} highlight="gold" />
              <StatCell icon="📅" label="Beste Woche" value={stats.bestWeek.toLocaleString('de-DE')} accent="text-violet-400" />
            </div>
          </div>

          {/* Erfolge */}
          {medalCounts && (
            <div className="space-y-2">
              <SectionLabel>Medaillen</SectionLabel>
              <div
                className="flex rounded-xl border border-brand-500/25 bg-ink-800/60"
                style={{ boxShadow: '0 0 0 1px rgba(99,102,241,0.15), 0 0 14px rgba(99,102,241,0.08)' }}
              >
                {([
                  { emoji: '🥇', count: medalCounts.gold,   color: 'text-amber-400' },
                  { emoji: '🥈', count: medalCounts.silver, color: 'text-slate-300' },
                  { emoji: '🥉', count: medalCounts.bronze, color: 'text-orange-400' },
                ] as const).map(({ emoji, count, color }, i) => (
                  <>
                    {i > 0 && <div key={`sep-${i}`} className="w-px self-stretch bg-white/10" />}
                    <div key={emoji} className="flex flex-1 flex-col items-center justify-center py-3 text-center">
                      <span className="text-xl leading-none">{emoji}</span>
                      <span className={`mt-1.5 text-lg font-extrabold leading-none ${color}`}>{count}</span>
                    </div>
                  </>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Abmelden-Bestätigung ──────────────────────────────────── */}
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
