import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';

type Status = 'loading' | 'success' | 'error';

// Grobe iOS-Erkennung für angepasste Hinweise
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function AuthConfirm() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // Supabase verarbeitet den Token aus dem URL-Hash / Query-String automatisch
    // beim Initialisieren. Wir lauschen einfach auf das SIGNED_IN-Event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        setStatus('success');
        // Auf Android / Desktop: kurze Pause, dann direkt in die App
        if (!isIOS()) {
          setTimeout(() => navigate('/', { replace: true }), 1800);
        }
      } else if (event === 'TOKEN_REFRESHED') {
        // Ebenfalls als Erfolg werten
        setStatus('success');
        if (!isIOS()) {
          setTimeout(() => navigate('/', { replace: true }), 1800);
        }
      }
    });

    // Timeout: Falls kein Event kommt (z.B. abgelaufener Link)
    const timeout = setTimeout(() => {
      setStatus((prev) => {
        if (prev === 'loading') {
          setErrorMsg('Der Bestätigungslink ist ungültig oder abgelaufen.');
          return 'error';
        }
        return prev;
      });
    }, 6000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  if (status === 'loading') {
    return (
      <AuthLayout title="Bestätigung läuft …">
        <div className="flex flex-col items-center gap-4 py-4 text-sm text-slate-400">
          <svg
            className="h-8 w-8 animate-spin text-brand-400"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12" cy="12" r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          <p>E-Mail wird bestätigt …</p>
        </div>
      </AuthLayout>
    );
  }

  if (status === 'error') {
    return (
      <AuthLayout title="Link ungültig">
        <div className="space-y-4 text-sm text-slate-300">
          <p>{errorMsg}</p>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => navigate('/register', { replace: true })}
          >
            Zurück zur Registrierung
          </Button>
        </div>
      </AuthLayout>
    );
  }

  // success
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-10 text-center">
      {/* Animierter Erfolgs-Kreis */}
      <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-500/30 animate-pop-in">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-12 w-12 text-emerald-400"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </div>

      <h1 className="text-2xl font-extrabold text-slate-100">E-Mail bestätigt!</h1>
      <p className="mt-2 text-base text-emerald-400 font-medium">Dein Konto ist jetzt aktiv 🎉</p>

      <div className="mt-6 w-full max-w-xs space-y-4 text-sm text-slate-400">
        {isIOS() ? (
          <>
            <p>
              Schließe diesen Browser und öffne die{' '}
              <strong className="text-slate-200">PushupArena</strong>-App auf deinem Homescreen.
            </p>
            <div className="flex items-start gap-2 rounded-2xl border border-ink-600 bg-ink-800 px-4 py-3 text-left text-xs">
              <span className="shrink-0">💡</span>
              <span>App noch nicht installiert? Safari → Teilen <span className="text-slate-500">↑</span> → „Zum Home-Bildschirm"</span>
            </div>
          </>
        ) : (
          <>
            <p>Du wirst gleich automatisch weitergeleitet …</p>
            <Button fullWidth onClick={() => navigate('/', { replace: true })}>
              Jetzt zur App
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
