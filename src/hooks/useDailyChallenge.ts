// Hook für Daily Live: reine Live-Auswertung der heutigen workout_entries.
// Keine Anmeldung, keine Teilnehmerliste — jeder registrierte Nutzer ist
// automatisch dabei. workout_entries ist die einzige Datenquelle (keine
// separate Spiegel-Tabelle mehr).
//
// Architektur-Entscheidungen:
//  • Kein React Query — analog zu useLeaderboard / useWorkoutLogger
//  • Daily Live ist IMMER für Push-ups (CHALLENGE_EXERCISE_SLUG).
//    Sie ist unabhängig von der aktuell ausgewählten Übung des Users.
//    Andere Übungen erhalten später eigene Challenge-Hooks/-Instanzen.
//  • Push-up Exercise-ID wird einmalig per Slug geladen (Modul-Level-Cache);
//    alle Hook-Instanzen teilen sich diese ID ohne redundante DB-Abfragen.
//  • Countdown isoliert in DailyChallengeCountdown (useCountdown-Hook);
//    dieser Hook enthält kein eigenes setInterval mehr → kein sekündlicher
//    Re-Render des gesamten Modals
//  • Status wird bei Tagesgrenze via onEnd-Callback aus useCountdown
//    still im Hintergrund aktualisiert (kein Skeleton-Flash)
//  • Realtime-Subscription auf live_activity (öffentliches Aggregat, wird bei
//    jeder workout_entries-Änderung getriggert) → Rangliste + eigene Sätze
//    automatisch aktuell halten, siehe Kommentar bei der Subscription unten.
//  • Satzeingabe NICHT im Challenge-Modal — Sätze kommen ausschließlich über
//    Dashboard / NavDrawer (workout_entries) und werden von dort per Event
//    ('workoutEntriesChanged') und Realtime propagiert.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

// ── Push-up als exklusive Challenge-Übung ─────────────────────────────────────
// Daily Live ist ausschließlich für Push-ups.
// Slug entspricht dem exercises.slug in der DB.
// Für zukünftige Challenges: separater Hook mit anderem Slug.
const CHALLENGE_EXERCISE_SLUG = 'pushups';

// Modul-Level-Cache: Die Exercise-ID wird einmalig pro Page-Load geladen.
// Mehrere Hook-Instanzen (Dashboard + Modal) teilen sich denselben Wert
// ohne redundante DB-Abfragen.
let _cachedChallengeExerciseId: string | null = null;
let _challengeExerciseIdFetch: Promise<string | null> | null = null;

function fetchChallengeExerciseId(): Promise<string | null> {
  if (_cachedChallengeExerciseId) return Promise.resolve(_cachedChallengeExerciseId);
  if (_challengeExerciseIdFetch) return _challengeExerciseIdFetch;
  _challengeExerciseIdFetch = supabase
    .from('exercises')
    .select('id')
    .eq('slug', CHALLENGE_EXERCISE_SLUG)
    .eq('is_challenge_enabled', true)
    .single()
    .then(({ data }) => {
      _cachedChallengeExerciseId = data?.id ?? null;
      return _cachedChallengeExerciseId;
    });
  return _challengeExerciseIdFetch;
}
import {
  type DailyChallengeHistoryDay,
  type DailyChallengeLeaderboardEntry,
  type DailyChallengeSet,
  type DailyChallengeStatus,
  type DailyChallengeDayDetails,
  type DailyChallengeParticipantDetails,
  type DailyChallengeHistoricalSet,
  mapHistoryDay,
  mapLeaderboardEntry,
  mapSet,
  mapStatus,
  mapDayDetails,
  mapHistoricalSet,
} from '@/lib/dailyChallenge.types';

const VISIBILITY_REFETCH_MS = 5 * 60 * 1000; // 5 Min im Hintergrund → re-sync

