import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { useInstallHintActive } from '@/components/InstallHint';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { GoogleButton } from '@/components/auth/GoogleButton';

export default function Login() {
  const { session, signIn, signInWithGoogle, signInWithPasskey } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const installHintActive = useInstallHintActive();
  const emailRef = useRef<HTMLInputElement>(null);

  // Prevent keyboard from popping up automatically on mobile
  useEffect(() => { emailRef.current?.blur(); }, []);

  const from = (location.state as { from?: Location })?.from?.pathname ?? '/';

  if (session) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) {
      setError(
        err.message === 'Invalid login credentials'
          ? 'E-Mail oder Passwort ist falsch.'
          : err.message,
      );
      return;
    }
    navigate(from, { replace: true });
  }

  async function onGoogle() {
    setError(null);
    setGoogleLoading(true);
    const { error: err } = await signInWithGoogle();
    if (err) {
      setError(err.message);
      setGoogleLoading(false);
    }
    // Bei Erfolg leitet Supabase per Redirect weiter.
  }

  async function onPasskey() {
    setError(null);
    setPasskeyLoading(true);
    const { error: err } = await signInWithPasskey();
    setPasskeyLoading(false);
    if (err) {
      setError('Passkey-Anmeldung fehlgeschlagen. Bitte mit E-Mail und Passwort anmelden.');
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <AuthLayout
      title="Willkommen zurück"
      subtitle="Melde dich an, um deine Arena zu betreten."
      footer={
        <>
          Noch kein Konto?{' '}
          <Link to="/register" className="font-semibold text-brand-400 hover:text-brand-300">
            Jetzt registrieren
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}
        {!installHintActive && <Field label="E-Mail" htmlFor="email">
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="du@example.com"
          />
        </Field>}
        {!installHintActive && <Field label="Passwort" htmlFor="password">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>}

        <div className="text-right">
          <Link to="/forgot-password" className="text-sm text-slate-400 hover:text-slate-200">
            Passwort vergessen?
          </Link>
        </div>

        <Button type="submit" fullWidth size="lg" loading={loading}>
          Anmelden
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-ink-600" />
        oder
        <span className="h-px flex-1 bg-ink-600" />
      </div>

      <GoogleButton onClick={onGoogle} loading={googleLoading} />

      <button
        onClick={onPasskey}
        disabled={passkeyLoading}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-ink-600 bg-ink-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-ink-700 disabled:opacity-50"
      >
        {passkeyLoading ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-brand-400">
            <path d="M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
            <path d="M10 10v5a2 2 0 0 0 4 0v-1" />
            <path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5Z" />
          </svg>
        )}
        Mit Passkey / Face ID anmelden
      </button>
    </AuthLayout>
  );
}
