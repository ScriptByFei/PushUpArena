import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useGoals } from '@/hooks/useGoals';
import { useExercise } from '@/context/ExerciseContext';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/lib/supabase';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { LoadingState } from '@/components/ui/States';
import { LogoutIcon } from '@/components/ui/icons';

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${
        checked ? 'bg-brand-500' : 'bg-ink-600'
      }`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${
          checked ? 'left-6' : 'left-1'
        }`}
      />
    </button>
  );
}

export default function Settings() {
  const { user, signOut, updatePassword } = useAuth();
  const { exercise } = useExercise();
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const { goal, loading: goalLoading, saveGoals } = useGoals(exercise?.id);
  const toast = useToast();
  const navigate = useNavigate();

  const [daily, setDaily] = useState('0');
  const [weekly, setWeekly] = useState('0');
  const [savingGoals, setSavingGoals] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  const [searchable, setSearchable] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (goal) {
      setDaily(String(goal.daily_goal));
      setWeekly(String(goal.weekly_goal));
    }
  }, [goal]);

  useEffect(() => {
    if (profile) setSearchable(profile.is_searchable);
  }, [profile]);

  if (profileLoading || goalLoading) return <LoadingState />;

  async function onSaveGoals(e: FormEvent) {
    e.preventDefault();
    setSavingGoals(true);
    const { error } = await saveGoals(parseInt(daily, 10) || 0, parseInt(weekly, 10) || 0);
    setSavingGoals(false);
    if (error) toast.error(error);
    else toast.success('Ziele gespeichert.');
  }

  async function onToggleSearchable(value: boolean) {
    setSearchable(value);
    const { error } = await updateProfile({ is_searchable: value });
    if (error) {
      setSearchable(!value);
      toast.error(error);
    } else {
      toast.success(value ? 'Du bist jetzt auffindbar.' : 'Du bist nicht mehr auffindbar.');
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Mindestens 8 Zeichen.');
      return;
    }
    setSavingPw(true);
    const { error } = await updatePassword(newPassword);
    setSavingPw(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Passwort geändert.');
      setNewPassword('');
    }
  }

  async function onLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  async function onDeleteAccount() {
    setDeleting(true);
    // Vollständige Löschung erfolgt über die Edge Function "delete-account"
    // (Service-Role, serverseitig). Siehe supabase/functions/delete-account.
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) {
      // Fallback: zumindest die eigenen Profildaten löschen (kaskadiert alle Daten),
      // falls die Edge Function (noch) nicht deployt ist.
      if (user) await supabase.from('profiles').delete().eq('id', user.id);
      toast.notify(
        'Deine Daten wurden gelöscht. Der Auth-Eintrag wird über die Edge Function entfernt (siehe README).',
      );
    } else {
      toast.success('Konto gelöscht.');
    }
    await signOut();
    setDeleting(false);
    navigate('/login', { replace: true });
  }

  return (
    <div className="space-y-4">
      {/* Ziele */}
      <Card>
        <CardTitle>Ziele · {exercise?.name}</CardTitle>
        <form onSubmit={onSaveGoals} className="mt-3 space-y-3">
          <Field label="Tagesziel" htmlFor="daily" hint="0 = kein Ziel">
            <Input
              id="daily"
              type="number"
              min={0}
              max={100000}
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
            />
          </Field>
          <Field label="Wochenziel" htmlFor="weekly" hint="0 = kein Ziel">
            <Input
              id="weekly"
              type="number"
              min={0}
              max={700000}
              value={weekly}
              onChange={(e) => setWeekly(e.target.value)}
            />
          </Field>
          <Button type="submit" fullWidth loading={savingGoals}>
            Ziele speichern
          </Button>
        </form>
      </Card>

      {/* Privatsphäre */}
      <Card>
        <CardTitle>Privatsphäre</CardTitle>
        <div className="mt-3 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-200">Über Username auffindbar</p>
            <p className="text-xs text-slate-400">
              Wenn aus, kann dich niemand über die Suche finden.
            </p>
          </div>
          <Toggle checked={searchable} onChange={onToggleSearchable} />
        </div>
      </Card>

      {/* Passwort */}
      <Card>
        <CardTitle>Passwort ändern</CardTitle>
        <form onSubmit={onChangePassword} className="mt-3 space-y-3">
          <Field label="Neues Passwort" htmlFor="newpw" hint="Mindestens 8 Zeichen.">
            <Input
              id="newpw"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          <Button type="submit" variant="secondary" fullWidth loading={savingPw} disabled={!newPassword}>
            Passwort aktualisieren
          </Button>
        </form>
      </Card>

      {/* Rechtliches */}
      <Card>
        <CardTitle>Rechtliches</CardTitle>
        <div className="mt-2 flex flex-col gap-1 text-sm">
          <Link to="/privacy" className="py-1.5 text-brand-300 hover:text-brand-200">
            Datenschutzerklärung
          </Link>
          <Link to="/imprint" className="py-1.5 text-brand-300 hover:text-brand-200">
            Impressum
          </Link>
        </div>
      </Card>

      {/* Konto */}
      <Card>
        <CardTitle>Konto</CardTitle>
        <p className="mt-2 text-xs text-slate-500">Angemeldet als {user?.email}</p>
        <Button variant="secondary" fullWidth className="mt-3" onClick={onLogout}>
          <LogoutIcon className="h-5 w-5" />
          Abmelden
        </Button>
        <button
          onClick={() => setDeleteOpen(true)}
          className="mt-4 w-full text-center text-sm text-rose-400 hover:text-rose-300"
        >
          Konto dauerhaft löschen
        </button>
      </Card>

      <Modal
        open={deleteOpen}
        title="Konto löschen?"
        confirmLabel="Endgültig löschen"
        confirmVariant="danger"
        loading={deleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={onDeleteAccount}
      >
        Alle deine Daten (Einträge, Ziele, Freundschaften, Profil) werden unwiderruflich gelöscht.
        Dieser Schritt kann nicht rückgängig gemacht werden.
      </Modal>
    </div>
  );
}