export function useDailyChallenge() {
  const { user } = useAuth();
  const toast = useToast();

  // Push-up Exercise-ID — aus Modul-Cache oder einmalig per DB-Abfrage.
  // useState initialisiert mit dem Cache-Wert: kein Extra-Render wenn bereits bekannt.
  const [exerciseId, setExerciseId] = useState<string | null>(_cachedChallengeExerciseId);

  useEffect(() => {
    if (exerciseId) return; // bereits im Cache
    void fetchChallengeExerciseId().then(id => {
      if (id) setExerciseId(id);
    });
  }, [exerciseId]);

  // ── Status ──────────────────────────────────────────────────────────────
  const [status, setStatus] = useState<DailyChallengeStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus]     = useState(false);
  const [statusError, setStatusError]             = useState<string | null>(null);

  // ── Rangliste ────────────────────────────────────────────────────────────
  const [leaderboard, setLeaderboard]             = useState<DailyChallengeLeaderboardEntry[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
  const [leaderboardError, setLeaderboardError]   = useState<string | null>(null);

  // ── Meine Sätze ──────────────────────────────────────────────────────────
  const [mySets, setMySets]                       = useState<DailyChallengeSet[]>([]);
  const [isLoadingMySets, setIsLoadingMySets]     = useState(false);
  const [setsError, setSetsError]                 = useState<string | null>(null);

  // ── Verlauf (lazy — nur auf Anfrage laden) ────────────────────────────────
  const [history, setHistory]                     = useState<DailyChallengeHistoryDay[]>([]);
  const [isLoadingHistory, setIsLoadingHistory]   = useState(false);
  const [historyError, setHistoryError]           = useState<string | null>(null);

  // ── Historische Tagesdetails (lazy, gecacht per exerciseId+date) ──────────
  const [selectedDayDetails, setSelectedDayDetails]               = useState<DailyChallengeDayDetails | null>(null);
  const [isLoadingDayDetails, setIsLoadingDayDetails]             = useState(false);
  const [dayDetailsError, setDayDetailsError]                     = useState<string | null>(null);

  // ── Historische Teilnehmerdetails (lazy, gecacht per exerciseId+date+userId)
  const [selectedParticipantDetails, setSelectedParticipantDetails] = useState<DailyChallengeParticipantDetails | null>(null);
  const [isLoadingParticipantDetails, setIsLoadingParticipantDetails] = useState(false);
  const [participantDetailsError, setParticipantDetailsError]     = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const currentChallengeDateRef   = useRef<string | null>(null);
  const channelRef                = useRef<RealtimeChannel | null>(null);
  // Unique suffix per hook instance so that Dashboard + Modal can coexist
  // without both subscribing to the same named Supabase channel (which would
  // cause the channel to be shared and removed when either unmounts).
  const channelIdRef              = useRef(`dc_${Math.random().toString(36).slice(2, 8)}`);
  const hiddenAtRef               = useRef<number | null>(null);
  // Caches für Tages- und Teilnehmerdetails (Modal-Lebensdauer)
  const dayDetailsCacheRef        = useRef(new Map<string, DailyChallengeDayDetails>());
  const participantCacheRef       = useRef(new Map<string, DailyChallengeParticipantDetails>());
  // Schutz vor Doppelklick-Races
  const isLoadingDayRef           = useRef(false);
  const isLoadingParticipantRef   = useRef(false);
  // Realtime-Event-Debounce: verhindert N parallele Refreshes bei N schnellen INSERTs
  const realtimeDebounceRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isActive      = status?.isActive  ?? false;
  const challengeDate = status?.challengeDate ?? null;

  // ── refreshStatus ─────────────────────────────────────────────────────────
  const refreshStatus = useCallback(async () => {
    if (!exerciseId || !user) return;
    setIsLoadingStatus(true);
    setStatusError(null);
    try {
      const { data, error } = await supabase.rpc('get_daily_challenge_status', {
        p_exercise_id: exerciseId,
      });
      if (error) throw error;
      if (!data) throw new Error('Keine Daten vom Server erhalten.');

      const mapped = mapStatus(data);

      // Tageswechsel → Daten des Vortags wegwerfen
      if (
        currentChallengeDateRef.current !== null &&
        currentChallengeDateRef.current !== mapped.challengeDate
      ) {
        setLeaderboard([]);
        setMySets([]);
        setHistory([]);
      }
      currentChallengeDateRef.current = mapped.challengeDate;

      setStatus(mapped);
    } catch (err) {
      console.error('Daily Live status RPC failed:', err);
      const msg = err instanceof Error ? err.message : 'Status konnte nicht geladen werden.';
      setStatusError(msg);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [exerciseId, user]);

  // ── refreshLeaderboard ────────────────────────────────────────────────────
  const refreshLeaderboard = useCallback(async () => {
    if (!exerciseId || !user) return;
    setIsLoadingLeaderboard(true);
    setLeaderboardError(null);
    try {
      const { data, error } = await supabase.rpc('get_daily_challenge_leaderboard', {
        p_exercise_id: exerciseId,
        p_date: null, // heute (Berliner Zeit)
      });
      if (error) throw error;
      setLeaderboard((data ?? []).map(mapLeaderboardEntry));
    } catch (err) {
      console.error('Daily Live leaderboard RPC failed:', err);
      const msg = err instanceof Error ? err.message : 'Rangliste konnte nicht geladen werden.';
      setLeaderboardError(msg);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  }, [exerciseId, user]);

  // ── refreshMySets ─────────────────────────────────────────────────────────
  const refreshMySets = useCallback(async () => {
    if (!exerciseId || !user) return;
    setIsLoadingMySets(true);
    setSetsError(null);
    try {
      const { data, error } = await supabase.rpc('get_my_challenge_sets', {
        p_exercise_id: exerciseId,
        p_date: null, // heute
      });
      if (error) throw error;
      setMySets((data ?? []).map(mapSet));
    } catch (err) {
      console.error('Daily Live my-sets RPC failed:', err);
      const msg = err instanceof Error ? err.message : 'Sätze konnten nicht geladen werden.';
      setSetsError(msg);
    } finally {
      setIsLoadingMySets(false);
    }
  }, [exerciseId, user]);

  // ── refreshHistory ────────────────────────────────────────────────────────
  const refreshHistory = useCallback(async () => {
    if (!exerciseId || !user) return;
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      const { data, error } = await supabase.rpc('get_challenge_history', {
        p_exercise_id: exerciseId,
        p_limit: 14,
      });
      if (error) throw error;
      setHistory((data ?? []).map(mapHistoryDay));
    } catch (err) {
      console.error('Daily Live history RPC failed:', err);
      const msg = err instanceof Error ? err.message : 'Verlauf konnte nicht geladen werden.';
      setHistoryError(msg);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [exerciseId, user]);

  // ── loadHistoryDay ────────────────────────────────────────────────────────
  // Lädt Tageszusammenfassung + finale Rangliste für einen abgeschlossenen Tag.
  // Gecacht per exerciseId+challengeDate für die Modal-Lebensdauer.
  const loadHistoryDay = useCallback(async (challengeDate: string) => {
    if (!exerciseId || !user) return;
    if (isLoadingDayRef.current) return; // Doppelklick-Schutz

    const cacheKey = `${exerciseId}_${challengeDate}`;
    const cached = dayDetailsCacheRef.current.get(cacheKey);
    if (cached) {
      setSelectedDayDetails(cached);
      setDayDetailsError(null);
      return;
    }

    isLoadingDayRef.current = true;
    setIsLoadingDayDetails(true);
    setDayDetailsError(null);
    setSelectedDayDetails(null);
    try {
      const { data, error } = await supabase.rpc('get_daily_challenge_day_details', {
        p_exercise_id: exerciseId,
        p_date:        challengeDate,
      });
      if (error) throw error;
      if (!data) throw new Error('Keine Daten erhalten.');
      if ('error' in data && data.error) throw new Error(String(data.error));
      const mapped = mapDayDetails(data);
      dayDetailsCacheRef.current.set(cacheKey, mapped);
      setSelectedDayDetails(mapped);
    } catch (err) {
      console.error('Daily Live day-details RPC failed:', err);
      const msg = err instanceof Error ? err.message : 'Tagesdetails konnten nicht geladen werden.';
      setDayDetailsError(msg);
    } finally {
      isLoadingDayRef.current = false;
      setIsLoadingDayDetails(false);
    }
  }, [exerciseId, user]);

  // ── loadHistoryParticipant ─────────────────────────────────────────────────
  // Lädt historische Satzliste + kombiniert mit Leaderboard-Eintrag aus dem
  // bereits gecachten Tagesergebnis.
  // Gecacht per exerciseId+challengeDate+userId.
  const loadHistoryParticipant = useCallback(async (challengeDate: string, userId: string) => {
    if (!exerciseId || !user) return;
    if (isLoadingParticipantRef.current) return; // Doppelklick-Schutz

    const cacheKey = `${exerciseId}_${challengeDate}_${userId}`;
    const cached = participantCacheRef.current.get(cacheKey);
    if (cached) {
      setSelectedParticipantDetails(cached);
      setParticipantDetailsError(null);
      return;
    }

    isLoadingParticipantRef.current = true;
    setIsLoadingParticipantDetails(true);
    setParticipantDetailsError(null);
    setSelectedParticipantDetails(null);
    try {
      // Leaderboard-Eintrag aus Tages-Cache holen (Tag muss vorher geladen worden sein)
      const dayCacheKey = `${exerciseId}_${challengeDate}`;
      const dayDetails = dayDetailsCacheRef.current.get(dayCacheKey);
      const resultRow = dayDetails?.leaderboard.find(e => e.userId === userId);
      if (!resultRow) throw new Error('Teilnehmer nicht gefunden. Bitte gehe zurück und versuche es erneut.');

      // Satzliste laden
      const { data: setsData, error: setsError } = await supabase.rpc(
        'get_daily_challenge_participant_sets',
        {
          p_exercise_id: exerciseId,
          p_date:        challengeDate,
          p_user_id:     userId,
        },
      );
      if (setsError) throw setsError;

      const sets: DailyChallengeHistoricalSet[] = (setsData ?? []).map(mapHistoricalSet);

      const participant: DailyChallengeParticipantDetails = {
        userId:           resultRow.userId,
        displayName:      resultRow.displayName,
        avatarUrl:        resultRow.avatarUrl,
        rank:             resultRow.rank,
        totalRepetitions: resultRow.totalRepetitions,
        setCount:         resultRow.setCount,
        maxSet:           resultRow.maxSet,
        minSet:           resultRow.minSet,
        avgSet:           resultRow.avgSet,
        firstSetAt:       resultRow.firstSetAt,
        lastSetAt:        resultRow.lastSetAt,
        sets,
      };

      participantCacheRef.current.set(cacheKey, participant);
      setSelectedParticipantDetails(participant);
    } catch (err) {
      console.error('Daily Live participant-sets RPC failed:', err);
      const msg = err instanceof Error ? err.message : 'Teilnehmerdetails konnten nicht geladen werden.';
      setParticipantDetailsError(msg);
    } finally {
      isLoadingParticipantRef.current = false;
      setIsLoadingParticipantDetails(false);
    }
  }, [exerciseId, user]);

  // ── refreshToday ──────────────────────────────────────────────────────────
  const refreshToday = useCallback(async () => {
    await refreshStatus();
    await Promise.all([refreshLeaderboard(), refreshMySets()]);
  }, [refreshStatus, refreshLeaderboard, refreshMySets]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Initial-Load beim Mounten bzw. wenn sich Übung/User ändert
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Rangliste + eigene Sätze laden, sobald challengeDate bekannt ist
  useEffect(() => {
    if (!challengeDate || !user) return;
    void refreshLeaderboard();
    void refreshMySets();
  }, [challengeDate, user, refreshLeaderboard, refreshMySets]);

  // Realtime-Subscription auf live_activity (INSERT + UPDATE)
  // → Rangliste + Sätze automatisch aktuell halten, sobald irgendein Nutzer
  //   einen Satz erstellt, bearbeitet oder löscht.
  //
  // Warum live_activity statt workout_entries direkt:
  //   workout_entries hat RLS "nur eigene Zeilen" (workout_select_own).
  //   Supabase Realtime erzwingt RLS bei Postgres-Changes-Subscriptions für
  //   authenticated-Clients — ein Client würde also NIE die Events anderer
  //   Nutzer erhalten, nur seine eigenen. Für eine gemeinsame Live-Rangliste
  //   ist das nutzlos. live_activity ist eine bereits bestehende, öffentlich
  //   lesbare Aggregat-Tabelle (RLS: SELECT true für alle authenticated), die
  //   bei jedem workout_entries-Insert/-Update/-Delete automatisch per
  //   Trigger aktualisiert wird (siehe 20260716_arena_feed_v2.sql) und dient
  //   hier nur als Signal ("irgendwas hat sich geändert") — die eigentlichen
  //   Daten kommen weiterhin aus get_daily_challenge_leaderboard/
  //   get_my_challenge_sets (direkt aus workout_entries, SECURITY DEFINER).
  useEffect(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (!isActive || !exerciseId || !challengeDate) return;

    const channelName = `${channelIdRef.current}_live_activity_${exerciseId}_${challengeDate}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'live_activity',
          filter: `exercise_id=eq.${exerciseId}`,
        },
        () => {
          // Debounce: bei mehreren schnellen Events in Folge nur einmal refreshen.
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = setTimeout(() => {
            realtimeDebounceRef.current = null;
            void refreshLeaderboard();
            void refreshMySets();
          }, 300);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      // Pending debounce-Timer abbrechen, damit kein veralteter Refresh nach
      // Unmount oder Channel-Neuaufbau ausgeführt wird.
      if (realtimeDebounceRef.current) {
        clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = null;
      }
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [isActive, exerciseId, challengeDate, refreshLeaderboard, refreshMySets]);

  // Sichtbarkeits-Änderung: Status neu laden nach langer Pause ODER Tageswechsel.
  //
  // Problem ohne Tageswechsel-Erkennung:
  //   App wird z. B. um 23:58 versteckt und um 00:02 wieder sichtbar (4 Min).
  //   Der 5-Minuten-Throttle würde keinen Refresh auslösen. Das Countdown-
  //   setInterval ist auf iOS Safari im Hintergrund stark gedrosselt und hat
  //   onEnd ggf. noch nicht gefeuert. UI zeigt fälschlich noch "Challenge läuft".
  //
  // Fix: Berliner Datum lokal berechnen (Intl, DST-korrekt) und mit dem zuletzt
  // gespeicherten challengeDate vergleichen. Abweichung = Tageswechsel →
  // sofortiger Refresh, unabhängig vom Throttle.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (hiddenAt === null) return;

        const hiddenTooLong = Date.now() - hiddenAt > VISIBILITY_REFETCH_MS;

        // Berliner Datum lokal schätzen (sv-SE liefert YYYY-MM-DD).
        // Dient nur als Indikator für Tageswechsel — Serverzeit bleibt maßgeblich.
        const berlinDateNow = new Date().toLocaleDateString('sv-SE', {
          timeZone: 'Europe/Berlin',
        });
        const dayChanged =
          currentChallengeDateRef.current !== null &&
          currentChallengeDateRef.current !== berlinDateNow;

        if (hiddenTooLong || dayChanged) {
          void refreshStatus();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refreshStatus]);

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    // Status
    status,
    isActive,
    challengeDate,
    startsAt:             status?.startsAt             ?? null,
    endsAt:               status?.endsAt               ?? null,
    serverNow:            status?.serverNow            ?? null,

    // Daten
    leaderboard,
    mySets,
    history,
    selectedDayDetails,
    selectedParticipantDetails,

    // Lade-Flags
    isLoadingStatus,
    isLoadingLeaderboard,
    isLoadingMySets,
    isLoadingHistory,
    isLoadingDayDetails,
    isLoadingParticipantDetails,

    // Fehlerzustände
    statusError,
    leaderboardError,
    setsError,
    historyError,
    dayDetailsError,
    participantDetailsError,

    // Aktionen
    refreshStatus,
    refreshLeaderboard,
    refreshMySets,
    refreshHistory,
    loadHistoryDay,
    loadHistoryParticipant,
    refreshToday,
  };
}

export type UseDailyChallengeReturn = ReturnType<typeof useDailyChallenge>;
