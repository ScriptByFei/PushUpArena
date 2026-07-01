import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ToastVariant = 'success' | 'error' | 'info' | 'achievement';

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  icon?: string;
}

interface ToastContextValue {
  notify: (message: string, variant?: ToastVariant, icon?: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  achievement: (message: string, icon?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, variant: ToastVariant = 'info', icon?: string) => {
      const id = ++counter;
      setToasts((prev) => [...prev, { id, message, variant, icon }]);
      window.setTimeout(() => remove(id), variant === 'achievement' ? 5000 : 3500);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      success: (m) => notify(m, 'success'),
      error: (m) => notify(m, 'error'),
      achievement: (m, icon) => notify(m, 'achievement', icon),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-3" style={{ top: 'max(12px, env(safe-area-inset-top))' }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            onClick={() => remove(t.id)}
            className={[
              'pointer-events-auto w-full max-w-sm animate-pop-in cursor-pointer rounded-xl border px-4 py-3 text-sm shadow-glow backdrop-blur',
              t.variant === 'success' && 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100',
              t.variant === 'error' && 'border-rose-500/40 bg-rose-500/15 text-rose-100',
              t.variant === 'info' && 'border-brand-500/40 bg-brand-500/15 text-brand-100',
              t.variant === 'achievement' &&
                'border-amber-400/50 bg-amber-400/15 text-amber-100',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="flex items-center gap-2">
              {t.icon && <span className="text-xl">{t.icon}</span>}
              <span className="font-medium">{t.message}</span>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast muss innerhalb von ToastProvider verwendet werden.');
  return ctx;
}
