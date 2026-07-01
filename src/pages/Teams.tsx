import { useState } from 'react';
import { useExercise } from '@/context/ExerciseContext';
import { useToast } from '@/context/ToastContext';
import { useTeams } from '@/hooks/useTeams';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { SearchIcon, CameraIcon, ShieldIcon } from '@/components/ui/icons';
import type { TeamLeaderboardRow } from '@/hooks/useTeams';

const MAX_BYTES = 5 * 1024 * 1024;

async function uploadTeamLogo(
  file: File,
  teamId: string,
): Promise<{ url: string | null; error: string | null }> {
  if (!file.type.startsWith('image/')) return { url: null, error: 'Bitte ein Bild auswählen.' };
  if (file.size > MAX_BYTES) return { url: null, error: 'Max. 5 MB.' };
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${teamId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('team-avatars').upload(path, file, { upsert: true });
  if (error) return { url: null, error: error.message };
  const { data } = supabase.storage.from('team-avatars').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

function TeamLogo({ url, name, size = 48 }: { url: string | null; name: string; size?: number }) {
  if (url) {
    return (
      <img src={url} alt={name} className="rounded-xl object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-xl bg-brand-700/40 text-brand-300"
      style={{ width: size, height: size }}
    >
      <ShieldIcon className="h-6 w-6" />
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const colors =
    rank === 1
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      : rank === 2
        ? 'bg-slate-400/20 text-slate-300 border-slate-400/40'
        : rank === 3
          ? 'bg-orange-700/20 text-orange-300 border-orange-700/40'
          : 'bg-ink-700 text-slate-400 border-ink-600';
  return (
    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${colors}`}>
      {rank}
    </div>
  );
}

// ── Logo picker (shared by create + edit modals) ──────────────────────────────
// Nutzt <label>-Trick statt JS-click(), da iOS Safari input.click() in Modals blockiert
function LogoPicker({
  preview,
  onChange,
}: {
  preview: string | null;
  onChange: (file: File) => void;
}) {
  const toast = useToast();
  return (
    <div className="flex justify-center">
      <label className="relative flex h-20 w-20 cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-ink-600 bg-ink-800 hover:border-brand-500">
        {preview ? (
          <img src={preview} alt="" className="h-full w-full rounded-2xl object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-slate-500">
            <CameraIcon className="h-6 w-6" />
            <span className="text-xs">Logo</span>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (!file.type.startsWith('image/')) { toast.error('Bitte ein Bild auswählen.'); return; }
              if (file.size > MAX_BYTES) { toast.error('Max. 5 MB.'); return; }
              onChange(file);
              e.target.value = '';
            }}
          />
      </label>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Teams() {
  const { exercise } = useExercise();
  const { user } = useAuth();
  const toast = useToast();
  const {
    myTeam,
    myMembership,
    memberStats,
    leaderboard,
    loading,
    error,
    refetch,
    myWeeklyTotal,
    myRank,
    createTeam,
    joinTeam,
    leaveTeam,
    updateTeam,
  } = useTeams(exercise?.slug);

  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const filtered = search.trim()
    ? leaderboard.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : leaderboard;

  async function handleJoin(teamId: string) {
    setJoining(teamId);
    const { error: err } = await joinTeam(teamId);
    setJoining(null);
    if (err) toast.error(err);
    else toast.success('Team beigetreten!');
  }

  async function handleLeave() {
    setLeaving(true);
    const { error: err } = await leaveTeam();
    setLeaving(false);
    setLeaveOpen(false);
    if (err) toast.error(err);
    else toast.success('Team verlassen.');
  }

  // ── IN A TEAM ───────────────────────────────────────────────────────────────
  if (myTeam) {
    return (
      <div className="space-y-4">
        <Card>
          <div className="flex items-center gap-3">
            <TeamLogo url={myTeam.avatar_url} name={myTeam.name} size={56} />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold">{myTeam.name}</h2>
              {myTeam.description && (
                <p className="mt-0.5 truncate text-xs text-slate-400">{myTeam.description}</p>
              )}
              <p className="mt-0.5 text-xs text-slate-500">
                {myMembership?.role === 'owner' ? 'Teamleiter · ' : ''}
                {memberStats.length} Mitglied{memberStats.length !== 1 ? 'er' : ''}
              </p>
            </div>
            {myMembership?.role === 'owner' && (
              <button
                onClick={() => setEditOpen(true)}
                className="rounded-lg p-2 text-slate-400 hover:bg-ink-700 hover:text-slate-200"
                aria-label="Team bearbeiten"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-ink-700 bg-ink-800/70 p-3 text-center">
              <div className="text-xs uppercase tracking-wide text-slate-400">Wochenrang</div>
              <div className="mt-0.5 text-2xl font-extrabold text-amber-300">
                {myRank > 0 ? `#${myRank}` : '–'}
              </div>
            </div>
            <div className="rounded-xl border border-ink-700 bg-ink-800/70 p-3 text-center">
              <div className="text-xs uppercase tracking-wide text-slate-400">Mein Beitrag</div>
              <div className="mt-0.5 text-2xl font-extrabold text-brand-300">{myWeeklyTotal}</div>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Mitglieder diese Woche</CardTitle>
          <ul className="mt-3 divide-y divide-ink-700">
            {memberStats.map((m, i) => (
              <li key={m.user_id} className="flex items-center gap-3 py-2.5">
                <span className="w-5 text-center text-xs font-bold text-slate-500">{i + 1}</span>
                <Avatar url={m.avatar_url} name={m.display_name ?? m.username} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-200">
                    {m.display_name ?? m.username}
                    {m.user_id === user?.id && (
                      <span className="ml-1.5 text-xs text-brand-400">(Du)</span>
                    )}
                  </p>
                  {m.role === 'owner' && <p className="text-xs text-amber-400/70">Teamleiter</p>}
                </div>
                <span className="text-sm font-bold text-slate-300">{m.weekly_amount}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardTitle>Wöchentliche Rangliste</CardTitle>
          <ul className="mt-3 divide-y divide-ink-700">
            {leaderboard.map((t, i) => (
              <li key={t.team_id} className="flex items-center gap-3 py-2.5">
                <RankBadge rank={i + 1} />
                <TeamLogo url={t.avatar_url} name={t.name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-200">
                    {t.name}
                    {t.my_team && <span className="ml-1.5 text-xs text-brand-400">✓</span>}
                  </p>
                  <p className="text-xs text-slate-500">{t.member_count} Mitgl.</p>
                </div>
                <span className="text-sm font-bold text-slate-300">{t.weekly_total}</span>
              </li>
            ))}
          </ul>
        </Card>

        <button
          onClick={() => setLeaveOpen(true)}
          className="w-full py-2 text-sm text-rose-400 hover:text-rose-300"
        >
          Team verlassen
        </button>

        <Modal
          open={leaveOpen}
          title="Team verlassen?"
          confirmLabel="Verlassen"
          confirmVariant="danger"
          loading={leaving}
          onClose={() => setLeaveOpen(false)}
          onConfirm={handleLeave}
        >
          Du verlässt „{myTeam.name}". Du kannst danach einem anderen Team beitreten.
        </Modal>

        {/* Edit modal */}
        <TeamFormModal
          open={editOpen}
          title="Team bearbeiten"
          initialName={myTeam.name}
          initialLogoUrl={myTeam.avatar_url}
          onClose={() => setEditOpen(false)}
          onSubmit={async (name, description, logoFile) => {
            let avatar_url = myTeam.avatar_url;
            if (logoFile) {
              const { url, error: upErr } = await uploadTeamLogo(logoFile, myTeam.id);
              if (upErr) { toast.error(upErr); return; }
              avatar_url = url;
            }
            const { error: err } = await updateTeam({ name, description, avatar_url });
            if (err) toast.error(err);
            else { toast.success('Team aktualisiert.'); setEditOpen(false); }
          }}
        />
      </div>
    );
  }

  // ── NO TEAM ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Team suchen …"
            className="w-full rounded-xl border border-ink-600 bg-ink-800 py-2.5 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-500 focus:border-brand-500 focus:outline-none"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ Neu</Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="🛡️" title="Keine Teams gefunden" description="Erstelle das erste Team!" />
      ) : (
        <Card>
          <CardTitle>Alle Teams</CardTitle>
          <ul className="mt-3 divide-y divide-ink-700">
            {filtered.map((t) => (
              <TeamRow
                key={t.team_id}
                team={t}
                rank={leaderboard.indexOf(t) + 1}
                joining={joining === t.team_id}
                onJoin={() => handleJoin(t.team_id)}
              />
            ))}
          </ul>
        </Card>
      )}

      <TeamFormModal
        open={createOpen}
        title="Team erstellen"
        initialName=""
        initialLogoUrl={null}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (name, description, logoFile) => {
          // Create team first (no logo yet)
          const { error: err } = await createTeam(name, description, null);
          if (err) { toast.error(err); return; }

          // If logo selected, upload and update
          if (logoFile) {
            // After createTeam, myTeam is set on next render — get team id from DB directly
            const { data: mem } = await supabase
              .from('team_members')
              .select('team_id')
              .eq('user_id', user?.id ?? '')
              .maybeSingle();
            if (mem) {
              const { url, error: upErr } = await uploadTeamLogo(logoFile, mem.team_id);
              if (!upErr && url) {
                await supabase.from('teams').update({ avatar_url: url }).eq('id', mem.team_id);
                await refetch();
              }
            }
          }

          toast.success('Team erstellt!');
          setCreateOpen(false);
        }}
      />
    </div>
  );
}

// ── Shared team form modal ────────────────────────────────────────────────────
function TeamFormModal({
  open,
  title,
  initialName,
  initialLogoUrl,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initialName: string;
  initialLogoUrl: string | null;
  onClose: () => void;
  onSubmit: (name: string, description: string | null, logoFile: File | null) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(initialLogoUrl);
  const [saving, setSaving] = useState(false);

  // Reset when modal opens
  function handleOpen() {
    setName(initialName);
    setLogoFile(null);
    setLogoPreview(initialLogoUrl);
  }

  async function handleConfirm() {
    if (!name.trim()) return;
    setSaving(true);
    await onSubmit(name.trim(), null, logoFile);
    setSaving(false);
  }

  return (
    <Modal
      open={open}
      title={title}
      confirmLabel={title === 'Team erstellen' ? 'Erstellen' : 'Speichern'}
      loading={saving}
      onClose={onClose}
      onConfirm={handleConfirm}
    >
      <div className="space-y-3 text-left" onLoad={handleOpen}>
        <LogoPicker
          preview={logoPreview}
          onChange={(file) => {
            setLogoFile(file);
            setLogoPreview(URL.createObjectURL(file));
          }}
        />
        <Field label="Teamname" htmlFor="tname">
          <Input
            id="tname"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="z. B. PushUp Legends"
            maxLength={40}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ── Team row (browse) ─────────────────────────────────────────────────────────
function TeamRow({
  team,
  rank,
  joining,
  onJoin,
}: {
  team: TeamLeaderboardRow;
  rank: number;
  joining: boolean;
  onJoin: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <RankBadge rank={rank} />
      <TeamLogo url={team.avatar_url} name={team.name} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-200">{team.name}</p>
        <p className="text-xs text-slate-500">
          {team.member_count} Mitgl. · {team.weekly_total} diese Woche
        </p>
        {team.description && (
          <p className="mt-0.5 truncate text-xs text-slate-400">{team.description}</p>
        )}
      </div>
      <Button size="sm" variant="secondary" loading={joining} onClick={onJoin}>
        Beitreten
      </Button>
    </li>
  );
}

