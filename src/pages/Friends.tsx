import { FormEvent, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFriends, type FriendProfile } from '@/hooks/useFriends';
import { useProfile } from '@/hooks/useProfile';
import { useToast } from '@/context/ToastContext';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { Modal } from '@/components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { SearchIcon, CheckIcon, XIcon, UserIcon, ShareIcon } from '@/components/ui/icons';

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
        <p className="truncate text-xs text-slate-400">@{profile.username}</p>
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
    loading,
    error,
    refetch,
    searchUsers,
    sendRequest,
    respond,
    cancelRequest,
    removeFriend,
  } = useFriends();
  const { profile } = useProfile();
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendProfile[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<FriendProfile | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  function focusSearch() {
    searchRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchRef.current?.focus();
  }

  async function onInvite() {
    const url = window.location.origin;
    const uname = profile?.username ?? '';
    const text = `Tritt mir auf PushupArena bei und such mich als @${uname}: ${url}`;
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
  const pendingIds = useMemo(
    () => new Set([...outgoing.map((o) => o.receiver.id), ...incoming.map((i) => i.sender.id)]),
    [outgoing, incoming],
  );

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (query.trim().length < 2) {
      toast.error('Bitte mindestens 2 Zeichen eingeben.');
      return;
    }
    setSearching(true);
    const res = await searchUsers(query);
    setResults(res);
    setSearching(false);
  }

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
      {/* Suche */}
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Freunde finden</CardTitle>
          <button
            onClick={onInvite}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-400 hover:text-brand-300"
          >
            <ShareIcon className="h-4 w-4" />
            Einladen
          </button>
        </div>
        <form onSubmit={onSearch} className="mt-3 flex gap-2">
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Username suchen …"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <Button type="submit" loading={searching} aria-label="Suchen">
            <SearchIcon className="h-5 w-5" />
          </Button>
        </form>

        {results !== null && (
          <div className="mt-3">
            {results.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">
                Keine suchbaren Nutzer gefunden.
              </p>
            ) : (
              <ul className="divide-y divide-ink-700">
                {results.map((p) => {
                  const isFriend = friendIds.has(p.id);
                  const isPending = pendingIds.has(p.id);
                  return (
                    <PersonRow key={p.id} profile={p}>
                      {isFriend ? (
                        <span className="text-xs text-emerald-400">Freund ✓</span>
                      ) : isPending ? (
                        <span className="text-xs text-slate-400">Ausstehend …</span>
                      ) : (
                        <Button
                          size="sm"
                          loading={busyId === p.id}
                          onClick={() => handleSend(p.id)}
                        >
                          Hinzufügen
                        </Button>
                      )}
                    </PersonRow>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </Card>

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : (
        <>
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

          {/* Freundesliste */}
          <Card>
            <CardTitle>Meine Freunde ({friends.length})</CardTitle>
            {friends.length === 0 ? (
              <EmptyState
                icon="🤝"
                title="Noch keine Freunde"
                description="Suche nach Usernamen und sende Anfragen – oder lade jemanden ein."
                action={
                  <Button size="sm" onClick={focusSearch}>
                    Freunde suchen
                  </Button>
                }
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
            )}
          </Card>
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
        Du entfernst <strong>@{removeTarget?.username}</strong> aus deiner Freundesliste. Ihr seht
        dann die Vergleichsdaten des jeweils anderen nicht mehr.
      </Modal>
    </div>
  );
}
