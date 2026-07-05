import { useMemo, useState, useEffect, type ReactNode } from 'react';
import { useFriends, type FriendProfile } from '@/hooks/useFriends';
import { useToast } from '@/context/ToastContext';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { supabase } from '@/lib/supabase';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { CheckIcon, XIcon, UserIcon, ShareIcon } from '@/components/ui/icons';

type ActiveRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  today_amount: number;
  is_me: boolean;
  is_friend: boolean;
};

function PersonRow({
  profile,
  children,
}: {
  profile: FriendProfile;
  children?: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <Avatar url={profile.avatar_url} name={profile.display_name || profile.username} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-200">
          {profile.display_name || profile.username}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </li>
  );
}

export default function Friends() {
  const {
    friends,
    incoming,
    outgoing,
    allUsers,
    loading,
    error,
    refetch,
    sendRequest,
    respond,
    cancelRequest,
    removeFriend,
  } = useFriends();
  const toast = useToast();
  const { exercise: activeExercise, enrolledExercises } = useExercise();
  // Lokale Übungsauswahl nur für die Member-Kachel
  const [memberExercise, setMemberExercise] = useState<typeof activeExercise>(null);
  const shownExercise = memberExercise ?? activeExercise;
  // Filter-Modus: alle aktiven User oder nur Freunde
  const [memberFilter, setMemberFilter] = useState<'all' | 'friends'>('friends');

  // Freunde-Leaderboard (nur Freunde + ich)
  const { rows: leaderRows } = useLeaderboard(shownExercise?.id);
  const friendMembers = [...leaderRows]
    .filter((r) => r.today_amount > 0)
    .sort((a, b) => b.today_amount - a.today_amount);

  // Alle aktiven User (neue Funktion)
  const [allActiveRows, setAllActiveRows] = useState<ActiveRow[]>([]);
  const [allActiveLoading, setAllActiveLoading] = useState(false);

  useEffect(() => {
    if (!shownExercise?.id) return;
    setAllActiveLoading(true);
    void (async () => {
      const { data } = await supabase.rpc('get_all_active_today', { p_exercise: shownExercise.id });
      setAllActiveRows((data ?? []) as ActiveRow[]);
      setAllActiveLoading(false);
    })();
  }, [shownExercise?.id]);

  const activeMembers = memberFilter === 'friends' ? friendMembers : allActiveRows;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FriendProfile | null>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [pushersOpen, setPushersOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);

  async function onInvite() {
    const url = window.location.origin;
    const text = `Tritt mir auf PushupArena bei: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'PushupArena', text, url });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success('Einladungstext kopiert.');
      }
    } catch {
      /* vom Nutzer abgebrochen */
    }
  }

  const friendIds = useMemo(() => new Set(friends.map((f) => f.friend.id)), [friends]);
  const outgoingIds = useMemo(() => new Set(outgoing.map((o) => o.receiver.id)), [outgoing]);
  const incomingIds = useMemo(() => new Set(incoming.map((i) => i.sender.id)), [incoming]);

  async function handleSend(id: string) {
    setBusyId(id);
    const { error: err, status } = await sendRequest(id);
    setBusyId(null);
    if (err) toast.error(err);
    else if (status === 'accepted') toast.success('Ihr seid jetzt Freunde! 🎉');
    else if (status === 'already_friends') toast.notify('Ihr seid bereits Freunde.');
    else toast.success('Anfrage gesendet.');
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : (
        <>
          {/* Aktive Member heute — ganz oben */}
          <Card>
            <button
              className="flex w-full items-center justify-between"
              onClick={() => setPushersOpen((o) => !o)}
              aria-expanded={pushersOpen}
            >
              <div className="flex items-center gap-2">
                <CardTitle>Aktive Member heute</CardTitle>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  activeMembers.length > 0
                    ? 'bg-brand-600/30 text-brand-300'
                    : 'bg-ink-700 text-slate-500'
                }`}>
                  {activeMembers.length > 0 ? `🔥 ${activeMembers.length}` : '0'}
                </span>
              </div>
              <span className={`text-lg text-slate-400 transition-transform duration-200 leading-none ${pushersOpen ? 'rotate-180' : ''}`}>
                ▾
              </span>
            </button>
            {pushersOpen && (
              <>
                {/* Freunde / Alle Toggle */}
                <div className="mt-3 flex w-full rounded-xl bg-ink-950/60 p-1">
                  {(['friends', 'all'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setMemberFilter(f)}
                      className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                        memberFilter === f ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {f === 'friends' ? '👥 Freunde' : '🌍 Alle'}
                    </button>
                  ))}
                </div>

                {/* Übungs-Switcher (nur wenn >1 eingeschrieben) */}
                {enrolledExercises.length > 1 && (
                  <div className="mt-2 flex w-full rounded-xl bg-ink-950/60 p-1 gap-1">
                    {enrolledExercises.map((ex) => {
                      const isActive = ex.id === shownExercise?.id;
                      return (
                        <button
                          key={ex.id}
                          onClick={() => setMemberExercise(ex)}
                          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold transition ${
                            isActive ? 'bg-brand-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <img src={EXERCISE_ICONS[ex.slug] ?? '/pushup-icon.png'} alt={ex.name} className="h-4 w-4 rounded object-cover" />
                          {ex.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {allActiveLoading && memberFilter === 'all' ? (
                  <p className="mt-3 text-center text-xs text-slate-500">Lade …</p>
                ) : activeMembers.length === 0 ? (
                  <p className="mt-3 text-center text-sm text-slate-500">
                    Noch niemand aktiv — sei der Erste! 💪
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-ink-700">
                    {activeMembers.map((p) => (
                      <li key={p.user_id} className="flex items-center gap-3 py-3">
                        <Avatar
                          url={p.avatar_url}
                          name={p.display_name || p.username}
                          size={40}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-200">
                            {p.display_name || p.username}
                            {p.is_me && <span className="ml-1 text-xs text-brand-300">(du)</span>}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {/* Freundschafts-Aktion */}
                          {!p.is_me && 'is_friend' in p && (
                            p.is_friend ? (
                              /* Bereits Freund — Checkmark */
                              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-brand-400" aria-label="Freund">
                                <path d="M9 12.5l-3-3 1.06-1.06L9 10.38l4.94-4.94L15 6.5 9 12.5z"/>
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 110-12 6 6 0 010 12z" clipRule="evenodd"/>
                              </svg>
                            ) : outgoingIds.has(p.user_id) ? (
                              <span className="text-xs text-slate-500">Gesendet</span>
                            ) : incomingIds.has(p.user_id) ? (
                              <span className="text-xs text-slate-500">Eingehend</span>
                            ) : (
                              /* Anfrage senden */
                              <button
                                onClick={() => handleSend(p.user_id)}
                                disabled={busyId === p.user_id}
                                aria-label="Freundschaftsanfrage senden"
                                className="rounded-lg p-1 text-slate-400 hover:bg-ink-700 hover:text-brand-300 transition-colors disabled:opacity-40"
                              >
                                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                                  <path d="M11 5a3 3 0 11-6 0 3 3 0 016 0zM2.615 16.428a1.224 1.224 0 01-.569-1.175 6.002 6.002 0 0111.908 0c.058.467-.172.92-.57 1.174A9.953 9.953 0 018 18a9.953 9.953 0 01-5.385-1.572zM16.25 5.75a.75.75 0 00-1.5 0v2h-2a.75.75 0 000 1.5h2v2a.75.75 0 001.5 0v-2h2a.75.75 0 000-1.5h-2v-2z"/>
                                </svg>
                              </button>
                            )
                          )}
                          <img
                            src={shownExercise ? (EXERCISE_ICONS[shownExercise.slug] ?? '/pushup-icon.png') : '/pushup-icon.png'}
                            alt=""
                            className="h-5 w-5 rounded object-cover opacity-70"
                          />
                          <span className="text-base font-extrabold text-brand-300">
                            {p.today_amount}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>

          {/* Eingehende Anfragen */}
          {incoming.length > 0 && (
            <Card>
              <CardTitle>Anfragen ({incoming.length})</CardTitle>
              <ul className="mt-2 divide-y divide-ink-700">
                {incoming.map((req) => (
                  <PersonRow key={req.id} profile={req.sender}>
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
                      aria-label="Annehmen"
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
                      aria-label="Ablehnen"
                    >
                      <XIcon className="h-4 w-4" />
                    </Button>
                  </PersonRow>
                ))}
              </ul>
            </Card>
          )}

          {/* Gesendete Anfragen */}
          {outgoing.length > 0 && (
            <Card>
              <CardTitle>Gesendet ({outgoing.length})</CardTitle>
              <ul className="mt-2 divide-y divide-ink-700">
                {outgoing.map((req) => (
                  <PersonRow key={req.id} profile={req.receiver}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        const { error: err } = await cancelRequest(req.id);
                        if (err) toast.error(err);
                      }}
                    >
                      Zurückziehen
                    </Button>
                  </PersonRow>
                ))}
              </ul>
            </Card>
          )}

          {/* Nutzer entdecken — einklappbar */}
          {allUsers.filter((p) => !friendIds.has(p.id)).length > 0 && (
            <Card>
              <button
                className="flex w-full items-center justify-between"
                onClick={() => setDiscoverOpen((o) => !o)}
                aria-expanded={discoverOpen}
              >
                <CardTitle>Nutzer entdecken</CardTitle>
                <span className={`text-lg text-slate-400 transition-transform duration-200 leading-none ${discoverOpen ? 'rotate-180' : ''}`}>
                  ▾
                </span>
              </button>
              {discoverOpen && (
                <ul className="mt-2 divide-y divide-ink-700">
                  {allUsers.filter((p) => !friendIds.has(p.id)).map((p) => {
                    const isFriend = friendIds.has(p.id);
                    const isOutgoing = outgoingIds.has(p.id);
                    const isIncoming = incomingIds.has(p.id);
                    return (
                      <PersonRow key={p.id} profile={p}>
                        {isFriend ? (
                          <span className="text-xs font-medium text-emerald-400">Freund ✓</span>
                        ) : isOutgoing ? (
                          <span className="text-xs text-slate-400">Anfrage gesendet</span>
                        ) : isIncoming ? (
                          <span className="text-xs text-slate-400">Anfrage erhalten</span>
                        ) : (
                          <Button
                            size="sm"
                            loading={busyId === p.id}
                            onClick={() => handleSend(p.id)}
                          >
                            Adden
                          </Button>
                        )}
                      </PersonRow>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {/* Freundesliste – einklappbar */}
          <Card>
            <button
              className="flex w-full items-center justify-between"
              onClick={() => setFriendsOpen((o) => !o)}
              aria-expanded={friendsOpen}
            >
              <CardTitle>Meine Freunde ({friends.length})</CardTitle>
              <span className={`text-lg text-slate-400 transition-transform duration-200 leading-none ${friendsOpen ? 'rotate-180' : ''}`}>
                ▾
              </span>
            </button>
            {friendsOpen && (
              friends.length === 0 ? (
                <EmptyState
                  icon="🤝"
                  title="Noch keine Freunde"
                  description="Entdecke Nutzer weiter unten und sende ihnen eine Anfrage."
                />
              ) : (
                <ul className="mt-2 divide-y divide-ink-700">
                  {friends.map((f) => (
                    <PersonRow key={f.friend.id} profile={f.friend}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setRemoveTarget(f.friend)}
                        aria-label="Entfernen"
                      >
                        <UserIcon className="h-4 w-4" />
                        <span className="text-rose-300">Entfernen</span>
                      </Button>
                    </PersonRow>
                  ))}
                </ul>
              )
            )}
          </Card>

          {/* Einladen */}
          <button
            onClick={onInvite}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-600 bg-ink-800/40 py-3 text-sm font-medium text-brand-400 hover:border-brand-500 hover:bg-ink-800/70 transition-colors"
          >
            <ShareIcon className="h-4 w-4" />
            Freunde einladen
          </button>

        </>
      )}

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
        Du entfernst <strong>{removeTarget?.display_name || removeTarget?.username}</strong> aus deiner Freundesliste. Ihr seht
        dann die Vergleichsdaten des jeweils anderen nicht mehr.
      </Modal>
    </div>
  );
}
