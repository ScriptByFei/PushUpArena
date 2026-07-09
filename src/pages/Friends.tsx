import { useMemo, useState, useEffect } from 'react';
import { useFriends, type FriendProfile } from '@/hooks/useFriends';
import { useToast } from '@/context/ToastContext';
import { useExercise } from '@/context/ExerciseContext';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState } from '@/components/ui/States';
import { CheckIcon, XIcon } from '@/components/ui/icons';
import type { LeaderboardRow } from '@/lib/database.types';

// ─── helpers ────────────────────────────────────────────────────────────────

function ActivityDot({ active }: { active: boolean }) {
  return (
    <span
      className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-ink-900 ${
        active ? 'bg-emerald-400' : 'bg-slate-600'
      }`}
    />
  );
}

function getStatusText(todayAmount: number, currentStreak: number): string {
  if (todayAmount > 0) return 'Heute trainiert';
  if (currentStreak > 0) return 'Gestern trainiert';
  return 'Noch nicht aktiv';
}

// ─── sub-components ─────────────────────────────────────────────────────────

function StatsCard({
  friendCount,
  activeFriends,
  streakCount,
  activeAvatars,
  onShowActive,
}: {
  friendCount: number;
  activeFriends: number;
  streakCount: number;
  activeAvatars: LeaderboardRow[];
  onShowActive: () => void;
}) {
  const shown = activeAvatars.slice(0, 6);
  const overflow = activeAvatars.length - shown.length;

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-800 p-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 divide-x divide-ink-700">
        <div className="flex items-center gap-2 pr-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600/20">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-brand-400">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
          <div>
            <p className="text-xl font-extrabold text-slate-100">{friendCount}</p>
            <p className="text-xs text-slate-500">Freunde</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/20">
            <span className="text-lg">🔥</span>
          </div>
          <div>
            <p className="text-xl font-extrabold text-slate-100">{activeFriends}</p>
            <p className="text-xs text-slate-500">heute aktiv</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-yellow-500/20">
            <span className="text-lg">⚡</span>
          </div>
          <div>
            <p className="text-xl font-extrabold text-slate-100">{streakCount}</p>
            <p className="text-xs text-slate-500">Streaks laufen</p>
          </div>
        </div>
      </div>

      {/* Active friend avatars */}
      {activeAvatars.length > 0 && (
        <button
          onClick={onShowActive}
          className="mt-4 flex w-full items-center justify-between"
        >
          <div className="flex items-center">
            {shown.map((r, i) => (
              <div
                key={r.user_id}
                className="relative"
                style={{ marginLeft: i === 0 ? 0 : -10, zIndex: shown.length - i }}
              >
                <Avatar
                  url={r.avatar_url}
                  name={r.display_name || r.username}
                  size={36}
                  className="ring-2 ring-ink-800"
                />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-ink-800 bg-emerald-400" />
              </div>
            ))}
            {overflow > 0 && (
              <div
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-ink-700 ring-2 ring-ink-800 text-xs font-bold text-slate-300"
                style={{ marginLeft: -10, zIndex: 0 }}
              >
                +{overflow}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 text-sm text-slate-400">
            <span>Deine aktiven Freunde heute</span>
            <span className="text-slate-500">›</span>
          </div>
        </button>
      )}
    </div>
  );
}

function DiscoverCard({
  profile,
  streak,
  isOutgoing,
  isIncoming,
  busy,
  onAdd,
  onCancel,
}: {
  profile: FriendProfile;
  streak: number;
  isOutgoing: boolean;
  isIncoming: boolean;
  busy: boolean;
  onAdd: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex w-36 shrink-0 flex-col items-center rounded-2xl border border-ink-700 bg-ink-800 p-3 gap-2">
      <div className="relative">
        <Avatar url={profile.avatar_url} name={profile.display_name || profile.username} size={56} />
      </div>
      <div className="w-full text-center">
        <p className="truncate text-sm font-bold text-slate-100">
          {profile.display_name || profile.username}
        </p>
        {streak > 0 && (
          <p className="mt-0.5 text-xs text-slate-500">🔥 Streak {streak}</p>
        )}
      </div>
      {isOutgoing ? (
        <button
          onClick={onCancel}
          disabled={busy}
          className="w-full rounded-xl bg-ink-700 py-1.5 text-xs font-semibold text-slate-400 hover:bg-ink-600 transition-colors disabled:opacity-40"
        >
          Zurückziehen
        </button>
      ) : isIncoming ? (
        <span className="text-xs text-slate-500 py-1.5">Anfrage erhalten</span>
      ) : (
        <button
          onClick={onAdd}
          disabled={busy}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-500 transition-colors disabled:opacity-40 shadow"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function FriendRow({
  rank,
  friend,
  stats,
  onRemove,
}: {
  rank: number;
  friend: FriendProfile;
  stats?: LeaderboardRow;
  onRemove: () => void;
}) {
  const todayAmount = stats?.today_amount ?? 0;
  const streak = stats?.current_streak ?? 0;
  const statusText = getStatusText(todayAmount, streak);
  const isActiveToday = todayAmount > 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-500">{rank}</span>
      <div className="relative shrink-0">
        <Avatar url={friend.avatar_url} name={friend.display_name || friend.username} size={40} />
        <ActivityDot active={isActiveToday} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-100">
          {friend.display_name || friend.username}
        </p>
        <p className={`text-xs ${isActiveToday ? 'text-emerald-400' : 'text-slate-500'}`}>
          {statusText}
        </p>
      </div>
      {streak > 0 && (
        <span className="shrink-0 text-xs font-semibold text-orange-400">🔥 {streak}</span>
      )}
      <div className="shrink-0 text-right">
        <p className="text-base font-extrabold text-brand-300">{todayAmount}</p>
        <p className="text-xs text-slate-600">heute</p>
      </div>
      <button
        onClick={onRemove}
        className="shrink-0 text-slate-600 hover:text-slate-400 transition-colors"
        aria-label="Freund entfernen"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd"/>
        </svg>
      </button>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function Friends() {
  const { user } = useAuth();
  const {
    friends, incoming, outgoing, allUsers,
    loading, error, refetch,
    sendRequest, respond, cancelRequest, removeFriend,
  } = useFriends();
  const toast = useToast();
  const { exercise: activeExercise } = useExercise();
  const { rows: leaderRows } = useLeaderboard(activeExercise?.id);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FriendProfile | null>(null);
  const [showAllDiscover, setShowAllDiscover] = useState(false);
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [activeModalOpen, setActiveModalOpen] = useState(false);

  // Streak data for non-friends (discover section)
  const [discoverStreaks, setDiscoverStreaks] = useState<Map<string, number>>(new Map());

  const friendIds = useMemo(() => new Set(friends.map(f => f.friend.id)), [friends]);
  const outgoingIds = useMemo(() => new Set(outgoing.map(o => o.receiver.id)), [outgoing]);
  const incomingIds = useMemo(() => new Set(incoming.map(i => i.sender.id)), [incoming]);

  // Leaderboard stats map (by user_id)
  const statsMap = useMemo(() => {
    const m = new Map<string, LeaderboardRow>();
    leaderRows.forEach(r => m.set(r.user_id, r));
    return m;
  }, [leaderRows]);

  // Derived stats
  const activeFriendsToday = useMemo(() =>
    leaderRows.filter(r => r.today_amount > 0 && r.user_id !== user?.id),
    [leaderRows, user?.id]
  );
  const streakCount = useMemo(() =>
    friends.filter(f => (statsMap.get(f.friend.id)?.current_streak ?? 0) > 0).length,
    [friends, statsMap]
  );

  // Ranked friends (by today_amount)
  const rankedFriends = useMemo(() =>
    [...friends].sort((a, b) =>
      (statsMap.get(b.friend.id)?.today_amount ?? 0) -
      (statsMap.get(a.friend.id)?.today_amount ?? 0)
    ),
    [friends, statsMap]
  );

  const shownFriends = showAllFriends ? rankedFriends : rankedFriends.slice(0, 5);

  // Non-friends for discover
  const nonFriends = useMemo(() =>
    allUsers.filter(u => !friendIds.has(u.id)),
    [allUsers, friendIds]
  );
  const shownDiscover = showAllDiscover ? nonFriends : nonFriends.slice(0, 8);

  // Fetch streak data for discover users
  useEffect(() => {
    if (!shownDiscover.length) return;
    const ids = shownDiscover.map(u => u.id);
    supabase.from('profiles').select('id, current_streak')
      .in('id', ids)
      .then(({ data }) => {
        const m = new Map<string, number>();
        data?.forEach(p => m.set(p.id, (p as Record<string, unknown>).current_streak as number ?? 0));
        setDiscoverStreaks(m);
      });
  }, [shownDiscover]);

  async function handleSend(id: string) {
    setBusyId(id);
    const { error: err, status } = await sendRequest(id);
    setBusyId(null);
    if (err) toast.error(err);
    else if (status === 'accepted') toast.success('Ihr seid jetzt Freunde! 🎉');
    else toast.success('Anfrage gesendet.');
  }

  async function handleCancel(requestId: string) {
    setBusyId(requestId);
    const { error: err } = await cancelRequest(requestId);
    setBusyId(null);
    if (err) toast.error(err);
  }

  async function onInvite() {
    const url = window.location.origin;
    const text = `Tritt mir auf PushupArena bei: ${url}`;
    try {
      if (navigator.share) await navigator.share({ title: 'PushupArena', text, url });
      else { await navigator.clipboard.writeText(text); toast.success('Link kopiert.'); }
    } catch { /* abgebrochen */ }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <div className="space-y-6 pb-4">

      {/* ── Stats + Aktive Freunde ─────────────────────────────────── */}
      <StatsCard
        friendCount={friends.length}
        activeFriends={activeFriendsToday.length}
        streakCount={streakCount}
        activeAvatars={activeFriendsToday}
        onShowActive={() => setActiveModalOpen(true)}
      />

      {/* ── Eingehende Anfragen ───────────────────────────────────── */}
      {incoming.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-bold text-slate-100">
            Anfragen <span className="ml-1 rounded-full bg-brand-600 px-2 py-0.5 text-xs">{incoming.length}</span>
          </h2>
          <div className="divide-y divide-ink-700 overflow-hidden rounded-2xl border border-ink-700 bg-ink-800">
            {incoming.map(req => (
              <div key={req.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar url={req.sender.avatar_url} name={req.sender.display_name || req.sender.username} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {req.sender.display_name || req.sender.username}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    loading={busyId === req.id}
                    onClick={async () => {
                      setBusyId(req.id);
                      const { error: err } = await respond(req.id, true);
                      setBusyId(null);
                      if (err) toast.error(err);
                      else toast.success('Freund hinzugefügt! 🎉');
                    }}
                  >
                    <CheckIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      const { error: err } = await respond(req.id, false);
                      if (err) toast.error(err);
                    }}
                  >
                    <XIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Nutzer entdecken ──────────────────────────────────────── */}
      {nonFriends.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-100">Nutzer entdecken</h2>
            {nonFriends.length > 8 && (
              <button
                onClick={() => setShowAllDiscover(v => !v)}
                className="text-sm font-semibold text-brand-400 hover:text-brand-300"
              >
                {showAllDiscover ? 'Weniger' : 'Alle anzeigen'} ›
              </button>
            )}
          </div>
          <div className={`flex gap-3 ${showAllDiscover ? 'flex-wrap' : 'overflow-x-auto pb-2'}`}>
            {shownDiscover.map(u => {
              const outReq = outgoing.find(o => o.receiver.id === u.id);
              return (
                <DiscoverCard
                  key={u.id}
                  profile={u}
                  streak={discoverStreaks.get(u.id) ?? 0}
                  isOutgoing={outgoingIds.has(u.id)}
                  isIncoming={incomingIds.has(u.id)}
                  busy={busyId === u.id || busyId === outReq?.id}
                  onAdd={() => handleSend(u.id)}
                  onCancel={() => outReq && handleCancel(outReq.id)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ── Meine Freunde ─────────────────────────────────────────── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-100">Meine Freunde</h2>
          {rankedFriends.length > 5 && (
            <button
              onClick={() => setShowAllFriends(v => !v)}
              className="text-sm font-semibold text-brand-400 hover:text-brand-300"
            >
              {showAllFriends ? 'Weniger' : 'Alle anzeigen'} ›
            </button>
          )}
        </div>
        {friends.length === 0 ? (
          <div className="rounded-2xl border border-ink-700 bg-ink-800 px-4 py-8 text-center">
            <p className="text-2xl">🤝</p>
            <p className="mt-2 text-sm font-semibold text-slate-300">Noch keine Freunde</p>
            <p className="mt-1 text-xs text-slate-500">Entdecke Nutzer oben und sende ihnen eine Anfrage.</p>
          </div>
        ) : (
          <div className="divide-y divide-ink-700 overflow-hidden rounded-2xl border border-ink-700 bg-ink-800">
            {shownFriends.map((f, i) => (
              <FriendRow
                key={f.friend.id}
                rank={i + 1}
                friend={f.friend}
                stats={statsMap.get(f.friend.id)}
                onRemove={() => setRemoveTarget(f.friend)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Freunde einladen ──────────────────────────────────────── */}
      <div className="flex items-center gap-4 rounded-2xl border border-ink-700 bg-ink-800 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600/20">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-brand-400">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-100">Freunde einladen</p>
          <p className="text-xs text-slate-500">Fordere deine Freunde heraus und vergleicht eure Fortschritte.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={onInvite}
            className="rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white hover:bg-brand-500 transition-colors"
          >
            Einladen
          </button>
          <button
            onClick={onInvite}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-700 text-slate-400 hover:bg-ink-600 transition-colors"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M13 4.5a2.5 2.5 0 1 1 .702 1.737L6.97 9.604a2.518 2.518 0 0 1 0 .792l6.733 3.367a2.5 2.5 0 1 1-.671 1.341l-6.733-3.367a2.5 2.5 0 1 1 0-3.474l6.733-3.366A2.52 2.52 0 0 1 13 4.5Z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Modal: Aktive Freunde ──────────────────────────────────── */}
      <Modal
        open={activeModalOpen}
        title={`Aktive Freunde heute (${activeFriendsToday.length})`}
        onClose={() => setActiveModalOpen(false)}
      >
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {activeFriendsToday.map(r => (
            <div key={r.user_id} className="flex items-center gap-3 py-1">
              <div className="relative shrink-0">
                <Avatar url={r.avatar_url} name={r.display_name || r.username} size={36} />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-ink-900 bg-emerald-400" />
              </div>
              <p className="flex-1 text-sm font-semibold text-slate-200">{r.display_name || r.username}</p>
              <span className="text-sm font-bold text-brand-300">{r.today_amount} heute</span>
            </div>
          ))}
        </div>
      </Modal>

      {/* ── Modal: Freund entfernen ────────────────────────────────── */}
      <Modal
        open={!!removeTarget}
        title="Freund entfernen?"
        confirmLabel="Entfernen"
        confirmVariant="danger"
        onClose={() => setRemoveTarget(null)}
        onConfirm={async () => {
          if (!removeTarget) return;
          const { error: err } = await removeFriend(removeTarget.id);
          if (err) toast.error(err);
          else toast.success('Freund entfernt.');
          setRemoveTarget(null);
        }}
      >
        Du entfernst <strong>{removeTarget?.display_name || removeTarget?.username}</strong> aus deiner
        Freundesliste.
      </Modal>
    </div>
  );
}
