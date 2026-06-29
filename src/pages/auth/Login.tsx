import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { GoogleButton } from '@/components/auth/GoogleButton';

export default function Login() {
  const { session, signIn, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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
        <Field label="E-Mail" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="du@example.com"
          />
        </Field>
        <Field label="Passwort" htmlFor="password">
          <PasswordInput
            id="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

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
    </AuthLayout>
  );
}
