/**
 * NavDrawer — Navigation panel for PushUpArena
 *
 * ── STRUCTURE ───────────────────────────────────────────────────────────────
 *   NavDrawer (forwardRef, imperative handle for gesture driver)
 *     ├─ Backdrop       — frosted-glass overlay, tap to close
 *     ├─ Panel
 *     │   ├─ DrawerHeader  — avatar · name · greeting · close ×
 *     │   ├─ QuickActions  — Training / Ruhetag tile grid
 *     │   ├─ NavList       — scrollable grouped nav items
 *     │   │   └─ NavSection > NavRow > NavItem
 *     │   └─ DrawerFooter  — sign-out
 *     └─ Focus trap     (Escape / Tab cycling)
 *
 * ── ADDING A MENU ITEM ──────────────────────────────────────────────────────
 *   1. Add an entry to `navGroups` inside the component body.
 *      Route item:  { id, label, icon, to }
 *      Action item: { id, label, icon, onAction, featured? }
 *   2. If the item needs a badge, add a key matching `id` to the `badges` memo.
 *   No other files need to change.
 *
 * ── ACTIVE STATES ───────────────────────────────────────────────────────────
 *   NavItem derives active state from isRouteActive(pathname, item.to).
 *   Active → brand-tinted bg + 3 px left accent bar.
 *   Action items (no `to`) are never active.
 *
 * ── ANIMATIONS ──────────────────────────────────────────────────────────────
 *   Panel x-position → MotionValue + spring (imperative, no re-renders)
 *   Overlay opacity  → derived from panelX via useMotionValueEvent
 *   Nav items        → staggered fade-slide variants (navContainerV / navItemV)
 *   Quick Actions    → separate stagger (qaContainerV / qaItemV)
 *   All variants respect prefers-reduced-motion and are memoised.
 *
 * ── BADGES ──────────────────────────────────────────────────────────────────
 *   `badges` memo maps item IDs → ReactNodes.  AnimatePresence wrappers live
 *   here (not in navGroups) so their instances remain stable across renders,
 *   which is required for exit animations to fire correctly.
 */

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type Variants,
} from 'framer-motion';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { Avatar } from '@/components/ui/Avatar';
import {
  BoltIcon,
  HomeIcon,
  LogoutIcon,
  PlusIcon,
  RecapIcon,
  SettingsIcon,
  TrophyIcon,
  XIcon,
} from '@/components/ui/icons';

// ─── Design tokens ────────────────────────────────────────────────────────────
// Single source of truth for sizing, spacing, and focus styles.
// Changing a value here updates every usage automatically.

const T = {
  icon:      'h-[18px] w-[18px]',   // all nav / action icons
  itemMinH:  'min-h-[48px]',        // 48 px minimum touch target
  itemPad:   'px-3 py-[10px]',      // item internal padding
  itemText:  'text-[13px] font-medium',
  focusRing: 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400',
  // Icon opacity at each interaction state
  iconOff:   'opacity-[0.45] group-hover:opacity-75',   // inactive
  iconFeat:  'opacity-[0.60] group-hover:opacity-85',   // featured / highlighted
  iconOn:    'opacity-100',                              // active route
} as const;

// ─── Animation timing ─────────────────────────────────────────────────────────

const DUR = {
  headerFade: 0.22,
  navItem:    0.18,
  qaItem:     0.16,
  badge:      0.18,
  badgeLive:  0.25,
} as const;

// Spring config shared by snapOpen / snapClose
const SPRING = { type: 'spring' as const, stiffness: 340, damping: 36, mass: 0.8 };

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single entry in the navigation list. */
interface NavItemDef {
  id:        string;
  label:     string;
  icon:      React.ReactNode;
  /** Present → route item; active state is derived from pathname. */
  to?:       string;
  /** Present → action item; called after onClose(). */
  onAction?: () => void;
  /** Slightly elevated label colour (e.g. Daily Live Challenge). */
  featured?: boolean;
}

/** A labelled group of nav items. */
interface NavGroupDef {
  id:    string;
  label: string;
  items: NavItemDef[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

function isRouteActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(to + '/');
}

/** Returns a short, time-appropriate greeting in German. */
function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return 'Guten Morgen.';
  if (h >= 12 && h < 17) return 'Schön, dass du wieder da bist.';
  if (h >= 17 && h < 23) return 'Noch ein Training heute?';
  return 'Schön, dass du da bist.';
}

// ─── Badge atoms ──────────────────────────────────────────────────────────────

