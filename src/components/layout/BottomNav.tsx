import { NavLink } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import { HomeIcon, PlusIcon, UsersIcon, TrophyIcon, UserIcon } from '@/components/ui/icons';

interface NavItem {
  to: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}

// Reihenfolge der Seiten-Items (der FAB sitzt fest in der Mitte).
const left: NavItem[] = [
  { to: '/', label: 'Start', Icon: HomeIcon },
  { to: '/friends', label: 'Freunde', Icon: UsersIcon },
];
const right: NavItem[] = [
  { to: '/leaderboard', label: 'Rangliste', Icon: TrophyIcon },
  { to: '/profile', label: 'Profil', Icon: UserIcon },
];

function SideItem({ to, label, Icon }: NavItem) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      aria-label={label}
      className="flex h-16 flex-col items-center justify-center gap-1"
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-6 w-6 transition ${isActive ? 'text-brand-400' : 'text-slate-500'}`} />
          <span
            className={`text-[11px] font-medium ${isActive ? 'text-brand-300' : 'text-slate-500'}`}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  );
}

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-900"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2">
        {left.map((item) => (
          <SideItem key={item.to} {...item} />
        ))}

        {/* Zentraler FAB – ohne Textlabel, durch Ring + Glow klar von der Leiste getrennt. */}
        <div className="flex justify-center">
          <NavLink to="/track" aria-label="Liegestütze eintragen" className="-translate-y-5">
            {({ isActive }) => (
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-glow ring-4 ring-ink-900 transition active:scale-95 ${
                  isActive ? 'bg-brand-500' : 'bg-gradient-to-br from-brand-400 to-brand-600'
                }`}
              >
                <PlusIcon className="h-7 w-7" />
              </span>
            )}
          </NavLink>
        </div>

        {right.map((item) => (
          <SideItem key={item.to} {...item} />
        ))}
      </div>
    </nav>
  );
}
