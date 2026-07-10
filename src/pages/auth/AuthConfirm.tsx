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
    <AuthLayout title="E-Mail bestätigt ✓">
      <div className="space-y-5 text-sm text-slate-300">
        <p className="text-emerald-300 font-medium">
          Dein Konto ist jetzt aktiv!
        </p>

        {isIOS() ? (
          <>
            <p>
              Schließe diesen Browser und öffne die{' '}
              <strong className="text-slate-100">PushupArena</strong>-App auf deinem
              Homescreen. Melde dich dort mit deiner E-Mail an.
            </p>
            <div className="rounded-xl border border-ink-600 bg-ink-800 px-4 py-3 text-xs text-slate-400">
              💡 Falls du die App noch nicht auf dem Homescreen hast: Öffne{' '}
              <strong>pushuparena.app</strong> in Safari → Teilen → „Zum Home-Bildschirm".
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
    </AuthLayout>
  );
}