function NavBadge({ count }: { count: number }) {
  return (
    <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-500/[0.14] px-1.5 text-[10px] font-semibold tabular-nums text-brand-400/80">
      {count > 9 ? '9+' : count}
    </span>
  );
}

function LiveDot() {
  return (
    <span className="relative flex h-[7px] w-[7px]">
      <span
        className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-40"
        style={{ animationDuration: '2.5s' }}
      />
      <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-red-400/70" />
    </span>
  );
}

function UnreadDot() {
  return <span className="h-[7px] w-[7px] rounded-full bg-brand-400/40" />;
}

// ─── Drawer-local icons ───────────────────────────────────────────────────────

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function GlobalStatsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="11" r="8.5" stroke="currentColor" strokeWidth="1.25" opacity="0.45" />
      <line x1="3.5"  y1="11" x2="20.5" y2="11" stroke="currentColor" strokeWidth="1.25" opacity="0.45" />
      <path d="M12 2.5 Q8.5 6 8.5 11 Q8.5 16 12 19.5"  stroke="currentColor" strokeWidth="1.25" opacity="0.45" />
      <path d="M12 2.5 Q15.5 6 15.5 11 Q15.5 16 12 19.5" stroke="currentColor" strokeWidth="1.25" opacity="0.45" />
      <rect x="4.5"  y="17.5" width="2" height="3"  rx="0.5" fill="currentColor" opacity="0.50" />
      <rect x="8"    y="14.5" width="2" height="6"  rx="0.5" fill="currentColor" opacity="0.65" />
      <rect x="11.5" y="11.5" width="2" height="9"  rx="0.5" fill="currentColor" opacity="0.80" />
      <rect x="15"   y="8.5"  width="2" height="12" rx="0.5" fill="currentColor" opacity="0.95" />
    </svg>
  );
}

// ─── NavItem ──────────────────────────────────────────────────────────────────
// Unified interactive element for both route items (to=) and action items
// (onClick=).  Route items derive an active state; action items are never active.

interface NavItemProps {
  label:     string;
  icon:      React.ReactNode;
  onClose:   () => void;
  trailing?: React.ReactNode;
  featured?: boolean;
  // Route variant
  to?:       string;
  pathname?: string;
  // Action variant
  onClick?:  () => void;
}

function NavItem({
  label, icon, onClose, trailing,
  featured = false,
  to, pathname = '', onClick,
}: NavItemProps) {
  const navigate = useNavigate();
  const active   = to ? isRouteActive(pathname, to) : false;

  return (
    <button
      onClick={() => {
        onClose();
        if (to)     { if (!active) navigate(to, { replace: true }); }
        else        { onClick?.(); }
      }}
      className={[
        'group relative flex w-full items-center gap-3 rounded-xl transition-colors duration-150',
        T.itemMinH, T.itemPad, T.itemText, T.focusRing,
        active
          ? 'bg-brand-600/[0.09] text-brand-300'
          : featured
          ? 'text-slate-300 hover:bg-white/[0.05] hover:text-slate-100'
          : 'text-slate-500 hover:bg-white/[0.05] hover:text-slate-200',
      ].join(' ')}
    >
      {/* Thin accent bar — marks the active route */}
      {active && (
        <span className="absolute left-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-r-full bg-brand-400/60" />
      )}
      <span className={`shrink-0 transition-opacity duration-150 ${active ? T.iconOn : featured ? T.iconFeat : T.iconOff}`}>
        {icon}
      </span>
      <span className="flex-1 truncate text-left">{label}</span>
      {trailing}
    </button>
  );
}

// ─── NavSection ───────────────────────────────────────────────────────────────

function NavSection({ label, children, first = false }: {
  label:    string;
  children: React.ReactNode;
  first?:   boolean;
}) {
  return (
    <section aria-label={label}>
      <p className={`px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500/60 ${first ? 'pt-3' : 'pt-5'}`}>
        {label}
      </p>
      {children}
    </section>
  );
}

// ─── NavRow ───────────────────────────────────────────────────────────────────
// Stagger wrapper; receives the shared navItemV variant from the parent container.

