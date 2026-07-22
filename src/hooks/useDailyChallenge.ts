// Hook für die gesamte Daily-Challenge-Logik.
//
// Architektur-Entscheidungen:
//  • Kein React Query — analog zu useLeaderboard / useWorkoutLogger
//  • Übung kommt aus ExerciseContext (aktuelle Übung des Users)
//  • Countdown isoliert in DailyChallengeCountdown (useCountdown-Hook);
//    dieser Hook enthält kein eigenes setInterval mehr → kein sekündlicher
//    Re-Render des gesamten Modals
//  • Status wird bei Tagesgrenze via onEnd-Callback aus useCountdown
//    still im Hintergrund aktualisiert (kein Skeleton-Flash)
//  • Realtime-Subscription (INSERT auf daily_challenge_entries) → Rangliste
//    + Sätze neu laden. Benötigt: ALTER PUBLICATION supabase_realtime ADD
//    TABLE daily_challenge_entries; (TODO Phase 4 falls noch nicht gesetzt)
//  • isLoggingRef verhindert parallele logSet-Aufrufe (race-safe)

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useExercise } from '@/context/ExerciseContext';
import { useToast } from '@/context/ToastContext';
import {
  type DailyChallengeHistoryDay,
  type DailyChallengeLeaderboardEntry,
  type DailyChallengeSet,
  type DailyChallengeStatus,
  type DailyChallengeDayDetails,
  type DailyChallengeParticipantDetails,
  type DailyChallengeHistoricalSet,
  DC_ERROR_MESSAGES,
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
  const { exercise } = useExercise();
  const toast = useToast();
  const exerciseId = exercise?.id ?? null;

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

  // ── Aktions-States ────────────────────────────────────────────────────────
  const [isJoining, setIsJoining]                 = useState(false);
  const [isLoggingSet, setIsLoggingSet]           = useState(false);
  const [actionError, setActionError]             = useState<string | null>(null);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const isLoggingRef              = useRef(false);   // parallele logSet-Aufrufe verhindern
  const currentChallengeDateRef   = useRef<string | null>(null);
  const channelRef                = useRef<RealtimeChannel | null>(null);
  const hiddenAtRef               = useRef<number | null>(null);
  // Caches für Tages- und Teilnehmerdetails (Modal-Lebensdauer)
  const dayDetailsCacheRef        = useRef(new Map<string, DailyChallengeDayDetails>());
  const participantCacheRef       = useRef(new Map<string, DailyChallengeParticipantDetails>());
  // Schutz vor Doppelklick-Races
  const isLoadingDayRef           = useRef(false);
  const isLoadingParticipantRef   = useRef(false);

  // ── Derived ───────────────────────────────────────────────────────────────
  const isActive      = status?.isActive  ?? false;
  const hasJoined     = status?.hasJoined ?? false;
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

  // ── joinChallenge ─────────────────────────────────────────────────────────
  const joinChallenge = useCallback(async () => {
    if (!exerciseId || !user) return;
    setIsJoining(true);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc('join_daily_challenge', {
        p_exercise_id: exerciseId,
      });
      if (error) throw error;
      if (data?.error) {
        const msg = DC_ERROR_MESSAGES[data.error] ?? DC_ERROR_MESSAGES.UNKNOWN;
        setActionError(msg);
        toast.error(msg);
        return;
      }
      await refreshStatus();
      await refreshLeaderboard();
      if (data?.status === 'JOINED') {
        toast.success('Du nimmst heute an der Daily Challenge teil! 🔥');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : DC_ERROR_MESSAGES.UNKNOWN;
      setActionError(msg);
      toast.error(msg);
    } finally {
      setIsJoining(false);
    }
  }, [exerciseId, user, refreshStatus, refreshLeaderboard, toast]);

  // ── logSet ────────────────────────────────────────────────────────────────
  // Gibt { ok: true } bei Erfolg zurück, { ok: false, secondsRemaining? } bei Fehler.
  // Die Komponente nutzt ok um den Cooldown zu starten und die Erfolgsmeldung zu zeigen.
  const logSet = useCallback(async (repetitions: number): Promise<{ ok: boolean; secondsRemaining?: number }> => {
    if (!exerciseId || !user) return { ok: false };
    if (isLoggingRef.current) return { ok: false }; // parallele Aufrufe blockieren
    isLoggingRef.current = true;
    setIsLoggingSet(true);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc('log_challenge_set', {
        p_exercise_id:   exerciseId,
        p_repetitions:   repetitions,
      });
      if (error) throw error;
      if (data?.error) {
        const code = data.error as string;
        let msg = DC_ERROR_MESSAGES[code] ?? DC_ERROR_MESSAGES.UNKNOWN;
        let secondsRemaining: number | undefined;
        if (code === 'COOLDOWN_ACTIVE' && data.seconds_remaining != null) {
          secondsRemaining = data.seconds_remaining;
          msg = `Noch ${data.seconds_remaining}s warten.`;
        }
        setActionError(msg);
        toast.error(msg);
        return { ok: false, secondsRemaining };
      }
      // Erfolg
      const total = data?.total_repetitions ?? '–';
      toast.success(`+${repetitions} Wdh. gespeichert! Gesamt heute: ${total}`);
      await Promise.all([refreshLeaderboard(), refreshMySets()]);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : DC_ERROR_MESSAGES.UNKNOWN;
      setActionError(msg);
      toast.error(msg);
      return { ok: false };
    } finally {
      isLoggingRef.current = false;
      setIsLoggingSet(false);
    }
  }, [exerciseId, user, refreshLeaderboard, refreshMySets, toast]);

  // ── Effects ───────────────────────────────────────────────────────────────

  // Initial-Load beim Mounten bzw. wenn sich Übung/User ändert
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  // Rangliste + eigene Sätze laden, sobald challengeDate bekannt ist
  useEffect(() => {
    if (!challengeDate || !user) return;
    void refreshLeaderboard();
    if (hasJoined) void refreshMySets();
  }, [challengeDate, hasJoined, user, refreshLeaderboard, refreshMySets]);

  // Realtime-Subscription auf daily_challenge_entries (INSERT)
  // → Rangliste + Sätze automatisch aktuell halten wenn Challenge läuft
  // Voraussetzung: ALTER PUBLICATION supabase_realtime ADD TABLE daily_challenge_entries;
  useEffect(() => {
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (!isActive || !hasJoined || !exerciseId || !challengeDate) return;

    const channelName = `dc_entries_${exerciseId}_${challengeDate}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'daily_challenge_entries',
          filter: `exercise_id=eq.${exerciseId}`,
        },
        () => {
          void refreshLeaderboard();
          void refreshMySets();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [isActive, hasJoined, exerciseId, challengeDate, refreshLeaderboard, refreshMySets]);

  // Sichtbarkeits-Änderung: nach langer Pause Status neu laden
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const hiddenAt = hiddenAtRef.current;
        hiddenAtRef.current = null;
        if (hiddenAt !== null && Date.now() - hiddenAt > VISIBILITY_REFETCH_MS) {
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
    hasJoined,
    challengeDate,
    startsAt:  status?.startsAt  ?? null,
    endsAt:    status?.endsAt    ?? null,
    serverNow: status?.serverNow ?? null,

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
    isJoining,
    isLoggingSet,

    // Fehlerzustände
    statusError,
    leaderboardError,
    setsError,
    historyError,
    dayDetailsError,
    participantDetailsError,
    actionError,

    // Aktionen
    refreshStatus,
    refreshLeaderboard,
    refreshMySets,
    refreshHistory,
    loadHistoryDay,
    loadHistoryParticipant,
    refreshToday,
    joinChallenge,
    logSet,
  };
}

export type UseDailyChallengeReturn = ReturnType<typeof useDailyChallenge>;
