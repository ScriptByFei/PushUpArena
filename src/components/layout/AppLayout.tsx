import { Link, Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { SettingsIcon } from '@/components/ui/icons';

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/track': 'Eintragen',
  '/friends': 'Freunde',
  '/leaderboard': 'Rangliste',
  '/profile': 'Profil',
  '/settings': 'Einstellungen',
};

export function AppLayout() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'PushupArena';

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-ink-800 bg-ink-950/80 px-4 py-3 backdrop-blur">
        <Link to="/" className="flex items-center gap-2" aria-label="Start">
          <img src="/logo.png" alt="" className="h-12 w-12 object-contain" />
          <span className="text-base font-bold tracking-tight">{title}</span>
        </Link>
        <Link
          to="/settings"
          aria-label="Einstellungen"
          className="rounded-lg p-2 text-slate-400 hover:bg-ink-800 hover:text-slate-200"
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
