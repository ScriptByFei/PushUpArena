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

/** Routes that support left→right page-swipe navigation (matches BottomNav order). */
const SWIPE_ROUTES = ['/', '/friends', '/leaderboard', '/activity', '/profile'];


/* ─── Gesture constants ──────────────────────────────────────────────────── */

/** px from left edge that activates pending-edge mode. */
const EDGE_SWIPE_WIDTH = 20;
/** Dead zone (px) before committing to a gesture direction. */
const DIR_LOCK_DIST = 10;
/** abs(dx) must exceed abs(dy) × this to lock horizontal. */
const H_DOMINANCE = 1.2;
/** Fraction of drawer width needed to commit open/close on release. */
const OPEN_THRESHOLD = 0.3;
/** px/ms flick speed to commit open/close regardless of distance. */
const VELOCITY_THRESHOLD = 0.45;
/** px from bottom of screen to ignore (BottomNav area). */
const BOTTOM_NAV_EXCLUSION = 80;

/* ─── Gesture state machine type ────────────────────────────────────────── */

type GestureMode =
  | 'idle'
  | 'pending-edge'   // started in left edge zone, direction undecided
  | 'pending-close'  // drawer open, direction undecided
  | 'pending-page'   // normal area, closed drawer, direction undecided
  | 'drawer-open'    // finger is dragging the drawer open
  | 'drawer-close'   // finger is dragging the drawer closed
  | 'page-swipe'     // horizontal page transition
  | 'vertical';      // vertical scroll — hands off

/* ─── Page animation variants ───────────────────────────────────────────── */

const pageVariants = {
  enter: (dir: number) => ({ x: dir >= 0 ? '100%' : '-100%' }),
  center: { x: 0 },
  exit: (dir: number) => ({ x: dir >= 0 ? '-100%' : '100%' }),
};

/* ─── Component ──────────────────────────────────────────────────────────── */

