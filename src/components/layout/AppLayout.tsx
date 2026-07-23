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
import { DailyChallengeModal } from '@/components/DailyChallengeModal';
import { NavDrawer, type NavDrawerHandle } from '@/components/navigation/NavDrawer';

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

/**
 * Route order used to determine slide direction for BottomNav tap animations.
 * Tab-swipe navigation has been removed; only the NavDrawer is swipeable.
 */
const SWIPE_ROUTES = ['/', '/friends', '/leaderboard', '/activity', '/profile'];

/** px from left edge to activate drawer-open gesture (Dashboard only). */
const EDGE_ZONE = 20;

/** Dead zone (px) before committing to a gesture axis. */
const AXIS_LOCK_THRESHOLD = 8;

/** |dx| must exceed |dy| × this factor to lock horizontal. */
const H_DOMINANCE = 1.2;

/** Fraction of drawer width needed to commit open/close. */
const OPEN_THRESHOLD = 0.3;

/** Minimum swipe velocity (px/ms) to commit open/close. */
const VELOCITY_THRESHOLD = 0.45;

/* ─── Gesture mode ───────────────────────────────────────────────────────── */

/**
 * Determined ONCE at pointerdown; never changed during a gesture.
 * - "drawer": may open or close the nav drawer
 * - "none":   ignore this gesture entirely
 * - "idle":   default / post-reset state
 *
 * Page-swipe between tabs has been intentionally removed. Navigation between
 * the five main tabs is done exclusively via the BottomNav.
 */
type GestureMode = 'idle' | 'drawer' | 'none';

/* ─── Page animation variants ────────────────────────────────────────────── */

const pageVariants = {
  enter: (dir: number) => ({ x: dir >= 0 ? '100%' : '-100%' }),
  center: { x: 0 },
  exit:  (dir: number) => ({ x: dir >= 0 ? '-100%' : '100%' }),
};

const pageTransition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
};

/* ─── Component ──────────────────────────────────────────────────────────── */

