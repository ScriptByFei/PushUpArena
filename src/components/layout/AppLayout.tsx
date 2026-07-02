import { Link, Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { SettingsIcon, BellIcon } from '@/components/ui/icons';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/track': 'Eintragen',
  '/friends': 'Freunde',
  '/teams': 'Teams',
  '/leaderboard': 'Rangliste',
  '/profile': 'Profil',
  '/settings': 'Einstellungen',
};

export function AppLayout() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'PushupArena';

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="sticky top-0 z-30 relative flex items-center border-b border-ink-800 bg-ink-950/80 px-4 py-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur">
        {/* Glocken-Icon links */}
        <Link
          to="/settings"
          aria-label="Benachrichtigungen"
          className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-ink-800 hover:text-slate-200"
        >
          <BellIcon className="h-5 w-5" />
        </Link>
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
