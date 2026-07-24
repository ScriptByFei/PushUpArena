import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { SettingsIcon, BellIcon, BellOffIcon, MenuIcon } from '@/components/ui/icons';
import { usePush } from '@/context/PushContext';
import { DailyRecapModal } from '@/components/DailyRecapModal';
import { useDailyRecap } from '@/hooks/useDailyRecap';
import { ExerciseChip } from '@/components/ExerciseChip';
import { useExercise } from '@/context/ExerciseContext';
import { ArenaFeed } from '@/components/ArenaFeed';
import { FABSheet } from '@/components/FABSheet';
import { DailyChallengeModal } from '@/components/DailyChallengeModal';
import { NavDrawer, type NavDrawerHandle } from '@/components/navigation/NavDrawer';
import { useNavBadges } from '@/hooks/useNavBadges';

/* ─── Page metadata ──────────────────────────────────────────────────────── */

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/track': 'Eintragen',
  '/friends': 'Freunde',
  '/activity': 'Aktivität',
  '/achievements': 'Erfolge · PushUp',
  '/leaderboard': 'Rangliste',
  '/profile': 'Profil',
  '/settings': 'Einstellungen',
};

/* ─── Constants ──────────────────────────────────────────────────────────── */

/** Re-navigate home after this long in the background. */
const BACKGROUND_THRESHOLD_MS = 5 * 60 * 1000;

/* ─── Component ──────────────────────────────────────────────────────────── */

