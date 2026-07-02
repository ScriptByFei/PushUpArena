import { Link, Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { SettingsIcon, BellIcon, BellOffIcon } from '@/components/ui/icons';
import { usePush } from '@/context/PushContext';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/track': 'Eintragen',
  '/friends': 'Freunde',
  '/activity': 'Aktivität',
  '/leaderboard': 'Rangliste',
  '/profile': 'Profil',
  '/settings': 'Einstellungen',
};

export function AppLayout() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'PushupArena';
  const { pushPermission, busy, togglePush } = usePush();

  const notificationsOn = pushPermission === 'granted';

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="sticky top-0 z-30 relative flex items-center border-b border-ink-800 bg-ink-950/80 px-4 py-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        {/* Glocken-Icon links */}
        <button
          onClick={togglePush}
          disabled={busy}
          aria-label={notificationsOn ? 'Benachrichtigungen deaktivieren' : 'Benachrichtigungen aktivieren'}
          className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-ink-800 hover:text-slate-200 disabled:opacity-50"
        >
          {notificationsOn
            ? <BellIcon className="h-5 w-5 text-brand-400" />
            : <BellOffIcon className="h-5 w-5" />}
        </button>

        {/* Titel absolut zentriert */}
        <span className="pointer-events-none absolute inset-x-0 text-center text-base font-bold tracking-tight">
          {title}
        </span>

        {/* Settings rechts */}
        <Link
          to="/settings"
          aria-label="Einstellungen"
          className="ml-auto shrink-0 rounded-lg p-2 text-slate-400 hover:bg-ink-800 hover:text-slate-200"
        >
          <SettingsIcon className="h-5 w-5" />
        </Link>
      </header>

      <main className="flex-1 px-4 pb-32 pt-4">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}
