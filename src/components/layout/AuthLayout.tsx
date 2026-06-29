import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src="/logo.png"
            alt="PushupArena"
            className="mb-2 h-32 w-32 object-contain drop-shadow-[0_6px_24px_rgba(251,146,60,0.28)]"
          />
          <h1 className="sr-only">PushupArena</h1>
          <p className="text-sm text-slate-400">Tracke. Vergleiche. Werde stärker.</p>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-sm text-slate-400">{footer}</div>}

        <div className="mt-8 flex justify-center gap-4 text-xs text-slate-600">
          <Link to="/privacy" className="hover:text-slate-400">
            Datenschutz
          </Link>
          <Link to="/imprint" className="hover:text-slate-400">
            Impressum
          </Link>
        </div>
      </div>
    </div>
  );
}