export function AppLayout() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'PushupArena';
  const { pushPermission, busy, togglePush } = usePush();
  const pushActive = pushPermission === 'granted';
  const navigate = useNavigate();

  /* ── Permanent refs ──────────────────────────────────────────────────── */

  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerNavRef  = useRef<NavDrawerHandle>(null);
  const drawerOpenRef = useRef(false);
  const hiddenAtRef   = useRef<number | null>(null);

  /* ── React state ─────────────────────────────────────────────────────── */

  const [drawerOpen, setDrawerOpen]                 = useState(false);
  const [recapManualOpen, setRecapManualOpen]       = useState(false);
  const [bellConfirmOpen, setBellConfirmOpen]       = useState(false);
  const [feedOpen, setFeedOpen]                     = useState(false);
  const [dailyChallengeOpen, setDailyChallengeOpen] = useState(false);
  const [fabOpen, setFabOpen]                       = useState(false);
  const [fabInitialTab, setFabInitialTab]           = useState<'training' | 'rest'>('training');

  // Keep ref in sync with state on every render
  drawerOpenRef.current = drawerOpen;

  /* ── Drawer helpers (icon-only — no swipe) ───────────────────────────── */

  const openDrawer = useCallback(() => {
    drawerNavRef.current?.snapOpen();
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    drawerNavRef.current?.snapClose();
    setDrawerOpen(false);
    // Return focus to the trigger (hamburger) in a rAF so it runs after React
    // flushes the state update.  focus-visible:ring-2 ensures the ring only
    // appears for keyboard-triggered focus, not programmatic calls — so mouse
    // users won't see a stale ring after tap-to-close.
    requestAnimationFrame(() => {
      menuButtonRef.current?.focus();
    });
  }, []);

  const toggleDrawer = useCallback(() => {
    if (drawerOpenRef.current) closeDrawer();
    else openDrawer();
  }, [openDrawer, closeDrawer]);

  /* ── Other hooks ─────────────────────────────────────────────────────── */

  const {
    recap, open: recapOpen, dismiss: dismissRecap,
    forceLoad, navLoading, medalCounts, availableDates, currentDateIdx, goToDate,
  } = useDailyRecap();

  const { challengeIsActive, feedNewCount, clearFeedBadge } = useNavBadges();

  const { enrolledExercises } = useExercise();
  const showChip =
    enrolledExercises.length > 1 &&
    pathname !== '/' &&
    pathname !== '/global-stats' &&
    pathname !== '/achievements';

  const handleOpenRecap = useCallback(async () => {
    await forceLoad();
    setRecapManualOpen(true);
  }, [forceLoad]);

  const openFAB = useCallback((tab: 'training' | 'rest') => {
    setFabInitialTab(tab);
    setFabOpen(true);
  }, []);

  const handleTogglePush = useCallback(() => {
    if (pushActive) setBellConfirmOpen(true);
    else void togglePush();
  }, [pushActive, togglePush]);

  /* ── NavDrawer swipe gesture (open from left edge / drag to close) ─── */

  useEffect(() => {
    const EDGE_WIDTH = 50; // px — must match main.tsx touchstart guard zone

    let active        = false;
    let axisLocked: 'h' | 'v' | null = null;
    let startX        = 0;
    let startY        = 0;
    let lastTouchX    = 0;
    let lastTouchTime = 0;
    let velX          = 0; // px / ms — positive = right

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = lastTouchX = t.clientX;
      startY = t.clientY;
      lastTouchTime = e.timeStamp;
      velX = 0;
      axisLocked = null;

      const isOpen      = drawerOpenRef.current;
      const drawerWidth = drawerNavRef.current?.getWidth() ?? 340;

      // Open: touch must start in the left-edge zone when drawer is closed.
      // Close: touch can start anywhere over the open panel / backdrop.
      active = isOpen
        ? t.clientX < drawerWidth + 20
        : t.clientX < EDGE_WIDTH;
    };

    const onMove = (e: TouchEvent) => {
      if (!active || e.touches.length !== 1) return;
      const t  = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      // Velocity — rolling sample
      const dt = e.timeStamp - lastTouchTime;
      if (dt > 0) velX = (t.clientX - lastTouchX) / dt;
      lastTouchX    = t.clientX;
      lastTouchTime = e.timeStamp;

      // Axis lock on first significant movement
      if (!axisLocked) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axisLocked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (axisLocked !== 'h') { active = false; return; } // vertical → cancel

      const width  = drawerNavRef.current?.getWidth() ?? 340;
      const isOpen = drawerOpenRef.current;

      if (!isOpen) {
        // Opening: map finger from startX → panel from -width → 0
        const x = Math.min(0, Math.max(-width, dx - width));
        drawerNavRef.current?.setDragX(x);
      } else {
        // Closing: panel follows finger leftward from 0
        const x = Math.min(0, dx);
        drawerNavRef.current?.setDragX(x);
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!active) return;
      active = false;
      if (axisLocked !== 'h') return;

      const dx     = e.changedTouches[0].clientX - startX;
      const isOpen = drawerOpenRef.current;

      if (!isOpen) {
        // Finger moved right far enough or fast enough → open
        if (dx > 60 || velX > 0.4) openDrawer();
        else closeDrawer();
      } else {
        // Finger moved left far enough or fast enough → close
        if (dx < -60 || velX < -0.4) closeDrawer();
        else openDrawer(); // snap back to fully open
      }
    };

    document.addEventListener('touchstart', onStart,  { passive: true  });
    document.addEventListener('touchmove',  onMove,   { passive: true  });
    document.addEventListener('touchend',   onEnd,    { passive: true  });

    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove',  onMove);
      document.removeEventListener('touchend',   onEnd);
    };
  }, [openDrawer, closeDrawer]);

  /* ── Background return-home ──────────────────────────────────────────── */

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (
          hiddenAtRef.current !== null &&
          Date.now() - hiddenAtRef.current > BACKGROUND_THRESHOLD_MS
        ) {
          navigate('/', { replace: true });
        }
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [navigate]);

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div
      className="mx-auto flex h-full max-w-md flex-col"
      style={{
        touchAction: 'pan-y',
        overscrollBehavior: 'none',
        /* Safe-area insets — previously on body, now here so the body can be
           position:fixed (which prevents the iOS back-swipe entirely). */
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/80 backdrop-blur"
        style={{ paddingTop: 'max(4px, env(safe-area-inset-top))' }}
      >
        <div className="relative flex items-center" style={{ height: 48 }}>

          {/* Zone L — hamburger */}
          <div className="flex shrink-0 items-center pl-0">
            <button
              ref={menuButtonRef}
              id="nav-drawer-trigger"
              onClick={toggleDrawer}
              aria-label="Navigation öffnen"
              aria-expanded={drawerOpen}
              aria-controls="nav-drawer"
              className={
                'grid place-items-center rounded-lg text-slate-400 transition ' +
                'hover:bg-ink-800 active:bg-ink-700 ' +
                'focus:outline-none ' +
                'focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950'
              }
              style={{ width: 40, height: 48 }}
            >
              <MenuIcon className="h-[18px] w-[18px]" />
            </button>
          </div>

          {/* Zone C — title centred */}
          <span className="pointer-events-none absolute inset-x-0 text-center text-[15px] font-bold tracking-tight text-slate-100 whitespace-nowrap">
            {title}
          </span>

          {/* Zone R — ExerciseChip + Bell + Settings */}
          <div className="ml-auto flex shrink-0 items-center pr-0">
            {showChip && (
              <div className="mr-1">
                <ExerciseChip compact />
              </div>
            )}
            <button
              onClick={() => {
                if (pushActive) setBellConfirmOpen(true);
                else void togglePush();
              }}
              disabled={busy}
              aria-label={
                pushActive
                  ? 'Benachrichtigungen deaktivieren'
                  : 'Benachrichtigungen aktivieren'
              }
              className={`grid place-items-center rounded-lg transition hover:bg-ink-800 ${
                pushActive ? 'text-brand-400' : 'text-slate-500'
              }`}
              style={{ width: 48, height: 48 }}
            >
              {pushActive
                ? <BellIcon className="h-[18px] w-[18px]" />
                : <BellOffIcon className="h-[18px] w-[18px]" />
              }
            </button>
            <Link
              to="/settings"
              aria-label="Einstellungen"
              className="grid place-items-center rounded-lg text-slate-400 transition hover:bg-ink-800 hover:text-slate-200"
              style={{ width: 48, height: 48 }}
            >
              <SettingsIcon className="h-[18px] w-[18px]" />
            </Link>
          </div>

        </div>
      </header>

      {/* ── Page content ────────────────────────────────────────────────── */}
      {/*
       * AnimatePresence with mode="wait" + fade-only transition.
       * No horizontal translateX → no risk of triggering horizontal overflow
       * or an accidental swipe sensation on page change.
       */}
      <main className="relative flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12, ease: 'easeInOut' }}
            className="absolute inset-0 overflow-x-hidden overflow-y-auto px-4 pb-32 pt-3"
            style={{ touchAction: 'pan-y', overscrollBehaviorX: 'none' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav onOpenFAB={() => openFAB('training')} />

      {/* ── Overlays / modals ─────────────────────────────────────────── */}

      {fabOpen && (
        <FABSheet
          initialTab={fabInitialTab}
          onClose={() => setFabOpen(false)}
        />
      )}

      {feedOpen && <ArenaFeed onClose={() => setFeedOpen(false)} />}

      {dailyChallengeOpen && (
        <DailyChallengeModal onClose={() => setDailyChallengeOpen(false)} />
      )}

      {(recapOpen || recapManualOpen) && recap && (
        <DailyRecapModal
          recap={recap}
          onClose={() => { setRecapManualOpen(false); void dismissRecap(); }}
          availableDates={availableDates}
          currentDateIdx={currentDateIdx}
          onDateSelect={goToDate}
          navLoading={navLoading}
          medalCounts={medalCounts}
        />
      )}

      {recapManualOpen && !recap && !navLoading && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setRecapManualOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />
            <p className="text-center text-base font-bold text-slate-100">Noch kein Recap</p>
            <p className="mt-2 text-center text-sm text-slate-500">
              Der erste Rückblick erscheint morgen früh nach Mitternacht.
            </p>
            <button
              onClick={() => setRecapManualOpen(false)}
              className="mt-6 w-full rounded-2xl border border-ink-600 py-3 text-sm font-semibold text-slate-300 transition hover:bg-ink-700"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {bellConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setBellConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ink-600" />
            <p className="mb-1 text-center text-base font-bold text-slate-100">
              Benachrichtigungen deaktivieren?
            </p>
            <p className="mb-6 text-center text-sm text-slate-500">
              Du verpasst dann tägliche Erinnerungen und Ranglisten-Updates.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setBellConfirmOpen(false)}
                className="flex-1 rounded-2xl border border-ink-600 py-3 text-sm font-semibold text-slate-300 transition hover:bg-ink-700"
              >
                Abbrechen
              </button>
              <button
                onClick={() => { setBellConfirmOpen(false); void togglePush(); }}
                className="flex-1 rounded-2xl bg-red-500/20 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500/30"
              >
                Deaktivieren
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Drawer — opened/closed exclusively via the menu icon */}
      <NavDrawer
        ref={drawerNavRef}
        open={drawerOpen}
        onClose={closeDrawer}
        onOpenFeed={() => { setFeedOpen(true); clearFeedBadge(); }}
        onOpenRecap={handleOpenRecap}
        onOpenDailyChallenge={() => setDailyChallengeOpen(true)}
        challengeIsActive={challengeIsActive}
        feedNewCount={feedNewCount}
        hasUnreadRecap={recapOpen}
        onOpenTraining={() => openFAB('training')}
        onOpenRestDay={() => openFAB('rest')}
      />
    </div>
  );
}