export function AppLayout() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'PushupArena';
  const { pushPermission, busy, togglePush } = usePush();
  const pushActive = pushPermission === 'granted';
  const navigate = useNavigate();

  /* ── Permanent refs ──────────────────────────────────────────────────── */

  const rootRef       = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerNavRef  = useRef<NavDrawerHandle>(null);

  /** Mirrors `drawerOpen` state so stable gesture callbacks can read it. */
  const drawerOpenRef = useRef(false);
  const hiddenAtRef   = useRef<number | null>(null);

  /* ── Slide direction: computed synchronously during render ───────────── */
  //
  // Stored in a ref so AnimatePresence reads the updated value in the same
  // render that processes the new pathname — avoids useEffect lag.

  const prevPathnameRef   = useRef(pathname);
  const swipeDirectionRef = useRef(1);

  if (pathname !== prevPathnameRef.current) {
    const prevIdx = SWIPE_ROUTES.indexOf(prevPathnameRef.current);
    const currIdx = SWIPE_ROUTES.indexOf(pathname);
    if (prevIdx !== -1 && currIdx !== -1) {
      swipeDirectionRef.current = currIdx >= prevIdx ? 1 : -1;
    }
    prevPathnameRef.current = pathname;
  }

  /* ── Gesture refs — never trigger re-renders ─────────────────────────── */

  /** Current gesture mode; set once at pointerdown. */
  const gestureMode        = useRef<GestureMode>('idle');
  /** Whether the gesture axis has been committed. */
  const axisLocked         = useRef(false);
  /** True once axis is confirmed horizontal. */
  const axisIsHorizontal   = useRef(false);
  const startX             = useRef(0);
  const startY             = useRef(0);
  const startTime          = useRef(0);

  /* ── React state ─────────────────────────────────────────────────────── */

  const [drawerOpen, setDrawerOpen]                 = useState(false);
  const [recapManualOpen, setRecapManualOpen]       = useState(false);
  const [bellConfirmOpen, setBellConfirmOpen]       = useState(false);
  const [feedOpen, setFeedOpen]                     = useState(false);
  const [dailyChallengeOpen, setDailyChallengeOpen] = useState(false);

  // Keep ref in sync with state on every render
  drawerOpenRef.current = drawerOpen;

  /* ── Drawer helpers ──────────────────────────────────────────────────── */

  const openDrawer = useCallback(() => {
    drawerNavRef.current?.snapOpen();
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    drawerNavRef.current?.snapClose();
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  /** Snap-close without focus change (gesture-initiated close). */
  const closeDrawerNoFocus = useCallback(() => {
    drawerNavRef.current?.snapClose();
    setDrawerOpen(false);
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
          navigate('/');
        }
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [navigate]);

  /* ── Central gesture reset ───────────────────────────────────────────── */

  const resetGesture = useCallback(() => {
    gestureMode.current      = 'idle';
    axisLocked.current       = false;
    axisIsHorizontal.current = false;
  }, []);

  /* ── Pointer event handlers (drawer only) ────────────────────────────── */

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary) return;

      resetGesture();

      const { clientX, clientY } = e;
      startX.current    = clientX;
      startY.current    = clientY;
      startTime.current = performance.now();

      // Drawer is already open → allow closing gesture from anywhere
      if (drawerOpenRef.current) {
        gestureMode.current = 'drawer';
        return;
      }

      // Left-edge on Dashboard only → drawer-open gesture
      if (clientX <= EDGE_ZONE && pathname === '/') {
        gestureMode.current = 'drawer';
        return;
      }

      // Everything else: no gesture
      gestureMode.current = 'none';
    },
    [pathname, resetGesture],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary) return;

      const mode = gestureMode.current;
      if (mode === 'none' || mode === 'idle') return;

      const dx    = e.clientX - startX.current;
      const dy    = e.clientY - startY.current;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // ── Axis lock phase ───────────────────────────────────────────────

      if (!axisLocked.current) {
        if (Math.max(absDx, absDy) < AXIS_LOCK_THRESHOLD) return;

        if (absDx > absDy * H_DOMINANCE) {
          axisLocked.current       = true;
          axisIsHorizontal.current = true;
          rootRef.current?.setPointerCapture(e.pointerId);
        } else {
          // Vertical → abandon drawer gesture
          resetGesture();
          return;
        }
      }

      if (!axisIsHorizontal.current) return;

      e.preventDefault();

      // ── Drawer drag ───────────────────────────────────────────────────

      if (mode === 'drawer') {
        const w = drawerNavRef.current?.getWidth() ?? 340;
        if (drawerOpenRef.current) {
          // Closing: drag left
          const clamped = Math.max(-w, Math.min(0, dx));
          drawerNavRef.current?.setDragX(clamped);
        } else {
          // Opening: drag right from left edge
          const raw     = -w + dx;
          const clamped = Math.max(-w, Math.min(0, raw));
          drawerNavRef.current?.setDragX(clamped);
        }
      }
    },
    [resetGesture],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary) return;

      const mode = gestureMode.current;
      const dx   = e.clientX - startX.current;
      const dt   = Math.max(1, performance.now() - startTime.current);
      const vel  = Math.abs(dx) / dt;

      if (mode === 'drawer') {
        const w = drawerNavRef.current?.getWidth() ?? 340;

        if (!axisLocked.current || !axisIsHorizontal.current) {
          // No committed horizontal direction → snap to current stable state
          if (drawerOpenRef.current) drawerNavRef.current?.snapOpen();
          else drawerNavRef.current?.snapClose();
        } else if (drawerOpenRef.current) {
          // Closing gesture
          const fraction = Math.abs(Math.min(0, dx)) / w;
          if (fraction >= OPEN_THRESHOLD || vel >= VELOCITY_THRESHOLD) {
            closeDrawerNoFocus();
          } else {
            drawerNavRef.current?.snapOpen();
          }
        } else {
          // Opening gesture
          const fraction = Math.max(0, Math.min(w, dx)) / w;
          if (fraction >= OPEN_THRESHOLD || vel >= VELOCITY_THRESHOLD) {
            openDrawer();
          } else {
            drawerNavRef.current?.snapClose();
          }
        }
      }

      resetGesture();
    },
    [openDrawer, closeDrawerNoFocus, resetGesture],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (!e.isPrimary) return;

      const mode = gestureMode.current;

      // Restore drawer to last stable state on cancel
      if (mode === 'drawer') {
        if (drawerOpenRef.current) drawerNavRef.current?.snapOpen();
        else drawerNavRef.current?.snapClose();
      }

      resetGesture();
    },
    [resetGesture],
  );

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div
      ref={rootRef}
      className="mx-auto flex min-h-screen max-w-md flex-col"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
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
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
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
      <main className="relative flex-1 overflow-hidden">
        <AnimatePresence initial={false} custom={swipeDirectionRef.current} mode="popLayout">
          <motion.div
            key={pathname}
            custom={swipeDirectionRef.current}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="absolute inset-0 overflow-y-auto px-4 pb-32 pt-3"
            style={{ touchAction: 'pan-y' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />

      {/* ── Overlays / modals ─────────────────────────────────────────── */}

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

      {/* Navigation Drawer — always mounted; animation via MotionValues in NavDrawer */}
      <NavDrawer
        ref={drawerNavRef}
        open={drawerOpen}
        onClose={closeDrawer}
        onOpenFeed={() => setFeedOpen(true)}
        onOpenRecap={handleOpenRecap}
        onOpenDailyChallenge={() => setDailyChallengeOpen(true)}
      />
    </div>
  );
}
