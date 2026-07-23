import { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import {
  BoltIcon,
  HomeIcon,
  LogoutIcon,
  RecapIcon,
  SettingsIcon,
  TrophyIcon,
  UserIcon,
  XIcon,
} from '@/components/ui/icons';

/* ---------- Typen ---------- */

export interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenFeed: () => void;
  onOpenRecap: () => void;
  onOpenDailyChallenge: () => void;
}

/* ---------- Konstanten ---------- */

const FOCUSABLE =
  'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';

/* ---------- Hilfsfunktionen ---------- */

/** Prüft, ob pathname zur Route `to` passt (end-Mode für Root). */
function isRouteActive(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(to + '/');
}

/* ---------- Sub-Komponenten ---------- */

/** Navigations-Item für echte Routen. */
function DrawerNavItem({
  to,
  label,
  icon,
  pathname,
  onClose,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  pathname: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const active = isRouteActive(pathname, to);

  return (
    <button
      onClick={() => {
        onClose();
        if (!active) navigate(to);
      }}
      className={
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400 ' +
        (active
          ? 'bg-brand-600/20 text-brand-300'
          : 'text-slate-400 hover:bg-ink-800 hover:text-slate-100')
      }
    >
      {icon}
      {label}
    </button>
  );
}

/** Aktions-Item für modal-basierte Features (keine Route). */
function DrawerActionItem({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-400 transition ' +
        'hover:bg-ink-800 hover:text-slate-100 ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
      }
    >
      {icon}
      {label}
    </button>
  );
}

/** SVG-Icon für Globale Statistiken (kein Pendant in icons.tsx). */
function GlobalStatsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g opacity="0.7" stroke="currentColor" strokeWidth="1.25">
        <circle cx="12" cy="11" r="8.5" />
        <line x1="3.5" y1="11" x2="20.5" y2="11" />
        <path d="M12 2.5 Q8.5 6 8.5 11 Q8.5 16 12 19.5" />
        <path d="M12 2.5 Q15.5 6 15.5 11 Q15.5 16 12 19.5" />
      </g>
      <rect x="4.5"  y="17.5" width="2" height="3"  rx="0.5" fill="#818cf8" />
      <rect x="8"    y="14.5" width="2" height="6"  rx="0.5" fill="#818cf8" />
      <rect x="11.5" y="11.5" width="2" height="9"  rx="0.5" fill="#818cf8" />
      <rect x="15"   y="8.5"  width="2" height="12" rx="0.5" fill="#818cf8" />
    </svg>
  );
}

/* ---------- Haupt-Komponente ---------- */

export function NavDrawer({
  open,
  onClose,
  onOpenFeed,
  onOpenRecap,
  onOpenDailyChallenge,
}: NavDrawerProps) {
  const { signOut } = useAuth();
  const { profile } = useProfile();
  const { pathname } = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const prefersReduced = useReducedMotion();

  /* Fokus-Falle: Tab-Zyklus innerhalb des Drawers + Escape */
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    // Ersten fokussierbaren Element fokussieren
    panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const all = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (all.length === 0) return;
      const first = all[0];
      const last = all[all.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  /* Framer-Motion-Transitions — identische Spring-Parameter wie Page-Transitions */
  const springTransition = prefersReduced
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 350, damping: 35, mass: 0.8 };

  const handleSignOut = useCallback(async () => {
    onClose();
    await signOut();
  }, [onClose, signOut]);

  const displayName = profile?.display_name ?? profile?.username ?? null;
  const avatarUrl = profile?.avatar_url;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — blockiert Klicks auf Hintergrund */}
          <motion.div
            key="nav-backdrop"
            className="fixed inset-0 z-[45] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={prefersReduced ? { duration: 0 } : { duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer-Panel */}
          <motion.div
            key="nav-panel"
            ref={panelRef}
            id="nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className={
              'fixed left-0 top-0 z-[46] flex h-full w-[84vw] max-w-[340px] flex-col ' +
              'rounded-r-2xl border-r border-ink-700 bg-ink-900 shadow-2xl'
            }
            style={{
              paddingTop: 'max(16px, env(safe-area-inset-top))',
              paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
            }}
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={springTransition}
          >
            {/* Profil-Header */}
            <div className="flex items-center justify-between px-4 pb-4">
              <div className="flex min-w-0 items-center gap-3">
                {/* Avatar */}
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-ink-700 ring-2 ring-brand-500/30">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <UserIcon className="h-5 w-5 text-slate-400" />
                    </div>
                  )}
                </div>
                {/* Name */}
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {displayName ?? '—'}
                  </p>
                  {profile?.username && (
                    <p className="truncate text-xs text-slate-500">
                      @{profile.username}
                    </p>
                  )}
                </div>
              </div>

              {/* Schließen-Button */}
              <button
                onClick={onClose}
                aria-label="Navigation schließen"
                className={
                  'ml-2 grid shrink-0 place-items-center rounded-lg text-slate-400 transition ' +
                  'hover:bg-ink-800 hover:text-slate-200 ' +
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
                }
                style={{ width: 36, height: 36 }}
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Trennlinie */}
            <div className="mx-4 mb-3 h-px bg-ink-700" />

            {/* Scrollbarer Navigationsbereich */}
            <div className="flex-1 overflow-y-auto px-2" data-no-swipe>
              {/* Primäre Navigation */}
              <section aria-label="Hauptmenü">
                <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  Navigation
                </p>

                <DrawerNavItem
                  to="/"
                  label="Dashboard"
                  icon={<HomeIcon className="h-5 w-5" />}
                  pathname={pathname}
                  onClose={onClose}
                />

                <DrawerActionItem
                  label="Arena Feed"
                  icon={
                    <img
                      src="/arena-feed-icon.webp"
                      alt=""
                      className="h-5 w-5 object-contain"
                    />
                  }
                  onClick={() => { onClose(); onOpenFeed(); }}
                />

                <DrawerActionItem
                  label="Arena Rückblick"
                  icon={<RecapIcon className="h-5 w-5" />}
                  onClick={() => { onClose(); onOpenRecap(); }}
                />

                <DrawerActionItem
                  label="Daily Live Challenge"
                  icon={<BoltIcon className="h-5 w-5" />}
                  onClick={() => { onClose(); onOpenDailyChallenge(); }}
                />

                <DrawerNavItem
                  to="/achievements"
                  label="Erfolge"
                  icon={<TrophyIcon className="h-5 w-5" />}
                  pathname={pathname}
                  onClose={onClose}
                />

                <DrawerNavItem
                  to="/global-stats"
                  label="Globale Statistiken"
                  icon={<GlobalStatsIcon />}
                  pathname={pathname}
                  onClose={onClose}
                />
              </section>

              <div className="mx-2 my-3 h-px bg-ink-800" />

              {/* Sekundäre Navigation */}
              <section aria-label="Konto">
                <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  Konto
                </p>

                <DrawerNavItem
                  to="/settings"
                  label="Einstellungen"
                  icon={<SettingsIcon className="h-5 w-5" />}
                  pathname={pathname}
                  onClose={onClose}
                />
              </section>
            </div>

            {/* Footer: Abmelden */}
            <div className="mx-4 mt-2 border-t border-ink-700 pt-3">
              {/* eslint-disable-next-line @typescript-eslint/no-misused-promises */}
              <button
                onClick={handleSignOut}
                className={
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-400 transition ' +
                  'hover:bg-red-500/10 ' +
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'
                }
              >
                <LogoutIcon className="h-5 w-5" />
                Abmelden
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
