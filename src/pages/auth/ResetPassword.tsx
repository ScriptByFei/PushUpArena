import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';

export default function ResetPassword() {
  const { updatePassword, session, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

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
    const { error: err } = await updatePassword(password);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate('/', { replace: true }), 1500);
  }

  return (
    <AuthLayout
      title="Neues Passwort festlegen"
      footer={
        <Link to="/login" className="font-semibold text-brand-400 hover:text-brand-300">
          Zurück zur Anmeldung
        </Link>
      }
    >
      {done ? (
        <p className="text-sm text-emerald-300">
          Passwort aktualisiert. Du wirst weitergeleitet …
        </p>
      ) : !authLoading && !session ? (
        <p className="text-sm text-slate-300">
          Dieser Link ist ungültig oder abgelaufen. Fordere unter{' '}
          <Link to="/forgot-password" className="text-brand-400 underline">
            Passwort vergessen
          </Link>{' '}
          einen neuen an.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}
          <Field label="Neues Passwort" htmlFor="password" hint="Mindestens 8 Zeichen.">
            <PasswordInput
              id="password"
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
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Passwort speichern
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
