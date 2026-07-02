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
import { PasswordInput } from '@/components/ui/PasswordInput';
import { Modal } from '@/components/ui/Modal';
import { LoadingState } from '@/components/ui/States';
import { BellIcon, LogoutIcon, TrashIcon } from '@/components/ui/icons';
import { usePush } from '@/context/PushContext';

const DELETE_PHRASE = 'LÖSCHEN';

export default function Settings() {
  const { user, signOut, updatePassword } = useAuth();
  const { exercise } = useExercise();
  const { loading: profileLoading } = useProfile();
  const { goal, loading: goalLoading, saveGoals } = useGoals(exercise?.id);
  const toast = useToast();
  const navigate = useNavigate();

  const [daily, setDaily] = useState('0');
  const [weekly, setWeekly] = useState('0');
  const [savingGoals, setSavingGoals] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  // Google/OAuth-User haben kein Passwort → Sicherheitsabschnitt verstecken
  const isOAuthUser = user?.app_metadata?.provider !== 'email';

const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const pushSupported = typeof Notification !== 'undefined';
  const { pushPermission, busy: pushBusy, togglePush } = usePush();

  useEffect(() => {
    if (goal) {
      setDaily(String(goal.daily_goal));
      setWeekly(String(goal.weekly_goal));
    }
  }, [goal]);

  if (profileLoading || goalLoading) return <LoadingState />;

  async function onSaveGoals(e: FormEvent) {
    e.preventDefault();
    setSavingGoals(true);
    const { error } = await saveGoals(parseInt(daily, 10) || 0, parseInt(weekly, 10) || 0);
    setSavingGoals(false);
    if (error) toast.error(error);
    else toast.success('Ziele gespeichert.');
  }


  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error('Mindestens 8 Zeichen.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwörter stimmen nicht überein.');
      return;
    }
    setSavingPw(true);
    const { error } = await updatePassword(newPassword);
    setSavingPw(false);
    if (error) toast.error(error.message);
    else {
      toast.success('Passwort geändert.');
      setNewPassword('');
      setConfirmPassword('');
    }
  }

  async function onLogout() {
    await signOut();
    navigate('/login', { replace: true });
  }

  function closeDelete() {
    setDeleteOpen(false);
    setDeleteConfirm('');
  }

  async function onDeleteAccount() {
    setDeleting(true);
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) {
      // Fallback, falls die Edge Function nicht erreichbar ist: eigene Profildaten löschen
      // (kaskadiert alle Nutzerdaten).
      if (user) await supabase.from('profiles').delete().eq('id', user.id);
      toast.notify('Deine Daten wurden gelöscht.');
    } else {
      toast.success('Konto gelöscht.');
    }
    await signOut();
    setDeleting(false);
    navigate('/login', { replace: true });
  }

  return (
    <div className="space-y-4">
      {/* 1 · Konto */}
      <Card>
        <CardTitle>Konto</CardTitle>
        <p className="mt-2 text-xs text-slate-500">Angemeldet als {user?.email}</p>
        <Button variant="secondary" fullWidth className="mt-3" onClick={onLogout}>
          <LogoutIcon className="h-5 w-5" />
          Abmelden
        </Button>
      </Card>

      {/* 2 · Ziele */}
      <Card>
        <CardTitle>Ziele · {exercise?.name}</CardTitle>
        <form onSubmit={onSaveGoals} className="mt-3">
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="daily" className="mb-1 block text-xs text-slate-400">
                Tagesziel <span className="text-slate-600">(0 = kein)</span>
              </label>
              <Input
                id="daily"
                type="number"
                min={0}
                max={100000}
                value={daily}
                onChange={(e) => setDaily(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="weekly" className="mb-1 block text-xs text-slate-400">
                Wochenziel <span className="text-slate-600">(0 = kein)</span>
              </label>
              <Input
                id="weekly"
                type="number"
                min={0}
                max={700000}
                value={weekly}
                onChange={(e) => setWeekly(e.target.value)}
              />
            </div>
          </div>
          <Button type="submit" fullWidth loading={savingGoals}>
            Ziele speichern
          </Button>
        </form>
      </Card>

      {/* 4 · Benachrichtigungen */}
      <Card>
        <div className="flex items-center gap-2">
          <BellIcon className="h-4 w-4 text-brand-300" />
          <CardTitle>Benachrichtigungen</CardTitle>
        </div>

        {!pushSupported ? (
          <div className="mt-3 rounded-xl border border-ink-600 bg-ink-800/60 px-4 py-3">
            <p className="text-sm font-medium text-slate-300">Nicht unterstützt</p>
            <p className="mt-1 text-xs text-slate-400">
              Dein Browser unterstützt keine Push-Benachrichtigungen. Auf iPhone/iPad
              funktioniert dies ab iOS 16.4 – aber nur wenn die App zum Homebildschirm
              hinzugefügt wurde und von dort gestartet wird.
            </p>
          </div>
        ) : pushPermission === 'granted' ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2 rounded-xl border border-emerald-600/40 bg-emerald-500/10 px-4 py-3">
              <span className="text-emerald-400">✓</span>
              <p className="text-sm text-emerald-300">Push-Benachrichtigungen sind aktiviert.</p>
            </div>
            <Button
              variant="secondary"
              fullWidth
              loading={pushBusy}
              onClick={togglePush}
            >
              Benachrichtigungen deaktivieren
            </Button>
          </div>
        ) : pushPermission === 'denied' ? (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <p className="text-sm font-medium text-amber-300">Benachrichtigungen blockiert</p>
            <p className="mt-1 text-xs text-slate-400">
              Du hast Benachrichtigungen blockiert. Um sie zu aktivieren: Einstellungen → Apps →
              PushupArena → Mitteilungen → erlauben.
            </p>
          </div>
        ) : (
          /* 'default' oder unbekannter Wert → Button anzeigen */
          <>
            <p className="mt-2 text-xs text-slate-400">
              Erhalte Benachrichtigungen über neue Freundschaftsanfragen und Aktivitäten.
            </p>
            <Button
              variant="secondary"
              fullWidth
              className="mt-3"
              loading={pushBusy}
              onClick={togglePush}
            >
              <BellIcon className="h-4 w-4" />
              Benachrichtigungen aktivieren
            </Button>
          </>
        )}
      </Card>

      {/* 5 · Sicherheit – nur für E-Mail-User */}
      {!isOAuthUser && (
        <Card>
          <CardTitle>Sicherheit</CardTitle>
          <form onSubmit={onChangePassword} className="mt-3 space-y-3">
            <Field label="Neues Passwort" htmlFor="newpw" hint="Mindestens 8 Zeichen.">
              <PasswordInput
                id="newpw"
                name="new-password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <Field label="Passwort bestätigen" htmlFor="confirmpw">
              <PasswordInput
                id="confirmpw"
                name="confirm-password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <Button
              type="submit"
              variant="secondary"
              fullWidth
              loading={savingPw}
              disabled={!newPassword || !confirmPassword}
            >
              Passwort aktualisieren
            </Button>
          </form>
        </Card>
      )}

      {/* 6 · Rechtliches */}
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

      {/* Gefahrenzone */}
      <Card className="border-rose-500/40 bg-rose-500/5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-rose-300">Gefahrenzone</h2>
        <p className="mt-2 text-sm text-slate-400">
          Beim Löschen werden alle deine Einträge, Ziele, Freundschaften und dein Profil
          unwiderruflich entfernt. Das lässt sich nicht rückgängig machen.
        </p>
        <Button variant="danger" fullWidth className="mt-3" onClick={() => setDeleteOpen(true)}>
          <TrashIcon className="h-5 w-5" />
          Konto dauerhaft löschen
        </Button>
      </Card>

      <Modal
        open={deleteOpen}
        title="Konto wirklich löschen?"
        confirmLabel="Konto löschen"
        confirmVariant="danger"
        loading={deleting}
        confirmDisabled={deleteConfirm.trim().toUpperCase() !== DELETE_PHRASE}
        onClose={closeDelete}
        onConfirm={onDeleteAccount}
      >
        <div className="space-y-3 text-left">
          <p>
            Alle deine Daten werden unwiderruflich gelöscht. Dieser Schritt kann nicht rückgängig
            gemacht werden.
          </p>
          <p className="text-slate-400">
            Tippe zur Bestätigung <strong className="text-rose-300">{DELETE_PHRASE}</strong> ein:
          </p>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={DELETE_PHRASE}
            autoCapitalize="characters"
            autoComplete="off"
            aria-label="Löschen bestätigen"
          />
        </div>
      </Modal>
    </div>
  );
}
