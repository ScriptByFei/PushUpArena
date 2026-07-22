// Hook für die gesamte Daily-Challenge-Logik.
//
// Architektur-Entscheidungen:
//  • Kein React Query — analog zu useLeaderboard / useWorkoutLogger
//  • Übung kommt aus ExerciseContext (aktuelle Übung des Users)
//  • Countdown läuft lokal, wird bei Tagesgrenze (05:00 / 00:00) mit dem
//    Server re-synchronisiert (via refreshStatus)
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
  DC_ERROR_MESSAGES,
  mapHistoryDay,
  mapLeaderboardEntry,
  mapSet,
  mapStatus,
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

  // ── Aktions-States ────────────────────────────────────────────────────────
  const [isJoining, setIsJoining]                 = useState(false);
  const [isLoggingSet, setIsLoggingSet]           = useState(false);
  const [actionError, setActionError]             = useState<string | null>(null);

  // ── Countdown (lokal getaktet, per Status-Load re-synchronisiert) ─────────
  const [secondsUntilStart, setSecondsUntilStart] = useState(0);
  const [secondsUntilEnd, setSecondsUntilEnd]     = useState(0);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const isLoggingRef              = useRef(false);   // parallele logSet-Aufrufe verhindern
  const currentChallengeDateRef   = useRef<string | null>(null);
  const countdownTimerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef                = useRef<RealtimeChannel | null>(null);
  const hiddenAtRef               = useRef<number | null>(null);

  // Stable ref auf refreshStatus (für Countdown-Closures)
  const refreshStatusRef = useRef<() => Promise<void>>(() => Promise.resolve());

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
      setSecondsUntilStart(mapped.secondsUntilStart);
      setSecondsUntilEnd(mapped.secondsUntilEnd);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Status konnte nicht geladen werden.';
      setStatusError(msg);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [exerciseId, user]);

  // Ref aktuell halten (für Countdown-Timer-Closures, die keinen Stale-State sehen dürfen)
  useEffect(() => {
    refreshStatusRef.current = refreshStatus;
  }, [refreshStatus]);

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
  const logSet = useCallback(async (repetitions: number) => {
    if (!exerciseId || !user) return;
    if (isLoggingRef.current) return; // parallele Aufrufe blockieren
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
        // Cooldown: verbleibende Sekunden in der Fehlermeldung anzeigen
        if (code === 'COOLDOWN_ACTIVE' && data.seconds_remaining != null) {
          msg = `Noch ${data.seconds_remaining}s warten.`;
        }
        setActionError(msg);
        toast.error(msg);
        return;
      }
      // Erfolg
      const total = data?.total_repetitions ?? '–';
      toast.success(`+${repetitions} Wdh. gespeichert! Gesamt heute: ${total}`);
      await Promise.all([refreshLeaderboard(), refreshMySets()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : DC_ERROR_MESSAGES.UNKNOWN;
      setActionError(msg);
      toast.error(msg);
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

  // Countdown-Ticker: lokal runterzählen, bei 0 Status neu laden
  useEffect(() => {
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (!status) return;

    countdownTimerRef.current = setInterval(() => {
      setSecondsUntilStart(s => {
        if (s <= 1) { void refreshStatusRef.current(); return 0; }
        return s - 1;
      });
      setSecondsUntilEnd(e => {
        if (e <= 1) { void refreshStatusRef.current(); return 0; }
        return e - 1;
      });
    }, 1000);

    return () => {
      if (countdownTimerRef.current !== null) {
        clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = null;
      }
    };
  }, [status]); // status als Dependency: bei neuem Status Seed-Werte neu setzen

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
    secondsUntilStart,
    secondsUntilEnd,

    // Daten
    leaderboard,
    mySets,
    history,

    // Lade-Flags
    isLoadingStatus,
    isLoadingLeaderboard,
    isLoadingMySets,
    isLoadingHistory,
    isJoining,
    isLoggingSet,

    // Fehlerzustände
    statusError,
    leaderboardError,
    setsError,
    historyError,
    actionError,

    // Aktionen
    refreshStatus,
    refreshLeaderboard,
    refreshMySets,
    refreshHistory,
    refreshToday,
    joinChallenge,
    logSet,
  };
}

export type UseDailyChallengeReturn = ReturnType<typeof useDailyChallenge>;
