import { useState, useEffect, useRef } from 'react';
import { useExercise } from '@/context/ExerciseContext';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useGlobalLeaderboard } from '@/hooks/useGlobalLeaderboard';
import { Avatar } from '@/components/ui/Avatar';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/States';
import { supabase } from '@/lib/supabase';
import type { LeaderboardRow, GlobalLeaderboardRow } from '@/lib/database.types';
import { UserInfoSheet } from '@/components/UserInfoSheet';
import { UserPlusIcon } from '@/components/ui/icons';

type ViewMode = 'friends' | 'global';

const TABS = [
  { key: 'today_amount' as const, label: 'Heute', icon: '', iconSrc: undefined as string | undefined },
  { key: 'total_amount' as const, label: 'Gesamt', icon: '', iconSrc: undefined as string | undefined },
];

// Reihenfolge: P2 links, P1 Mitte (elevated), P3 rechts
const PODIUM_SLOTS = [
  {
    rowIdx: 1,
    medal: '🥈',
    border: 'border-slate-500',
    bg: 'bg-slate-800/60',
    valueColor: 'text-slate-200',
    nameColor: 'text-slate-200',
    avatarSize: 40,
    mt: 'mt-6',
  },
  {
    rowIdx: 0,
    medal: '🥇',
    border: 'border-amber-400',
    bg: 'bg-amber-500/10',
    valueColor: 'text-amber-300',
    nameColor: 'text-amber-100',
    avatarSize: 52,
    mt: '',
  },
  {
    rowIdx: 2,
    medal: '🥉',
    border: 'border-orange-700',
    bg: 'bg-orange-900/10',
    valueColor: 'text-orange-300',
    nameColor: 'text-slate-200',
    avatarSize: 40,
    mt: 'mt-8',
  },
] as const;


const CUSTOM_MEDAL_SLUGS = ['pushups'];

