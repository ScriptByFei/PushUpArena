import type { ReactNode } from 'react';
import { Spinner } from './Spinner';
import { Button } from './Button';

/** Lade-Zustand (zentriert). */
export function LoadingState({ label = 'Lädt …' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <Spinner size="lg" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Fehler-Zustand mit optionalem Retry. */
export function ErrorState({
  message = 'Etwas ist schiefgelaufen.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="text-3xl">⚠️</div>
      <p className="max-w-xs text-sm text-rose-300">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Erneut versuchen
        </Button>
      )}
    </div>
  );
}

/** Leerer Zustand (keine Daten). */
export function EmptyState({
  icon = '🗂️',
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-600 px-6 py-12 text-center">
      <div className="text-4xl">{icon}</div>
      <h3 className="text-base font-semibold text-slate-200">{title}</h3>
      {description && <p className="max-w-xs text-sm text-slate-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
