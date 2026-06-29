import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto min-h-screen max-w-md px-4 py-6">
      <Link to="/" className="text-sm text-brand-400 hover:text-brand-300">
        ← Zurück
      </Link>
      <h1 className="mb-4 mt-3 text-2xl font-extrabold">{title}</h1>
      <div className="space-y-4 text-sm leading-relaxed text-slate-300 [&_h2]:mt-6 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-100">
        {children}
      </div>
      <p className="mt-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
        ⚠️ Nicht-öffentliche App – private Nutzung im geschlossenen Kreis. Diese Seite ist ein
        Platzhalter und vor einer öffentlichen Bereitstellung durch rechtssichere Inhalte zu
        ersetzen.
      </p>
    </div>
  );
}
