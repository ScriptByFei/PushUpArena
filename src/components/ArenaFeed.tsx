import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useArenaFeed, type FeedFilter, type LiveActivityMap } from '@/hooks/useArenaFeed';
import { UserInfoSheet } from '@/components/UserInfoSheet';
import { useExercise } from '@/context/ExerciseContext';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { TrophyIcon, CrownIcon } from '@/components/ui/icons';
import { computeLeadChanges } from '@/lib/arenaLeadChange';
import type { ArenaFeedEvent } from '@/types/feed';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RankEntry {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  reps: number;
  rank: number;
  isMe: boolean;
  isFriend: boolean;
}

interface ActivityEntry {
  entryId: string;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  exerciseId: string;
  amount: number;
  runningTotal: number;
  performedAt: string;
}

// ─── Zeit (Europe/Berlin, HH:MM) ────────────────────────────────────────────────

function berlinTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── Besondere Ereignisse (Meilenstein, Rekord, Platzwechsel) ──────────────────
// Quelle: bestehende feed_events (vom DB-Trigger erzeugt) — keine neue Tabelle.
// Ein feed_event wird der Ticker-Zeile zugeordnet, die es ausgelöst hat, damit
// normale Sätze dezent bleiben und nur die auslösende Zeile hervorgehoben wird.
// Führungswechsel ("FÜHRUNGSWECHSEL") werden NICHT hierüber erkannt, sondern
// deterministisch aus den Tages-Sätzen berechnet — siehe computeLeadChanges().

type SpecialAccent = 'blue' | 'green' | 'amber' | 'neutral';

interface SpecialBadge {
  label: string;
  description: string;
  accent: SpecialAccent;
  weight: number; // höheres Gewicht gewinnt, falls mehrere Events auf dieselbe Zeile matchen
  icon?: 'crown';
}

const MILESTONE_ACCENT: SpecialAccent = 'blue';
const RECORD_ACCENT: SpecialAccent = 'green';
const LEAD_ACCENT: SpecialAccent = 'amber';
const RANK_UP_ACCENT: SpecialAccent = 'neutral'; // bewusst kein zusätzlicher Farbton — sparsame Palette

/** Zeitlich naheliegendster Aktivitäts-Eintrag desselben Nutzers/Exercises — für
 * Events ohne exakten Zahlen-Match (place1_new, rank_improved). */
function closestEntry(
  entries: ActivityEntry[],
  userId: string,
  exerciseId: string | null,
  iso: string,
): ActivityEntry | undefined {
  const t = new Date(iso).getTime();
  let best: ActivityEntry | undefined;
  let bestDiff = Infinity;
  for (const e of entries) {
    if (e.userId !== userId || e.exerciseId !== exerciseId) continue;
    const diff = Math.abs(new Date(e.performedAt).getTime() - t);
    if (diff < bestDiff) { bestDiff = diff; best = e; }
  }
  return best;
}