function NavRow({ children, v }: { children: React.ReactNode; v: Variants }) {
  return (
    <motion.div variants={v} whileTap={{ scale: 0.975 }} className="rounded-xl">
      {children}
    </motion.div>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface NavDrawerHandle {
  /** Spring-animate panel to fully-open position (x = 0). */
  snapOpen:  () => void;
  /** Spring-animate panel to fully-closed position (x = −width). */
  snapClose: () => void;
  /** Set panel position directly — used while drag is in progress. */
  setDragX:  (x: number) => void;
  /** Return current panel pixel width. */
  getWidth:  () => number;
}

export interface NavDrawerProps {
  open:                  boolean;
  onClose:               () => void;
  onOpenFeed:            () => void;
  onOpenRecap:           () => void;
  onOpenDailyChallenge:  () => void;
  /** Badge signals — all optional; default to falsy / 0. */
  challengeIsActive?:    boolean;
  feedNewCount?:         number;
  hasUnreadRecap?:       boolean;
  /** Quick Actions */
  onOpenTraining:        () => void;
  onOpenRestDay:         () => void;
}

// ─── NavDrawer ────────────────────────────────────────────────────────────────

export const NavDrawer = forwardRef<NavDrawerHandle, NavDrawerProps>(function NavDrawer(
  {
    open, onClose,
    onOpenFeed, onOpenRecap, onOpenDailyChallenge,
    challengeIsActive = false, feedNewCount = 0, hasUnreadRecap = false,
    onOpenTraining, onOpenRestDay,
  },
  ref,
) {
  const navigate          = useNavigate();
  const { signOut }       = useAuth();
  const { profile }       = useProfile();
  const { pathname }      = useLocation();
  const panelRef          = useRef<HTMLDivElement>(null);
  const backdropRef       = useRef<HTMLDivElement>(null);
  const prefersReduced    = useReducedMotion();
  const prefersReducedRef = useRef(prefersReduced);
  prefersReducedRef.current = prefersReduced;

  // ── Animation variants ───────────────────────────────────────────────────
  // Memoised so Framer Motion receives stable references and avoids
  // unnecessary subscription work on every React re-render.

  const navContainerV = useMemo<Variants>(() => ({
    open:   { transition: prefersReduced ? {} : { staggerChildren: 0.03, delayChildren: 0.08 } },
    closed: {},
  }), [prefersReduced]);

  const navItemV = useMemo<Variants>(() => ({
    open:   { opacity: 1, x: 0,  transition: { duration: prefersReduced ? 0 : DUR.navItem, ease: 'easeOut' as const } },
    closed: { opacity: 0, x: -5, transition: { duration: 0 } },
  }), [prefersReduced]);

  const qaContainerV = useMemo<Variants>(() => ({
    open:   { transition: prefersReduced ? {} : { staggerChildren: 0.05, delayChildren: 0.04 } },
    closed: {},
  }), [prefersReduced]);

  const qaItemV = useMemo<Variants>(() => ({
    open:   { opacity: 1, y: 0,  transition: { duration: prefersReduced ? 0 : DUR.qaItem, ease: 'easeOut' as const } },
    closed: { opacity: 0, y: 6,  transition: { duration: 0 } },
  }), [prefersReduced]);

  // ── MotionValues ─────────────────────────────────────────────────────────
  // panelX: 0 = fully open, −width = fully closed.  Starts far off-screen.

  const panelX         = useMotionValue(-400);
  const overlayOpacity = useMotionValue(0);

  // Keep overlay opacity and DOM pointer-events in sync — no React re-renders.
  useMotionValueEvent(panelX, 'change', (x) => {
    const width   = panelRef.current?.offsetWidth ?? 340;
    const opacity = Math.max(0, Math.min(1, (x + width) / width));
    overlayOpacity.set(opacity);

    if (backdropRef.current) {
      backdropRef.current.style.pointerEvents = opacity > 0.01 ? 'auto' : 'none';
    }
    if (panelRef.current) {
      const active = x > -width + 0.5;
      panelRef.current.style.visibility    = active ? 'visible' : 'hidden';
      panelRef.current.style.pointerEvents = active ? 'auto'    : 'none';
    }
  });

  // ── Imperative handle (used by AppLayout gesture driver) ─────────────────

  const getSpring = () =>
    prefersReducedRef.current ? { duration: 0 } : SPRING;

  const animCtrl = useRef<ReturnType<typeof animate> | null>(null);

  useImperativeHandle(ref, () => ({
    snapOpen() {
      animCtrl.current?.stop();
      animCtrl.current = animate(panelX, 0, getSpring());
    },
    snapClose() {
      animCtrl.current?.stop();
      const width = panelRef.current?.offsetWidth ?? 340;
      animCtrl.current = animate(panelX, -width, getSpring());
    },
    setDragX(x: number) {
      animCtrl.current?.stop();
      panelX.set(x);
    },
    getWidth() {
      return panelRef.current?.offsetWidth ?? 340;
    },
  }));

  // ── Focus trap (active when `open` is true) ───────────────────────────────

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const all   = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (all.length === 0) return;
      const first = all[0];
      const last  = all[all.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // ── Stable callbacks ──────────────────────────────────────────────────────

  const handleSignOut = useCallback(async () => {
    onClose();
    await signOut();
  }, [onClose, signOut]);

  const handleProfileClick = useCallback(() => {
    onClose();
    if (pathname !== '/profile') navigate('/profile', { replace: true });
  }, [onClose, navigate, pathname]);

  const displayName = profile?.display_name ?? profile?.username ?? 'Profil';
  const avatarUrl   = profile?.avatar_url;
  // Computed once on mount — re-evaluates if the component unmounts/remounts
  const greeting    = useMemo(getTimeGreeting, []);

  // ── Badge trailing nodes ──────────────────────────────────────────────────
  // Defined separately from navGroups so AnimatePresence instances are stable
  // across re-renders — required for exit animations to fire correctly.

  const badges = useMemo((): Record<string, React.ReactNode> => ({
    challenge: challengeIsActive ? (
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: DUR.badgeLive }}
      >
        <LiveDot />
      </motion.span>
    ) : undefined,

    feed: (
      <AnimatePresence>
        {feedNewCount > 0 && (
          <motion.span
            key="feed-badge"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: DUR.badge }}
          >
            <NavBadge count={feedNewCount} />
          </motion.span>
        )}
      </AnimatePresence>
    ),

    recap: hasUnreadRecap ? (
      <motion.span
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: DUR.badge }}
      >
        <UnreadDot />
      </motion.span>
    ) : undefined,
  }), [challengeIsActive, feedNewCount, hasUnreadRecap]);

  // ── Nav config ────────────────────────────────────────────────────────────
  // To add a menu item: append an entry here and (if needed) add to `badges`.

  const navGroups = useMemo((): NavGroupDef[] => [
    {
      id: 'heute', label: 'Heute',
      items: [
        {
          id: 'dashboard', label: 'Dashboard',
          icon: <HomeIcon className={T.icon} />,
          to: '/',
        },
        {
          id: 'challenge', label: 'Daily Live Challenge',
          icon: <BoltIcon className={T.icon} />,
          onAction: onOpenDailyChallenge,
          featured: true,
        },
        {
          id: 'feed', label: 'Arena Feed',
          icon: <img src="/arena-feed-icon.webp" alt="" className={`${T.icon} object-contain opacity-75`} />,
          onAction: onOpenFeed,
        },
      ],
    },
    {
      id: 'community', label: 'Community',
      items: [
        {
          id: 'recap', label: 'Arena Rückblick',
          icon: <RecapIcon className={T.icon} />,
          onAction: onOpenRecap,
        },
        {
          id: 'global-stats', label: 'Globale Statistiken',
          icon: <GlobalStatsIcon />,
          to: '/global-stats',
        },
      ],
    },
    {
      id: 'persoenlich', label: 'Persönlich',
      items: [
        {
          id: 'achievements', label: 'Erfolge',
          icon: <TrophyIcon className={T.icon} />,
          to: '/achievements',
        },
        {
          id: 'settings', label: 'Einstellungen',
          icon: <SettingsIcon className={T.icon} />,
          to: '/settings',
        },
      ],
    },
  ], [onOpenDailyChallenge, onOpenFeed, onOpenRecap]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 45,
        overflow: 'hidden', pointerEvents: 'none',
      }}
    >
      {/* Backdrop — frosted glass over page content */}
      <div
        ref={backdropRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        onClick={onClose}
        aria-hidden="true"
      >
        <motion.div
          className="h-full w-full"
          style={{
            opacity: overlayOpacity,
            backgroundColor: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        />
      </div>

      {/* Drawer panel */}
      <motion.div
        ref={panelRef}
        id="nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          x: panelX,
          visibility:    'hidden',  // managed by useMotionValueEvent
          pointerEvents: 'none',    // managed by useMotionValueEvent
          paddingTop:    'max(16px, env(safe-area-inset-top))',
          paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
        }}
        className="z-[1] flex w-[84vw] max-w-[340px] flex-col rounded-r-[20px] border-r border-white/[0.07] bg-ink-900 shadow-[4px_0_40px_rgba(0,0,0,0.65)]"
      >

        {/* ── Profile header ──────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-4 pb-4 pt-3"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
        >
          {/* Avatar — fades in */}
          <motion.div
            initial={false}
            animate={open ? { opacity: 1 } : { opacity: 0 }}
            transition={prefersReduced ? { duration: 0 } : { duration: DUR.headerFade, ease: 'easeOut' }}
            className="shrink-0"
          >
            <button
              onClick={handleProfileClick}
              aria-label="Profil öffnen"
              className={`rounded-full transition active:opacity-70 ${T.focusRing}`}
            >
              <Avatar url={avatarUrl} name={displayName} size={56} className="ring-[1.5px] ring-brand-400/40" />
            </button>
          </motion.div>

          {/* Name + greeting — slides from left */}
          <motion.button
            initial={false}
            animate={open ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
            transition={prefersReduced ? { duration: 0 } : { duration: DUR.headerFade, delay: 0.05, ease: 'easeOut' }}
            onClick={handleProfileClick}
            aria-label="Profil öffnen"
            className={`min-w-0 flex-1 rounded-lg text-left transition active:opacity-70 ${T.focusRing}`}
          >
            <p className="truncate text-[15px] font-semibold leading-tight text-slate-100">{displayName}</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-slate-400/60">{greeting}</p>
          </motion.button>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Navigation schließen"
            className={`shrink-0 grid h-8 w-8 place-items-center rounded-full bg-white/[0.06] text-slate-400 transition hover:bg-white/[0.10] hover:text-slate-200 active:bg-white/[0.14] ${T.focusRing}`}
          >
            <XIcon className="h-[14px] w-[14px]" />
          </button>
        </div>

        {/* ── Quick Actions — 2-up tile grid ───────────────────────────────── */}
        <motion.div
          initial="closed"
          animate={open ? 'open' : 'closed'}
          variants={qaContainerV}
          className="grid grid-cols-2 gap-2.5 px-3 pb-1 pt-3"
        >
          <motion.button
            variants={qaItemV}
            whileTap={{ scale: 0.95 }}
            onClick={() => { onClose(); onOpenTraining(); }}
            aria-label="Training eintragen"
            className={`flex min-h-[62px] flex-col items-center justify-center gap-2 rounded-2xl px-2 py-2.5 bg-brand-500/[0.08] text-brand-300 transition-colors duration-150 hover:bg-brand-500/[0.12] ${T.focusRing}`}
          >
            <PlusIcon className={`${T.icon} text-brand-400/90`} />
            <span className="text-[11px] font-medium leading-none tracking-[0.01em]">Training</span>
          </motion.button>

          <motion.button
            variants={qaItemV}
            whileTap={{ scale: 0.95 }}
            onClick={() => { onClose(); onOpenRestDay(); }}
            aria-label="Ruhetag eintragen"
            className={`flex min-h-[62px] flex-col items-center justify-center gap-2 rounded-2xl px-2 py-2.5 bg-white/[0.05] text-slate-400 transition-colors duration-150 hover:bg-white/[0.08] hover:text-slate-200 ${T.focusRing}`}
          >
            <MoonIcon className={T.icon} />
            <span className="text-[11px] font-medium leading-none tracking-[0.01em]">Ruhetag</span>
          </motion.button>
        </motion.div>

        {/* ── Scrollable nav list ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-3 pb-4" data-no-swipe>
          <motion.div initial="closed" animate={open ? 'open' : 'closed'} variants={navContainerV}>
            {navGroups.map((group, gi) => (
              <NavSection key={group.id} label={group.label} first={gi === 0}>
                {group.items.map((item) => (
                  <NavRow key={item.id} v={navItemV}>
                    <NavItem
                      label={item.label}
                      icon={item.icon}
                      onClose={onClose}
                      featured={item.featured}
                      trailing={badges[item.id]}
                      to={item.to}
                      pathname={pathname}
                      onClick={item.onAction}
                    />
                  </NavRow>
                ))}
              </NavSection>
            ))}
          </motion.div>
        </div>

        {/* ── Footer — sign out ────────────────────────────────────────────── */}
        <div
          className="mx-3 mt-2 pb-2 pt-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
          <button
            onClick={handleSignOut}
            className={`group flex w-full items-center gap-3 rounded-xl text-red-400/60 transition-colors duration-150 hover:bg-red-500/[0.07] hover:text-red-400/90 ${T.itemMinH} ${T.itemPad} ${T.itemText} ${T.focusRing}`}
          >
            <span className="shrink-0 opacity-50 transition-opacity duration-150 group-hover:opacity-85">
              <LogoutIcon className={T.icon} />
            </span>
            Abmelden
          </button>
        </div>

      </motion.div>
    </div>
  );
});
