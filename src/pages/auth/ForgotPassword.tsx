import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';

export default function ForgotPassword() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await requestPasswordReset(email.trim());
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <AuthLayout
      title="Passwort zurücksetzen"
      subtitle="Wir senden dir einen Link zum Zurücksetzen."
      footer={
        <Link to="/login" className="font-semibold text-brand-400 hover:text-brand-300">
          Zurück zur Anmeldung
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-2 text-sm text-slate-300">
          <p>
            Falls ein Konto mit <strong>{email}</strong> existiert, haben wir eine E-Mail mit
            einem Link zum Zurücksetzen gesendet.
          </p>
          <p className="text-slate-400">Prüfe ggf. deinen Spam-Ordner.</p>
        </div>
      ) : (
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
          <Button type="submit" fullWidth size="lg" loading={loading}>
            Link senden
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