export function AppLayout() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'PushupArena';
  const { pushPermission, busy, togglePush } = usePush();
  const pushActive = pushPermission === 'granted';
  const navigate = useNavigate();

  /* ── Permanent refs ──────────────────────────────────────────────────── */

  const rootRef          = useRef<HTMLDivElement>(null);
  const menuButtonRef    = useRef<HTMLButtonElement>(null);
  const drawerNavRef     = useRef<NavDrawerHandle>(null);

  // Drawer open state mirrored in a ref so stable callbacks can read it
  const drawerOpenRef    = useRef(false);
  const hiddenAtRef      = useRef<number | null>(null);
  const swipeDirection   = useRef<number>(1);
  const prevPathname     = useRef(pathname);

  /* ── Gesture refs ────────────────────────────────────────────────────── */

  const gestureMode           = useRef<GestureMode>('idle');
  const touchStartX           = useRef(0);
  const touchStartY           = useRef(0);
  const touchStartTime        = useRef(0);
  /** Last pointer position tracked on every pointermove — used in pointercancel fallback. */
  const lastPointerX          = useRef(0);
  const lastPointerY          = useRef(0);
  /**
   * Set to true as soon as the gesture locks to drawer-open or drawer-close.
   * Prevents the page-swipe handler from firing if both gesture paths are
   * somehow racing (e.g. multi-touch, edge-zone boundary ambiguity).
   */
  const isDrawerGestureActive = useRef(false);

  /* ── React state ─────────────────────────────────────────────────────── */

  const [drawerOpen, setDrawerOpen]               = useState(false);
  const [recapManualOpen, setRecapManualOpen]     = useState(false);
  const [bellConfirmOpen, setBellConfirmOpen]     = useState(false);
  const [feedOpen, setFeedOpen]                   = useState(false);
  const [dailyChallengeOpen, setDailyChallengeOpen] = useState(false);

  // Keep ref in sync with state on every render
  drawerOpenRef.current = drawerOpen;

  /* ── Drawer open / close ─────────────────────────────────────────────── */

  /**
   * Snap-open the drawer and update logical state.
   * Animation is driven imperatively; no focus change (gesture-triggered open).
   */
  const openDrawer = useCallback(() => {
    drawerNavRef.current?.snapOpen();
    setDrawerOpen(true);
  }, []);

  /**
   * Snap-close the drawer, update logical state, and return keyboard focus to
   * the hamburger button (for keyboard / button initiated close).
   */
  const closeDrawer = useCallback(() => {
    drawerNavRef.current?.snapClose();
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  }, []);

  /**
   * Snap-close without moving focus (for touch gesture initiated close).
   */
  const closeDrawerNoFocus = useCallback(() => {
    drawerNavRef.current?.snapClose();
    setDrawerOpen(false);
  }, []);

  const toggleDrawer = useCallback(() => {
    if (drawerOpenRef.current) closeDrawer();
    else openDrawer();
  }, [openDrawer, closeDrawer]);

  /* ── Hooks that need stable layout ──────────────────────────────────── */

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

  /** Stable callback — used by both NavDrawer and header (removed icon) */
  const handleOpenRecap = useCallback(async () => {
    await forceLoad();
    setRecapManualOpen(true);
  }, [forceLoad]);

  /* ── Effects ─────────────────────────────────────────────────────────── */

  // Track swipe direction for page-transition animation
  useEffect(() => {
    const prevIdx = SWIPE_ROUTES.indexOf(prevPathname.current);
    const currIdx = SWIPE_ROUTES.indexOf(pathname);
    if (prevIdx !== -1 && currIdx !== -1) {
      swipeDirection.current = currIdx >= prevIdx ? 1 : -1;
    }
    prevPathname.current = pathname;
  }, [pathname]);

  // Return home after extended background time
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (hiddenAtRef.current !== null && Date.now() - hiddenAtRef.current > BACKGROUND_THRESHOLD_MS) {
          navigate('/');
        }
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [navigate]);

  // Native passive:false touchmove listener — prevents scroll during drawer drag
  // on iOS Safari where pointermove.preventDefault() alone is not sufficient.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const handler = (e: TouchEvent) => {
      if (isDrawerGestureActive.current) e.preventDefault();
    };
    el.addEventListener('touchmove', handler, { passive: false });
    return () => el.removeEventListener('touchmove', handler);
  }, []); // stable: only reads refs

  /* ── Gesture handlers (Pointer Events) ──────────────────────────────── */
  //
  // Pointer Events replace the previous Touch handlers. Key improvements:
  //   • e.isPrimary guard: secondary pointers (multi-touch) cannot interrupt
  //     an in-progress gesture or overwrite gestureMode.
  //   • setPointerCapture: once the drawer gesture locks, all subsequent pointer
  //     events are routed to the root div, so the finger moving over BottomNav
  //     NavLinks never synthesises a click on them.
  //   • Drawer gesture only activates on Dashboard (pathname === '/'). On all
  //     other tabs an edge-zone touch goes to pending-page, not pending-edge,
  //     so left-edge swipes correctly trigger tab navigation.

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!e.isPrimary) return; // ignore secondary fingers / multi-touch
    const { clientX, clientY } = e;

    gestureMode.current          = 'idle';
    isDrawerGestureActive.current = false;

    // Ignore touches in the BottomNav area
    if (clientY > window.innerHeight - BOTTOM_NAV_EXCLUSION) return;

    touchStartX.current    = clientX;
    touchStartY.current    = clientY;
    touchStartTime.current = Date.now();
    lastPointerX.current   = clientX;
    lastPointerY.current   = clientY;

    if (drawerOpenRef.current) {
      gestureMode.current = 'pending-close';
    } else if (clientX <= EDGE_SWIPE_WIDTH && pathname === '/') {
      gestureMode.current = 'pending-edge';
    } else {
      const noSwipe = (e.target as Element).closest('[data-no-swipe]');
      if (!noSwipe) {
        gestureMode.current = 'pending-page';
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!e.isPrimary) return;

    // Always track last known position — used by pointercancel fallback navigation.
    lastPointerX.current = e.clientX;
    lastPointerY.current = e.clientY;

    const mode = gestureMode.current;

    // Once committed to a page-swipe, suppress browser scroll/default so the
    // browser does not fire pointercancel and does not try to scroll the page.
    if (mode === 'page-swipe') {
      e.preventDefault();
      return;
    }

    if (mode === 'idle' || mode === 'vertical') return;

    const dx   = e.clientX - touchStartX.current;
    const dy   = e.clientY - touchStartY.current;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    // ── Direction-lock phase ──

    if (mode === 'pending-edge') {
      if (absDx < DIR_LOCK_DIST && absDy < DIR_LOCK_DIST) return; // dead zone
      if (absDy > absDx * H_DOMINANCE) { gestureMode.current = 'vertical'; return; }
      if (dx > 0) {
        gestureMode.current           = 'drawer-open';
        isDrawerGestureActive.current = true;
        // Capture all subsequent pointer events — prevents synthetic clicks on
        // BottomNav NavLinks if the finger lifts over that area.
        rootRef.current?.setPointerCapture(e.pointerId);
      } else {
        gestureMode.current = 'vertical';
      }
      return;
    }

    if (mode === 'pending-close') {
      if (absDx < DIR_LOCK_DIST && absDy < DIR_LOCK_DIST) return;
      if (absDy > absDx * H_DOMINANCE) { gestureMode.current = 'vertical'; return; }
      if (dx < 0) {
        gestureMode.current           = 'drawer-close';
        isDrawerGestureActive.current = true;
        rootRef.current?.setPointerCapture(e.pointerId);
      } else {
        gestureMode.current = 'vertical';
      }
      return;
    }

    if (mode === 'pending-page') {
      if (absDx < DIR_LOCK_DIST && absDy < DIR_LOCK_DIST) return;
      if (absDy > absDx * H_DOMINANCE) { gestureMode.current = 'vertical'; return; }
      // Lock the pointer to the root div. This prevents child elements (calendar
      // day buttons, chart bar buttons) from stealing the pointer, and tells the
      // browser this gesture belongs to JS — preventing pointercancel.
      gestureMode.current = 'page-swipe';
      rootRef.current?.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // ── Active drag phase ──
    const w = drawerNavRef.current?.getWidth() ?? 340;

    if (mode === 'drawer-open') {
      const raw     = -w + dx; // dx=0 → fully closed, dx=w → fully open
      const clamped = Math.max(-w, Math.min(0, raw));
      drawerNavRef.current?.setDragX(clamped);
      e.preventDefault(); // prevent scroll (belt alongside native touchmove handler)
    }

    if (mode === 'drawer-close') {
      const clamped = Math.max(-w, Math.min(0, dx));
      drawerNavRef.current?.setDragX(clamped);
      e.preventDefault();
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    const mode = gestureMode.current;
    gestureMode.current           = 'idle';
    isDrawerGestureActive.current = false;

    if (
      mode === 'idle' ||
      mode === 'vertical' ||
      mode === 'pending-edge' ||
      mode === 'pending-close' ||
      mode === 'pending-page'
    ) {
      return; // uncommitted gesture — let native tap/click proceed normally
    }

    const dx       = e.clientX - touchStartX.current;
    const dt       = Math.max(1, Date.now() - touchStartTime.current);
    const velocity = Math.abs(dx) / dt; // px/ms
    const w        = drawerNavRef.current?.getWidth() ?? 340;

    if (mode === 'drawer-open') {
      const progress     = Math.max(0, Math.min(w, dx));
      const openFraction = progress / w;
      if (openFraction >= OPEN_THRESHOLD || velocity >= VELOCITY_THRESHOLD) {
        openDrawer(); // snapOpen() + setDrawerOpen(true)
      } else {
        drawerNavRef.current?.snapClose(); // cancel — snap back off-screen
      }
      return;
    }

    if (mode === 'drawer-close') {
      const closeFraction = Math.abs(Math.min(0, dx)) / w;
      if (closeFraction >= OPEN_THRESHOLD || velocity >= VELOCITY_THRESHOLD) {
        closeDrawerNoFocus(); // snapClose() + setDrawerOpen(false)
      } else {
        drawerNavRef.current?.snapOpen(); // cancel — snap back open
      }
      return;
    }

    if (mode === 'page-swipe') {
      const dy = e.clientY - touchStartY.current;
      if (
        Math.abs(dx) >= 60 &&
        Math.abs(dy) <= 80
      ) {
        const idx = SWIPE_ROUTES.indexOf(pathname);
        if (idx !== -1) {
          const next = dx < 0 ? idx + 1 : idx - 1;
          if (next >= 0 && next < SWIPE_ROUTES.length) {
            // Set direction before navigate so entering page reads the right value
            swipeDirection.current = dx < 0 ? 1 : -1;
            navigate(SWIPE_ROUTES[next]);
          }
        }
      }
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    const mode = gestureMode.current;
    gestureMode.current           = 'idle';
    isDrawerGestureActive.current = false;

    // If pointercancel fires after we already committed to a page-swipe, attempt
    // navigation using the last known pointer position (pointercancel clientX/Y
    // may be 0 on some browsers). This handles cases where the browser fires
    // pointercancel instead of pointerup on content-heavy pages.
    if (mode === 'page-swipe') {
      const dx = lastPointerX.current - touchStartX.current;
      const dy = lastPointerY.current - touchStartY.current;
      if (Math.abs(dx) >= 60 && Math.abs(dy) <= 80) {
        const idx = SWIPE_ROUTES.indexOf(pathname);
        if (idx !== -1) {
          const next = dx < 0 ? idx + 1 : idx - 1;
          if (next >= 0 && next < SWIPE_ROUTES.length) {
            swipeDirection.current = dx < 0 ? 1 : -1;
            navigate(SWIPE_ROUTES[next]);
          }
        }
      }
      return;
    }

    // Restore drawer to its last stable position
    if (drawerOpenRef.current) {
      drawerNavRef.current?.snapOpen();
    } else {
      drawerNavRef.current?.snapClose();
    }
  };

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
      {/* ── Header ───────────────────────────────────────────────────────
           Zone L (40 px): hamburger only
           Zone C (flex): page title, absolutely centred over full width
           Zone R (~96 px): optional ExerciseChip + Bell + Settings         */}
      <header
        className="sticky top-0 z-30 border-b border-ink-800 bg-ink-950/80 backdrop-blur"
        style={{ paddingTop: 'max(4px, env(safe-area-inset-top))' }}
      >
        <div className="relative flex items-center" style={{ height: 48 }}>

          {/* Zone L — hamburger only */}
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

          {/* Zone C — title always exactly centred */}
          <span className="pointer-events-none absolute inset-x-0 text-center text-[15px] font-bold tracking-tight text-slate-100 whitespace-nowrap">
            {title}
          </span>

          {/* Zone R — ExerciseChip (optional) + Bell + Settings */}
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

      {/* ── Page content ─────────────────────────────────────────────────
           Touch handlers now live on the root div (above), so <main> is plain. */}
      <main className="relative flex-1 overflow-hidden">
        <AnimatePresence initial={false} custom={swipeDirection.current} mode="popLayout">
          <motion.div
            key={pathname}
            custom={swipeDirection.current}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 350, damping: 35, mass: 0.8 }}
            className="absolute inset-0 overflow-y-auto px-4 pb-32 pt-3"
            // pan-y: browser handles vertical scroll natively but does NOT fire
            // pointercancel for horizontal gestures — they stay in JS hands,
            // which fixes page-swipe being silently swallowed on content-heavy
            // pages (Aktivität) after the move to Pointer Events.
            style={{ touchAction: 'pan-y' }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />

      {/* ── Modals / overlays ─────────────────────────────────────────── */}

      {/* Arena Feed */}
      {feedOpen && <ArenaFeed onClose={() => setFeedOpen(false)} />}

      {/* Daily Challenge */}
      {dailyChallengeOpen && (
        <DailyChallengeModal onClose={() => setDailyChallengeOpen(false)} />
      )}

      {/* Daily Recap — auto-show or manually opened */}
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

      {/* No recap yet */}
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

      {/* Bell disable confirmation */}
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

      {/* ── Navigation Drawer — always mounted, animation via MotionValues ── */}
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