function matchSpecialEvents(
  entries: ActivityEntry[],
  events: ArenaFeedEvent[],
): Map<string, SpecialBadge> {
  const result = new Map<string, SpecialBadge>();

  const consider = (entryId: string | undefined, badge: SpecialBadge) => {
    if (!entryId) return;
    const existing = result.get(entryId);
    if (!existing || badge.weight > existing.weight) result.set(entryId, badge);
  };

  for (const ev of events) {
    const name = ev.display_name || ev.username || 'Unbekannt';
    const m = ev.metadata;

    if (ev.event_type.startsWith('milestone_')) {
      // milestone_20 / milestone_50 sind reine Freundes-Hinweise ohne eigenen
      // Wert im Live-Ticker — analog zur bisherigen Story-Logik übersprungen.
      if (ev.event_type === 'milestone_20' || ev.event_type === 'milestone_50') continue;
      const threshold = parseInt(ev.event_type.replace('milestone_', ''), 10);
      const target = m.today_total as number | undefined;
      const entry = entries.find(
        e => e.userId === ev.user_id && e.exerciseId === ev.exercise_id && e.runningTotal === target,
      );
      consider(entry?.entryId, {
        label: 'MEILENSTEIN',
        description: `${name} erreicht ${threshold.toLocaleString('de-DE')} PushUps`,
        accent: MILESTONE_ACCENT,
        weight: 1,
      });
      continue;
    }

    if (ev.event_type === 'daily_record' || ev.event_type === 'personal_record') {
      const reps = m.reps as number | undefined;
      const entry = entries.find(
        e => e.userId === ev.user_id && e.exerciseId === ev.exercise_id && e.runningTotal === reps,
      );
      consider(entry?.entryId, {
        label: 'REKORD',
        description: `${name} stellt einen neuen Tagesrekord auf`,
        accent: RECORD_ACCENT,
        weight: 2,
      });
      continue;
    }

    // Hinweis: 'place1_new' wird hier bewusst NICHT mehr verwendet — der DB-Trigger
    // erzeugt es bereits, sobald der Nutzer nach seinem Satz Rang 1 ist, auch ohne
    // dass ein vorheriger, eindeutiger Anführer existierte (z.B. der allererste
    // Satz des Tages). Echte Führungswechsel werden stattdessen deterministisch aus
    // den Tages-Sätzen berechnet — siehe computeLeadChanges() weiter unten.

    if (ev.event_type === 'rank_improved') {
      const newRank = m.new_rank as number | undefined;
      if (newRank == null) continue;
      const entry = closestEntry(entries, ev.user_id, ev.exercise_id, ev.created_at);
      consider(entry?.entryId, {
        label: 'PLATZWECHSEL',
        description: `↑ ${name} steigt auf Platz ${newRank}`,
        accent: RANK_UP_ACCENT,
        weight: 3,
      });
    }
  }

  return result;
}

// ─── Gruppierung (Bursts desselben Nutzers zu einer Zeile bündeln) ────────────
// Rein clientseitig über die frisch geladene activityList — keine Persistenz,
// daher bei jedem Re-Fetch (Edit/Delete/Realtime) automatisch neu und korrekt.
// Reihen mit besonderem Ereignis (Badge) bleiben immer eigenständig, damit sie
// nie in einer Sammel-Zeile untergehen.

const GROUP_WINDOW_MS = 3 * 60 * 1000; // 3 Minuten zwischen unmittelbar folgenden Sätzen

interface ActivityGroup {
  key: string;
  entries: ActivityEntry[];
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  exerciseId: string;
  totalDelta: number;   // Summe aller Satzgrößen der Gruppe — keine Datenverluste
  runningTotal: number; // Tagesgesamtstand nach dem neuesten Satz der Gruppe
  latestAt: string;
  badge?: SpecialBadge;
}

function groupActivity(
  entries: ActivityEntry[], // bereits absteigend sortiert (neueste zuerst)
  specialByEntry: Map<string, SpecialBadge>,
): ActivityGroup[] {
  const groups: ActivityGroup[] = [];

  for (const entry of entries) {
    const badge = specialByEntry.get(entry.entryId);
    const last = groups[groups.length - 1];
    const lastEntry = last?.entries[last.entries.length - 1];
    const gapMs = lastEntry
      ? new Date(lastEntry.performedAt).getTime() - new Date(entry.performedAt).getTime()
      : Infinity;

    const canMerge =
      last && !last.badge && !badge &&
      last.userId === entry.userId && last.exerciseId === entry.exerciseId &&
      gapMs <= GROUP_WINDOW_MS;

    if (canMerge && last) {
      last.entries.push(entry);
      last.totalDelta += entry.amount;
      // runningTotal/latestAt bleiben die des neuesten (zuerst eingefügten) Satzes
    } else {
      groups.push({
        key: entry.entryId,
        entries: [entry],
        userId: entry.userId,
        displayName: entry.displayName,
        avatarUrl: entry.avatarUrl,
        exerciseId: entry.exerciseId,
        totalDelta: entry.amount,
        runningTotal: entry.runningTotal,
        latestAt: entry.performedAt,
        badge,
      });
    }
  }

  return groups;
}

// ─── LiveRankList (kompakte Live-Rangliste, Top 5) ─────────────────────────────
// Built EXCLUSIVELY from the live leaderboard (get_all_active_today).
// Never uses a feed_event as its source of truth.
// Shown at the top of every feed render — always correct, never stale.

