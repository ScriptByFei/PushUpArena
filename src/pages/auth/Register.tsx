import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { GoogleButton } from '@/components/auth/GoogleButton';

export default function Register() {
  const { session, signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Das Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }
    if (password !== confirm) {
      setError('Die Passwörter stimmen nicht überein.');
      return;
    }

    setLoading(true);
    const { error: err, needsEmailConfirmation } = await signUp(email.trim(), password);
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }
    if (needsEmailConfirmation) {
      setConfirmationSent(true);
      return;
    }
    navigate('/', { replace: true });
  }

  async function onGoogle() {
    setError(null);
    setGoogleLoading(true);
    const { error: err } = await signInWithGoogle();
    if (err) {
      setError(err.message);
      setGoogleLoading(false);
    }
  }

  if (confirmationSent) {
    return (
      <AuthLayout title="Fast geschafft!">
        <div className="space-y-4 text-sm text-slate-300">
          <p>
            Wir haben dir eine Bestätigungs-E-Mail an <strong>{email}</strong> gesendet. Bitte
            klicke auf den Link darin, um dein Konto zu aktivieren.
          </p>
          <p className="text-slate-400">
            Keine E-Mail erhalten? Prüfe deinen Spam-Ordner.
          </p>
          <Link to="/login">
            <Button variant="secondary" fullWidth>
              Zur Anmeldung
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Konto erstellen"
      subtitle="Starte deine Liegestütz-Reise."
      footer={
        <>
          Bereits registriert?{' '}
          <Link to="/login" className="font-semibold text-brand-400 hover:text-brand-300">
            Anmelden
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
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="du@example.com"
          />
        </Field>
        <Field label="Passwort" htmlFor="password" hint="Mindestens 8 Zeichen.">
          <PasswordInput
            id="password"
            name="new-password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Field label="Passwort bestätigen" htmlFor="confirm">
          <PasswordInput
            id="confirm"
            name="confirm-password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />
        </Field>

        <Button type="submit" fullWidth size="lg" loading={loading}>
          Registrieren
        </Button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-ink-600" />
        oder
        <span className="h-px flex-1 bg-ink-600" />
      </div>

      <GoogleButton onClick={onGoogle} loading={googleLoading} label="Mit Google registrieren" />

      <p className="mt-4 text-center text-xs text-slate-500">
        Mit der Registrierung stimmst du unserer{' '}
        <Link to="/privacy" className="underline hover:text-slate-300">
          Datenschutzerklärung
        </Link>{' '}
        zu.
      </p>
    </AuthLayout>
  );
}
