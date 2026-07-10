import { useMemo, useState } from 'react';
import { useExercise } from '@/context/ExerciseContext';
import { usePodiumHistory } from '@/hooks/usePodiumHistory';
import { useFriends } from '@/hooks/useFriends';
import { useToast } from '@/context/ToastContext';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';

export default function Achievements() {
  const { enrolledExercises, loading: exLoading } = useExercise();
  const pushups = enrolledExercises.find((ex) => ex.slug === 'pushups');
  const { rows, loading, error, refetch } = usePodiumHistory(pushups?.id);
  const { outgoing, sendRequest, cancelRequest } = useFriends();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const outgoingMap = useMemo(
    () => new Map(outgoing.map((o) => [o.receiver.id, o.id])),
    [outgoing],
  );

  async function handleAdd(userId: string) {
    setBusyId(userId);
    const { error: err, status } = await sendRequest(userId);
    setBusyId(null);
    if (err) toast.error(err);
    else if (status === 'accepted') toast.success('Ihr seid jetzt Freunde! 🎉');
    else toast.success('Anfrage gesendet.');
  }

  async function handleCancel(requestId: string, userId: string) {
    setBusyId(userId);
    const { error: err } = await cancelRequest(requestId);
    setBusyId(null);
    if (err) toast.error(err);
  }

  if (exLoading || loading) return <LoadingState label="Lade Erfolge …" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 text-center">
        Täglich werden die globalen Top 3 mit Gold, Silber und Bronze ausgezeichnet.
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="Noch keine Medaillen"
          description="Medaillen werden täglich um Mitternacht vergeben. Die Zählung startete ab dem 6. Juli 2026."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-800/70">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Spieler</span>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              <span className="w-8 text-center">🥇</span>
              <span className="w-8 text-center">🥈</span>
              <span className="w-8 text-center">🥉</span>
              {/* Platzhalter für Friend-Button-Spalte */}
              <span className="w-8" />
            </div>
          </div>

          <ul className="divide-y divide-ink-700">
            {rows.map((row, idx) => {
              const TROPHIES = ['/trophy-gold.png', '/trophy-silver.png', '/trophy-bronze.png'];
              const trophy = TROPHIES[idx] ?? null;
              const outgoingReqId = outgoingMap.get(row.user_id);
              const isBusy = busyId === row.user_id;

              return (
                <li
                  key={row.user_id}
                  className={`flex items-center gap-3 px-4 py-3 ${row.is_me ? 'bg-brand-600/10' : ''}`}
                >
                  {/* Rang / Trophäe */}
                  <span className="w-10 shrink-0 flex items-center justify-center">
                    {trophy
                      ? <img src={trophy} alt={`Platz ${idx + 1}`} className="w-10 h-10 object-contain" />
                      : <span className="text-sm font-bold text-slate-500">{idx + 1}</span>}
                  </span>

                  {/* Avatar */}
                  <Avatar url={row.avatar_url} name={row.display_name || row.username} size={36} />

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-200">
                      {row.display_name || row.username}
                      {row.is_me && <span className="ml-1 text-xs text-brand-300">(du)</span>}
                    </p>
                  </div>

                  {/* Medaillen */}
                  <div className="flex shrink-0 gap-2 items-center">
                    <span className="w-8 text-center text-sm font-bold text-amber-300">{row.gold_count}</span>
                    <span className="w-8 text-center text-sm font-bold text-slate-300">{row.silver_count}</span>
                    <span className="w-8 text-center text-sm font-bold text-orange-400">{row.bronze_count}</span>
                  </div>

                  {/* Freundschafts-Button */}
                  <div className="w-8 shrink-0 flex items-center justify-center">
                    {row.is_me || row.is_friend ? (
                      // Eigener User oder bereits befreundet → nichts anzeigen
                      row.is_friend && !row.is_me ? (
                        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-500/50">
                          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                        </svg>
                      ) : null
                    ) : outgoingReqId ? (
                      /* Anfrage bereits gesendet → zurückziehbar */
                      <button
                        onClick={() => handleCancel(outgoingReqId, row.user_id)}
                        disabled={isBusy}
                        title="Anfrage zurückziehen"
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-ink-700 text-slate-400
                          hover:bg-rose-500/20 hover:text-rose-400 transition disabled:opacity-40"
                      >
                        {isBusy ? (
                          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                            <path d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z"/>
                          </svg>
                        )}
                      </button>
                    ) : (
                      /* Noch kein Freund → Anfrage senden */
                      <button
                        onClick={() => handleAdd(row.user_id)}
                        disabled={isBusy}
                        title="Freundschaftsanfrage senden"
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600
                          text-white hover:bg-brand-500 transition shadow disabled:opacity-40"
                      >
                        {isBusy ? (
                          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                          </svg>
                        ) : (
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z"/>
                          </svg>
                        )}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