function RankRow({
  entry,
  isLive,
  onOpenProfile,
  detached,
}: {
  entry: RankEntry;
  isLive: boolean;
  onOpenProfile: () => void;
  detached?: boolean;
}) {
  const isFirst = entry.rank === 1;
  return (
    <button
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition active:bg-ink-800/60 ${
        detached ? 'bg-brand-500/5' : ''
      }`}
      onClick={onOpenProfile}
      aria-label={`Profil von ${entry.displayName}`}
    >
      <span
        className={`w-5 shrink-0 text-center text-[12px] font-black tabular-nums ${
          isFirst ? 'text-amber-400' : 'text-slate-500'
        }`}
      >
        {entry.rank}
      </span>
      <Avatar url={entry.avatarUrl} name={entry.displayName} size={26} />
      <span
        className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${
          isFirst ? 'text-amber-200' : entry.isMe ? 'text-brand-300' : 'text-slate-200'
        }`}
      >
        {entry.displayName}
      </span>
      {isLive && (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-400" />
        </span>
      )}
      <span
        className={`shrink-0 text-[13px] font-black tabular-nums ${
          isFirst ? 'text-amber-300' : 'text-slate-300'
        }`}
      >
        {entry.reps.toLocaleString('de-DE')}
      </span>
    </button>
  );
}

function LiveRankList({
  top,
  myEntry,
  liveActivity,
  onOpenProfile,
}: {
  top: RankEntry[];
  myEntry: RankEntry | null;
  liveActivity: LiveActivityMap;
  onOpenProfile: (entry: RankEntry) => void;
}) {
  if (top.length === 0) return null;
  const showDetached = !!myEntry && !top.some(e => e.userId === myEntry.userId);

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-700/60 bg-ink-900">
      <div className="flex items-baseline justify-between px-3.5 pt-2.5 pb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Live-Rangliste</span>
        <span className="text-[10px] font-semibold text-slate-600">Heute</span>
      </div>
      <div className="divide-y divide-ink-800/70">
        {top.map(entry => (
          <RankRow
            key={entry.userId}
            entry={entry}
            isLive={!!liveActivity[entry.userId]}
            onOpenProfile={() => onOpenProfile(entry)}
          />
        ))}
      </div>
      {showDetached && myEntry && (
        <>
          <div className="mx-3.5 border-t border-dashed border-ink-700/70" />
          <RankRow
            entry={myEntry}
            isLive={!!liveActivity[myEntry.userId]}
            onOpenProfile={() => onOpenProfile(myEntry)}
            detached
          />
        </>
      )}
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex animate-pulse items-center gap-2.5 rounded-xl bg-ink-900 px-3.5 py-2">
      <div className="h-[26px] w-[26px] shrink-0 rounded-full bg-ink-700" />
      <div className="h-2.5 w-1/3 rounded-full bg-ink-700" />
      <div className="ml-auto h-2.5 w-10 rounded-full bg-ink-700" />
    </div>
  );
}

// ─── Filter pill ──────────────────────────────────────────────────────────────

