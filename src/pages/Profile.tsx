import { FormEvent, useEffect, useState } from 'react';
import { useProfile } from '@/hooks/useProfile';
import { useStats } from '@/hooks/useStats';
import { useExercise } from '@/context/ExerciseContext';
import { useToast } from '@/context/ToastContext';
import { levelProgress } from '@/lib/gamification';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { LoadingState } from '@/components/ui/States';
import { formatDate } from '@/lib/date';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

export default function Profile() {
  const { profile, loading, updateProfile } = useProfile();
  const { exercise } = useExercise();
  const { stats } = useStats(exercise?.id);
  const toast = useToast();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: '', display_name: '', bio: '', avatar_url: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        username: profile.username,
        display_name: profile.display_name ?? '',
        bio: profile.bio ?? '',
        avatar_url: profile.avatar_url ?? '',
      });
    }
  }, [profile]);

  if (loading || !profile) return <LoadingState label="Lade Profil …" />;

  const progress = levelProgress(stats.total_amount);

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
      avatar_url: form.avatar_url.trim() || null,
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
          <Avatar url={profile.avatar_url} name={profile.display_name || profile.username} size={64} />
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

      {/* Bearbeiten */}
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
            <Field label="Avatar-URL (optional)" htmlFor="avatar_url">
              <Input
                id="avatar_url"
                type="url"
                value={form.avatar_url}
                onChange={(e) => setForm({ ...form, avatar_url: e.target.value })}
                placeholder="https://…"
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

      {/* Level / Stats */}
      <Card>
        <div className="flex items-baseline justify-between">
          <CardTitle>Level {progress.level}</CardTitle>
          <span className="text-xs text-slate-400">{stats.total_amount} XP gesamt</span>
        </div>
        <div className="mt-3">
          <ProgressBar
            value={progress.xpIntoLevel}
            max={progress.xpForThisLevel}
            label={`Level ${progress.level + 1}`}
            showValues={false}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div>
            <div className="text-xl font-extrabold text-brand-300">{stats.total_amount}</div>
            <div className="text-xs text-slate-400">Gesamt</div>
          </div>
          <div>
            <div className="text-xl font-extrabold text-amber-300">{stats.current_streak}🔥</div>
            <div className="text-xs text-slate-400">Streak</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