function MedalIcon({ medal, size = 28, useCustom = true }: { medal: string; size?: number; useCustom?: boolean }) {
  if (useCustom && medal === '🥇') {
    return <img src="/medal-gold.png" alt="🥇" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (useCustom && medal === '🥈') {
    return <img src="/medal-silver.png" alt="🥈" style={{ width: size, height: size }} className="object-contain" />;
  }
  if (useCustom && medal === '🥉') {
    return <img src="/medal-bronze.png" alt="🥉" style={{ width: size, height: size }} className="object-contain" />;
  }
  return <span style={{ fontSize: size }} className="leading-none">{medal}</span>;
}

// ── Heutige Sätze Bottom Sheet ────────────────────────────────────────────────
interface TodaySetsSheetProps {
  row: LeaderboardRow;
  exerciseId: string;
  onClose: () => void;
}

function TodaySetsSheet({ row, exerciseId, onClose }: TodaySetsSheetProps) {
  const [sets, setSets] = useState<number[] | null>(null);
  const [loading, setLoading] = useState(true);
  const name = row.display_name || row.username;

  // Fetch on mount
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await supabase.rpc('get_friend_today_sets', {
          p_user_id: row.user_id,
          p_exercise: exerciseId,
        });
        setSets((data ?? []).map((r) => r.amount));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Sheet */}
      <div
        className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />

        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <Avatar url={row.avatar_url} name={name} size={40} />
          <div>
            <p className="font-semibold text-slate-100">{name}</p>
            <p className="text-xs text-slate-400">Heutige Sätze</p>
          </div>
          <span className="ml-auto text-2xl font-extrabold text-brand-300">
            {row.today_amount}
          </span>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-slate-500">Lade …</p>
        ) : !sets || sets.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Keine Einträge heute</p>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${Math.min(sets.length, 5)}, 1fr)` }}
          >
            {sets.map((amount, i) => (
              <div
                key={i}
                className="flex flex-col items-center rounded-xl bg-ink-800 px-2 py-2 text-center"
              >
                <span className="text-[10px] text-slate-500">Satz {i + 1}</span>
                <span className="text-base font-extrabold text-brand-300">{amount}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Kompakt-Dropdown ─────────────────────────────────────────────────────────
interface FilterOption<T> { key: T; label: string; icon: string; }

function FilterDropdown<T extends string>({
  value, options, onChange, className = '',
}: {
  value: T;
  options: FilterOption<T>[];
  onChange: (val: T) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.key === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-[44px] w-full items-center gap-2 rounded-xl border border-ink-700 bg-ink-800/70 px-3 transition hover:bg-ink-700 active:scale-[0.98]"
      >
        <span className="text-base leading-none">{selected.icon}</span>
        <span className="flex-1 truncate text-left text-[13px] font-semibold text-slate-100">
          {selected.label}
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor"
          className={`h-3.5 w-3.5 shrink-0 text-slate-400/70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="animate-pop-in absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-ink-700 bg-ink-800 shadow-xl">
          {options.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { onChange(opt.key); setOpen(false); }}
              className={`flex w-full items-center gap-3 px-4 py-3 transition ${
                opt.key === value ? 'bg-brand-600/20 text-brand-300' : 'text-slate-300 hover:bg-ink-700'
              }`}
            >
              <span className="text-base leading-none">{opt.icon}</span>
              <span className="text-sm font-semibold">{opt.label}</span>
              {opt.key === value && (
                <svg viewBox="0 0 20 20" fill="currentColor" className="ml-auto h-4 w-4">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hauptseite ────────────────────────────────────────────────────────────────
export default function Leaderboard() {
  const { exercise: activeExercise, loading: exLoading } = useExercise();
  const [viewMode, setViewMode] = useState<ViewMode>('friends');
  const { rows: friendRows, loading: friendLoading, error: friendError, refetch: refetchFriends, sortKey, setSortKey } = useLeaderboard(activeExercise?.id);
  const { rows: globalRows, loading: globalLoading, error: globalError, refetch: refetchGlobal } = useGlobalLeaderboard(activeExercise?.id);
  const [infoSheet, setInfoSheet] = useState<{ userId: string; displayName: string; avatarUrl: string | null } | null>(null);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [requestFeedback, setRequestFeedback] = useState<{ userId: string; ok: boolean } | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const isGlobal = viewMode === 'global';
  const rows = isGlobal ? globalRows : friendRows;
  const loading = isGlobal ? globalLoading : friendLoading;
  const error = isGlobal ? globalError : friendError;
  const refetch = isGlobal ? refetchGlobal : refetchFriends;

  if (exLoading || loading) return <LoadingState label="Lade Rangliste …" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const hasPodium = rows.length >= 3;
  const sortLabel = isGlobal ? 'Heute' : (TABS.find((t) => t.key === sortKey)?.label ?? '');
  const displaySortKey: 'today_amount' | 'total_amount' = isGlobal ? 'today_amount' : sortKey;

  function handleTap(row: LeaderboardRow) {
    setInfoSheet({ userId: row.user_id, displayName: row.display_name || row.username, avatarUrl: row.avatar_url });
  }

  async function handleAddFriend(e: React.MouseEvent, row: GlobalLeaderboardRow) {
    e.stopPropagation();
    setSentRequests((prev) => new Set(prev).add(row.user_id));
    const { error: err } = await supabase.rpc('send_friend_request', { p_receiver: row.user_id });
    setRequestFeedback({ userId: row.user_id, ok: !err });
    if (err) {
      // Revert optimistic update on error
      setSentRequests((prev) => { const next = new Set(prev); next.delete(row.user_id); return next; });
    }
    setTimeout(() => setRequestFeedback(null), 2500);
  }

  // Eigene Position in globaler Rangliste
  const myGlobalRank = isGlobal ? rows.findIndex((r) => r.is_me) + 1 : 0;

  return (
    <div className="space-y-3">

      {/* ── Filter-Leiste ──────────────────────────────────── */}
      <div className="flex items-center gap-2">

        {/* Freunde / Global */}
        <FilterDropdown
          value={viewMode}
          options={[
            { key: 'friends' as ViewMode, label: 'Freunde', icon: '👥' },
            { key: 'global'  as ViewMode, label: 'Global',  icon: '🌍' },
          ]}
          onChange={(v) => setViewMode(v)}
          className="flex-[2]"
        />

        {/* Heute / Gesamt — nur bei Freunde-Modus wählbar */}
        {!isGlobal ? (
          <FilterDropdown
            value={sortKey}
            options={[
              { key: 'today_amount' as const, label: 'Heute',  icon: '📅' },
              { key: 'total_amount' as const, label: 'Gesamt', icon: '📊' },
            ]}
            onChange={(v) => setSortKey(v)}
            className="flex-[1.5]"
          />
        ) : (
          <div className="flex flex-[1.5] items-center gap-1.5">
            <div className="flex h-[44px] flex-1 items-center gap-2 rounded-xl border border-ink-700 bg-ink-800/70 px-3">
              <span className="text-base leading-none">📅</span>
              <span className="text-[13px] font-semibold text-slate-400">Heute</span>
            </div>
            <button
              onClick={() => setRulesOpen(true)}
              aria-label="Spielregeln"
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-800/70 text-slate-400 transition hover:bg-ink-700 hover:text-slate-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </button>
          </div>
        )}

      </div>


{rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-600 px-6 py-12 text-center">
          <img src="/gesamt-icon.png" alt="Keine Einträge" className="h-28 w-28 object-contain" />
          <h3 className="text-base font-semibold text-slate-200">Noch niemand in der Rangliste</h3>
          <p className="max-w-xs text-sm text-slate-400">Sobald Freunde mitmachen, seht ihr euch hier im Vergleich.</p>
        </div>
      ) : (
        <>
          {/* Podest Platz 1–3 */}
          {hasPodium && (
            <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-950">
              {/* Podest-Grafik mit Avatar-Overlays */}
              <div className="px-2 pt-2">
              <div className="relative w-full">
                <img
                  src="/podium-bg.png"
                  alt="Podest"
                  className="block w-full"
                  draggable={false}
                />

                {/* P1 Avatar – goldener Ring Mitte */}
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ left: '50%', top: '31%' }}
                  onClick={() => handleTap(rows[0])}
                >
                  <Avatar url={rows[0].avatar_url} name={rows[0].display_name || rows[0].username} size={68} />
                </div>

                {/* P2 Avatar – silberner Ring links */}
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ left: '22%', top: '48%' }}
                  onClick={() => handleTap(rows[1])}
                >
                  <Avatar url={rows[1].avatar_url} name={rows[1].display_name || rows[1].username} size={52} />
                </div>

                {/* P3 Avatar – bronzener Ring rechts */}
                <div
                  className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                  style={{ left: '78%', top: '53%' }}
                  onClick={() => handleTap(rows[2])}
                >
                  <Avatar url={rows[2].avatar_url} name={rows[2].display_name || rows[2].username} size={48} />
                </div>
              </div>
              </div>

              {/* Name + Streak + Score unterhalb des Bildes */}
              <div className="grid grid-cols-3 gap-1 px-2 py-3">
                {[rows[1], rows[0], rows[2]].map((row, colIdx) => {
                  const rank = colIdx === 1 ? 1 : colIdx === 0 ? 2 : 3;
                  const name = row.display_name || row.username;
                  const scoreColor =
                    rank === 1 ? 'text-amber-300' : rank === 2 ? 'text-slate-300' : 'text-orange-400';
                  return (
                    <div key={row.user_id} className="flex flex-col items-center gap-0.5 text-center">
                      <p className="w-full truncate text-xs font-bold text-slate-100">
                        {name}
                        {row.is_me && (
                          <span className="text-[10px] font-normal text-brand-300"> (du)</span>
                        )}
                      </p>
                      {row.current_streak > 0 && (
                        <span className="text-xs font-semibold text-orange-400">
                          🔥<span className="text-[10px] font-medium align-sub">x {row.current_streak}</span>
                        </span>
                      )}
                      <p className={`text-sm font-extrabold ${scoreColor}`}>{row[displaySortKey]}</p>
                      <p className="text-[9px] uppercase tracking-wide text-slate-500">{sortLabel}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Liste Platz 4+ (oder alle wenn kein Podest) */}
          {(hasPodium ? rows.slice(3) : rows).length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-ink-700 bg-ink-800/70">
              <ul className="divide-y divide-ink-700">
                {(hasPodium ? rows.slice(3) : rows).map((row, idx) => (
                  <li
                    key={row.user_id}
                    onClick={() => handleTap(row)}
                    className={`flex items-center gap-3 px-4 py-3 ${
                      row.is_me ? 'bg-brand-600/10' : ''
                    } cursor-pointer active:bg-ink-700/60 transition`}
                  >
                    <span className="w-5 shrink-0 text-center text-sm font-bold text-slate-500">
                      {(hasPodium ? 3 : 0) + idx + 1}
                    </span>
                    <div className="relative shrink-0">
                      <Avatar
                        url={row.avatar_url}
                        name={row.display_name || row.username}
                        size={36}
                      />
                      {row.current_streak > 0 && (
                        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full border border-ink-600 bg-ink-900 px-1 py-px text-[9px] font-bold text-orange-400 whitespace-nowrap">
                          🔥{row.current_streak}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-200">
                        {row.display_name || row.username}
                        {row.is_me && (
                          <span className="ml-1 text-xs text-brand-300">(du)</span>
                        )}
                      </p>
                    </div>
                    {/* Add-friend button (global mode only) */}
                    {isGlobal && !row.is_me && (() => {
                      const gRow = row as GlobalLeaderboardRow;
                      const alreadySent = sentRequests.has(row.user_id);
                      const feedback = requestFeedback?.userId === row.user_id ? requestFeedback : null;
                      if (gRow.is_friend) return null;
                      if (gRow.has_pending_request || alreadySent) {
                        return (
                          <span className="shrink-0 text-[10px] text-slate-500 mr-2">
                            {feedback?.ok === false ? '✗' : '✓ Anfrage'}
                          </span>
                        );
                      }
                      return (
                        <button
                          onClick={(e) => void handleAddFriend(e, gRow)}
                          aria-label="Als Freund hinzufügen"
                          className="shrink-0 mr-2 rounded-lg p-1.5 text-slate-400 hover:bg-ink-700 hover:text-brand-300 transition active:scale-95"
                        >
                          <UserPlusIcon className="h-4 w-4" />
                        </button>
                      );
                    })()}
                    <div className="shrink-0 text-right">
                      <p className="flex items-center justify-end gap-1 text-base font-extrabold text-brand-200">
                        {row[displaySortKey]}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">
                        {sortLabel}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Spielregeln Sheet */}
      {rulesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setRulesOpen(false)}
        >
          <div
            className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-ink-600" />
            <h2 className="mb-4 text-center text-base font-bold text-slate-100">📋 Spielregeln</h2>

            <div className="space-y-4 text-sm text-slate-300">
              <div className="flex gap-3">
                <span className="mt-0.5 shrink-0 text-lg">🏆</span>
                <div>
                  <p className="font-semibold text-slate-100">Tagesrangliste</p>
                  <p className="text-slate-400">Gewertet werden alle Liegestütze, die du heute eingetragen hast.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="mt-0.5 shrink-0 text-lg">⏱️</span>
                <div>
                  <p className="font-semibold text-slate-100">Gleichstand</p>
                  <p className="text-slate-400">Bei gleicher Anzahl liegt vorne, wer diese Zahl zuerst erreicht hat. Wer früher trainiert, hat Priorität.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="mt-0.5 shrink-0 text-lg">🚀</span>
                <div>
                  <p className="font-semibold text-slate-100">Überholen</p>
                  <p className="text-slate-400">Du kannst einen Spieler mit gleicher Anzahl nur überholen, wenn du mindestens einen Liegestütz mehr schaffst.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="mt-0.5 shrink-0 text-lg">🥇</span>
                <div>
                  <p className="font-semibold text-slate-100">Medaillen</p>
                  <p className="text-slate-400">Gold, Silber und Bronze gehen an Platz 1, 2 und 3. Pro Tag gibt es jede Medaille nur einmal.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setRulesOpen(false)}
              className="mt-6 w-full rounded-2xl border border-ink-600 py-3 text-sm font-semibold text-slate-300 hover:bg-ink-700 transition"
            >
              Verstanden
            </button>
          </div>
        </div>
      )}

      {/* User Info Sheet */}
      {infoSheet && activeExercise && (
        <UserInfoSheet
          userId={infoSheet.userId}
          displayName={infoSheet.displayName}
          avatarUrl={infoSheet.avatarUrl}
          exerciseId={activeExercise.id}
          onClose={() => setInfoSheet(null)}
          showTodaySets
        />
      )}

    </div>
  );
}