function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
        active ? 'bg-brand-500 text-white' : 'bg-ink-800 text-slate-400 hover:bg-ink-700'
      }`}
    >
      {label}
    </button>
  );
}

// ─── LiveActivityTicker (kompakter Live-Ticker, ein Eintrag pro Satz) ──────────
// Jede Zeile: Avatar, Name, Satzgröße (+X), Pfeil, neuer Tagesgesamtstand, Uhrzeit.
// Quelle: get_arena_live_activity — reine Projektion von workout_entries, daher
// bei UPDATE/DELETE eines Satzes beim nächsten Fetch automatisch korrekt.

const SPECIAL_ACCENT_CLASSES: Record<SpecialAccent, { border: string; label: string }> = {
  blue:   { border: 'border-l-blue-500 bg-blue-500/[0.06]',    label: 'text-blue-400' },
  green:  { border: 'border-l-green-500 bg-green-500/[0.06]',  label: 'text-green-400' },
  amber:  { border: 'border-l-amber-400 bg-amber-400/[0.07]',  label: 'text-amber-400' },
  neutral: { border: 'border-l-slate-500 bg-slate-500/[0.05]', label: 'text-slate-400' },
};

function ActivityRow({ entry, isMe, badge, onOpenProfile }: {
  entry: ActivityEntry;
  isMe: boolean;
  badge?: SpecialBadge;
  onOpenProfile: () => void;
}) {
  const accent = badge ? SPECIAL_ACCENT_CLASSES[badge.accent] : null;

  return (
    <button
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition active:bg-ink-800/60 ${
        accent ? `border-l-2 ${accent.border}` : ''
      }`}
      onClick={onOpenProfile}
      aria-label={`Profil von ${entry.displayName}`}
    >
      <Avatar url={entry.avatarUrl} name={entry.displayName} size={24} />
      <div className="min-w-0 flex-1">
        {badge && (
          <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest ${accent!.label}`}>
            {badge.icon === 'crown' && <CrownIcon className="h-2.5 w-2.5" />}
            {badge.label}
          </span>
        )}
        <span className={`block truncate text-[13px] font-semibold ${isMe ? 'text-brand-300' : 'text-slate-200'}`}>
          {badge ? badge.description : entry.displayName}
        </span>
      </div>
      <span className="shrink-0 text-[12px] font-bold text-green-400">
        +{entry.amount.toLocaleString('de-DE')}
      </span>
      <span className="shrink-0 text-[11px] text-slate-600">→</span>
      <span className="shrink-0 text-[13px] font-black tabular-nums text-slate-200">
        {entry.runningTotal.toLocaleString('de-DE')}
      </span>
      <span className="w-9 shrink-0 text-right text-[10px] font-medium tabular-nums text-slate-600">
        {berlinTime(entry.performedAt)}
      </span>
    </button>
  );
}

function GroupedActivityRow({ group, isMe, onOpenProfile }: {
  group: ActivityGroup;
  isMe: boolean;
  onOpenProfile: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition active:bg-ink-800/60"
      onClick={onOpenProfile}
      aria-label={`Profil von ${group.displayName}`}
    >
      <Avatar url={group.avatarUrl} name={group.displayName} size={24} />
      <div className="min-w-0 flex-1">
        <span className={`block truncate text-[13px] font-semibold ${isMe ? 'text-brand-300' : 'text-slate-200'}`}>
          {group.displayName}
        </span>
        <span className="block text-[10px] text-slate-600">{group.entries.length} Sätze</span>
      </div>
      <span className="shrink-0 text-[12px] font-bold text-green-400">
        +{group.totalDelta.toLocaleString('de-DE')}
      </span>
      <span className="shrink-0 text-[11px] text-slate-600">→</span>
      <span className="shrink-0 text-[13px] font-black tabular-nums text-slate-200">
        {group.runningTotal.toLocaleString('de-DE')}
      </span>
      <span className="w-9 shrink-0 text-right text-[10px] font-medium tabular-nums text-slate-600">
        {berlinTime(group.latestAt)}
      </span>
    </button>
  );
}

function LiveActivityTicker({ groups, myUserId, onOpenProfile }: {
  groups: ActivityGroup[];
  myUserId: string | undefined;
  onOpenProfile: (entry: ActivityEntry) => void;
}) {
  if (groups.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-700/60 bg-ink-900">
      <div className="px-3.5 pt-2.5 pb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Live-Aktivität</span>
      </div>
      <div className="divide-y divide-ink-800/70">
        {groups.map(group =>
          group.entries.length > 1 ? (
            <GroupedActivityRow
              key={group.key}
              group={group}
              isMe={group.userId === myUserId}
              onOpenProfile={() => onOpenProfile(group.entries[0])}
            />
          ) : (
            <ActivityRow
              key={group.key}
              entry={group.entries[0]}
              isMe={group.userId === myUserId}
              badge={group.badge}
              onOpenProfile={() => onOpenProfile(group.entries[0])}
            />
          ),
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface InfoSheetState {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  exerciseId: string;
}

export function ArenaFeed({ onClose }: { onClose: () => void }) {
  const { exercise: activeExercise } = useExercise();
  const { user } = useAuth();
  const [filter, setFilter] = useState<FeedFilter>('global');
  const [infoSheet, setInfoSheet] = useState<InfoSheetState | null>(null);
  const [rankList, setRankList] = useState<RankEntry[]>([]);
  const [activityList, setActivityList] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const { events, refreshing, liveActivity, refresh, silentRefresh } = useArenaFeed(filter);

  // Sequenz-Zähler gegen Race Conditions: bei schnell aufeinanderfolgenden
  // Fetches (z.B. mehrere Sätze kurz hintereinander) darf eine spät eintreffende
  // Antwort eine bereits neuere nicht mehr überschreiben.
  const rankListSeq = useRef(0);
  const activityListSeq = useRef(0);

  // ── Rang-Hilfsfunktion ──────────────────────────────────────────────────────
  const fetchRankList = useCallback(async (exId: string) => {
    const seq = ++rankListSeq.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc('get_all_active_today', { p_exercise: exId });
    if (seq !== rankListSeq.current) return; // veraltete Antwort verwerfen
    if (!data) return;
    const sorted: RankEntry[] = [...data]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .sort((a: any, b: any) => b.today_amount - a.today_amount)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any, i: number) => ({
        userId: r.user_id,
        displayName: r.display_name || r.username || 'Unbekannt',
        avatarUrl: (r.avatar_url ?? null) as string | null,
        reps: r.today_amount as number,
        rank: i + 1,
        isMe: !!r.is_me,
        isFriend: !!r.is_friend,
      }));
    setRankList(sorted);
  }, []);

  // ── Live-Aktivität-Hilfsfunktion ────────────────────────────────────────────
  // p_limit 100 = Server-Obergrenze der RPC (LEAST(p_limit, 100)). Wichtig für
  // computeLeadChanges(): fallen ältere Sätze eines Nutzers aus der geladenen
  // Liste, wird sein Tagesstand sonst zu niedrig rekonstruiert und ein bloßes
  // Gleichziehen eines anderen Nutzers fälschlich als Überholen erkannt.
  const fetchActivityList = useCallback(async (f: FeedFilter) => {
    const seq = ++activityListSeq.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc('get_arena_live_activity', { p_filter: f, p_limit: 100 });
    if (seq !== activityListSeq.current) return; // veraltete Antwort verwerfen
    if (!data) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: ActivityEntry[] = (data as any[]).map(r => ({
      entryId: r.entry_id,
      userId: r.user_id,
      displayName: r.display_name || r.username || 'Unbekannt',
      avatarUrl: (r.avatar_url ?? null) as string | null,
      exerciseId: r.exercise_id,
      amount: r.amount as number,
      runningTotal: r.running_total as number,
      performedAt: r.performed_at as string,
    }));
    setActivityList(rows);
  }, []);

  // Fetch live leaderboard for competitive context (lead-over-#2, rank proximity).
  // Einmalig beim ersten Laden; wird durch liveActivity-Debounce aktuell gehalten.
  const rankFetched = useRef(false);
  useEffect(() => {
    if (rankFetched.current) return;
    const exId = activeExercise?.id;
    if (!exId) return;
    rankFetched.current = true;
    void fetchRankList(exId);
  }, [activeExercise?.id, fetchRankList]);

  // Live-Aktivität initial laden und bei Filter-Wechsel neu laden (Filter wird
  // serverseitig in get_arena_live_activity angewendet).
  useEffect(() => {
    setActivityLoading(true);
    void fetchActivityList(filter).finally(() => setActivityLoading(false));
  }, [filter, fetchActivityList]);

  // Debounced Aktualisierung von Rang + Aktivität wenn live_activity sich ändert.
  // Tritt auf bei:
  //   a) Neuem Workout (INSERT) → live_activity erhöht sich → neue Daten anzeigen
  //   b) Gelöschtem/bearbeitetem Satz (DELETE/UPDATE) → live_activity sinkt →
  //      abgelaufene Ticker-Zeilen korrigieren
  const liveActivityDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (Object.keys(liveActivity).length === 0) return; // nichts zu tun bei leerem State
    const exId = activeExercise?.id;

    if (liveActivityDebounce.current) clearTimeout(liveActivityDebounce.current);
    liveActivityDebounce.current = setTimeout(async () => {
      await silentRefresh();
      if (exId) await fetchRankList(exId);
      await fetchActivityList(filter);
    }, 2000);

    return () => {
      if (liveActivityDebounce.current) clearTimeout(liveActivityDebounce.current);
    };
  // liveActivity als Dependency: jede Änderung (neues Workout, Delete, Edit) triggert den Debounce
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveActivity]);

  // Re-fetch ranking + activity on pull-to-refresh
  const handleRefresh = async () => {
    rankFetched.current = false;
    await refresh();
    const exId = activeExercise?.id;
    if (exId) await fetchRankList(exId);
    await fetchActivityList(filter);
  };

  // Live-Rangliste passend zum gewählten Filter neu ranken (rankList selbst bleibt
  // global — wird nur für Lookups verwendet).
  const filteredRankList = useMemo(() => {
    const base = filter === 'friends' ? rankList.filter(r => r.isFriend || r.isMe) : rankList;
    return base.map((r, i) => ({ ...r, rank: i + 1 }));
  }, [rankList, filter]);
  const topRankList = useMemo(() => filteredRankList.slice(0, 5), [filteredRankList]);
  const myRankEntry = useMemo(() => filteredRankList.find(r => r.isMe) ?? null, [filteredRankList]);

  // Besondere Ereignisse (Meilenstein, Rekord, Platzwechsel) den Ticker-Zeilen
  // zuordnen, die sie ausgelöst haben — reine feed_events-Projektion, keine
  // eigene Persistenz.
  const eventBadges = useMemo(
    () => matchSpecialEvents(activityList, events),
    [activityList, events],
  );

  // Echte Führungswechsel deterministisch aus den Tages-Sätzen berechnen
  // (chronologische Rekonstruktion, siehe arenaLeadChange.ts). Ersetzt das
  // fehlerhafte feed_events-'place1_new' (feuerte auch ohne echten Vorgänger,
  // z.B. beim allerersten Satz des Tages). Bei Bearbeitung/Löschung eines
  // Satzes wird activityList neu geladen und der Verlauf korrigiert sich
  // automatisch — keine gesonderte Invalidierung nötig.
  const leadChanges = useMemo(() => computeLeadChanges(activityList), [activityList]);

  // Beide Quellen zu einer Badge-Map je Ticker-Zeile zusammenführen. Führungswechsel
  // hat das höchste Gewicht und gewinnt bei Überschneidung mit anderen Ereignissen.
  const specialByEntry = useMemo(() => {
    const merged = new Map(eventBadges);
    for (const entry of activityList) {
      if (!leadChanges.has(entry.entryId)) continue;
      const badge: SpecialBadge = {
        label: 'FÜHRUNGSWECHSEL',
        description: `${entry.displayName} übernimmt die Führung`,
        accent: LEAD_ACCENT,
        weight: 4,
        icon: 'crown',
      };
      const existing = merged.get(entry.entryId);
      if (!existing || badge.weight > existing.weight) merged.set(entry.entryId, badge);
    }
    return merged;
  }, [eventBadges, leadChanges, activityList]);

  // Bursts desselben Nutzers zu einer kompakten Sammel-Zeile bündeln.
  const activityGroups = useMemo(
    () => groupActivity(activityList, specialByEntry),
    [activityList, specialByEntry],
  );

  const listRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Auto-refresh at Berlin midnight
  useEffect(() => {
    const msUntilMidnight = (): number => {
      const now = new Date();
      const berlinStr = now.toLocaleString('en-US', { timeZone: 'Europe/Berlin' });
      const berlinNow = new Date(berlinStr);
      const midnight = new Date(berlinNow);
      midnight.setHours(24, 0, 5, 0);
      return Math.max(0, midnight.getTime() - berlinNow.getTime());
    };
    const timer = setTimeout(() => {
      rankFetched.current = false;
      void refresh();
      const exId = activeExercise?.id;
      if (exId) void fetchRankList(exId);
      void fetchActivityList(filter);
    }, msUntilMidnight());
    return () => clearTimeout(timer);
  }, [refresh, filter, fetchActivityList, fetchRankList, activeExercise?.id]);

  // Nach Rückkehr aus dem Hintergrund (Tab/App-Wechsel, Bildschirm gesperrt):
  // Realtime-Verbindung kann während der Zeit im Hintergrund kurz unterbrochen
  // gewesen sein (z.B. iOS Safari suspendiert WebSockets) — erzwungener
  // Voll-Refresh holt verpasste Änderungen nach. Throttled, damit kurzes
  // Wegtippen/Zurückkommen (z.B. Kamera für Profilbild) keinen Extra-Request auslöst.
  const lastVisibilityRefreshAt = useRef(Date.now());
  useEffect(() => {
    const VISIBILITY_REFETCH_MS = 60_000; // max. einmal pro Minute
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastVisibilityRefreshAt.current < VISIBILITY_REFETCH_MS) return;
      lastVisibilityRefreshAt.current = Date.now();
      void silentRefresh();
      const exId = activeExercise?.id;
      if (exId) void fetchRankList(exId);
      void fetchActivityList(filter);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [silentRefresh, fetchRankList, fetchActivityList, filter, activeExercise?.id]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 60 && (listRef.current?.scrollTop ?? 0) <= 0 && !refreshing) void handleRefresh();
  };

  const handleOpenActivityProfile = (entry: ActivityEntry) => {
    setInfoSheet({
      userId: entry.userId,
      displayName: entry.displayName,
      avatarUrl: entry.avatarUrl,
      exerciseId: entry.exerciseId,
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex flex-col bg-ink-950">
        <div style={{ paddingTop: 'env(safe-area-inset-top)' }} />

        {/* Header */}
        <div className="shrink-0 border-b border-ink-800 px-4 pb-3 pt-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-extrabold text-slate-100">Arena</h2>
                <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-semibold text-green-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                  Live
                </span>
              </div>
              <p className="text-[11px] text-slate-600">Was passiert heute?</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-400 transition hover:bg-ink-800 hover:text-slate-200"
              aria-label="Schließen"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>

          <div className="mt-2.5 flex gap-2">
            <FilterPill label="Global"  active={filter === 'global'}  onClick={() => setFilter('global')}  />
            <FilterPill label="Freunde" active={filter === 'friends'} onClick={() => setFilter('friends')} />
          </div>
        </div>

        {/* Pull-to-refresh indicator */}
        {refreshing && (
          <div className="flex shrink-0 items-center justify-center gap-1.5 py-2 text-xs text-brand-400">
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Aktualisieren…
          </div>
        )}

        {/* Feed */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-3 py-2.5"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {activityLoading && activityList.length === 0 ? (
            <div className="space-y-1.5">
              {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : topRankList.length === 0 && activityList.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-800">
                <TrophyIcon className="h-7 w-7 text-slate-600" />
              </div>
              <p className="text-sm font-bold text-slate-300">
                {filter === 'friends' ? 'Ruhig hier.' : 'Noch nichts los.'}
              </p>
              <p className="max-w-[200px] text-xs text-slate-600">
                {filter === 'friends'
                  ? 'Heute war noch keiner deiner Freunde aktiv.'
                  : 'Heute ist es noch ruhig in der Arena.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* ── Live-Rangliste — built from live leaderboard, never from feed events ── */}
              {topRankList.length > 0 && (
                <LiveRankList
                  top={topRankList}
                  myEntry={myRankEntry}
                  liveActivity={liveActivity}
                  onOpenProfile={entry => {
                    const exerciseId = activeExercise?.id ?? activityList[0]?.exerciseId;
                    if (!exerciseId) return;
                    setInfoSheet({
                      userId: entry.userId,
                      displayName: entry.displayName,
                      avatarUrl: entry.avatarUrl,
                      exerciseId,
                    });
                  }}
                />
              )}

              {/* ── Live-Aktivität — ein Eintrag pro Satz (Bursts gebündelt) ── */}
              <LiveActivityTicker
                groups={activityGroups}
                myUserId={user?.id}
                onOpenProfile={handleOpenActivityProfile}
              />

              <div style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }} />
            </div>
          )}
        </div>
      </div>

      {infoSheet && (
        <UserInfoSheet
          userId={infoSheet.userId}
          displayName={infoSheet.displayName}
          avatarUrl={infoSheet.avatarUrl}
          exerciseId={infoSheet.exerciseId}
          onClose={() => setInfoSheet(null)}
        />
      )}
    </>
  );
}
