import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useGoals } from '@/hooks/useGoals';
import { useExercise, EXERCISE_ICONS } from '@/context/ExerciseContext';
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
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import { useQuickAmounts } from '@/hooks/useQuickAmounts';

const DELETE_PHRASE = 'LÖSCHEN';

export default function Settings() {
  const { user, signOut, updatePassword } = useAuth();
  const { exercise, enrolledExercises, declinedExercises, enroll } = useExercise();
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
  const [exPushEnabled, setExPushEnabled] = useState<Record<string, boolean>>({});
  const [exPushSaving, setExPushSaving] = useState(false);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  // Load per-exercise push enabled state
  useEffect(() => {
    if (!user || enrolledExercises.length === 0) return;
    void (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('exercise_enrollments')
        .select('exercise_id, push_enabled')
        .eq('user_id', user.id);
      const map: Record<string, boolean> = {};
      for (const row of data ?? []) {
        map[row.exercise_id] = row.push_enabled ?? true;
      }
      setExPushEnabled(map);
    })();
  }, [user, enrolledExercises.length]);

  async function toggleExPush(exerciseId: string) {
    const newVal = !(exPushEnabled[exerciseId] ?? true);
    setExPushEnabled((prev) => ({ ...prev, [exerciseId]: newVal }));
    setExPushSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('exercise_enrollments')
      .update({ push_enabled: newVal })
      .eq('user_id', user?.id)
      .eq('exercise_id', exerciseId);
    setExPushSaving(false);
  }

  const pushSupported = typeof Notification !== 'undefined';
  const { pushPermission, busy: pushBusy, togglePush } = usePush();
  const { settings: notifSettings, saving: notifSaving, save: saveNotif } = useNotificationSettings();
  const { amounts: quickAmounts, saving: quickSaving, save: saveQuickAmounts } = useQuickAmounts();
  const [quickFields, setQuickFields] = useState<string[]>(['', '', '', '']);
  const [quickInitialized, setQuickInitialized] = useState(false);

  useEffect(() => {
    if (goal) {
      setDaily(String(goal.daily_goal));
      setWeekly(String(goal.weekly_goal));
    }
  }, [goal]);

  useEffect(() => {
    if (!quickInitialized && quickAmounts.length > 0) {
      const fields = [...quickAmounts.map(String)];
      while (fields.length < 4) fields.push('');
      setQuickFields(fields.slice(0, 4));
      setQuickInitialized(true);
    }
  }, [quickAmounts, quickInitialized]);

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

      {/* 3b · Schnelleingabe */}
      <Card>
        <CardTitle>Schnelleingabe · {exercise?.name}</CardTitle>
        <p className="mt-1 text-xs text-slate-400">
          Diese 4 Zahlen erscheinen als Buttons beim Eintragen.
        </p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {quickFields.map((val, i) => (
            <div key={i}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={100000}
                value={val}
                placeholder="–"
                className="text-center font-bold"
                onChange={(e) => {
                  const next = [...quickFields];
                  next[i] = e.target.value;
                  setQuickFields(next);
                }}
              />
            </div>
          ))}
        </div>
        <Button
          fullWidth
          className="mt-3"
          loading={quickSaving}
          onClick={async () => {
            const nums = quickFields
              .map((v) => parseInt(v, 10))
              .filter((n) => !isNaN(n) && n > 0);
            if (nums.length === 0) { toast.error('Mindestens eine Zahl eingeben.'); return; }
            const { error } = await saveQuickAmounts(nums);
            if (error) toast.error(error);
            else toast.success('Schnelleingabe gespeichert.');
          }}
        >
          Speichern
        </Button>
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

      {/* 4b · Benachrichtigungs-Einstellungen (nur wenn Push aktiv) */}
      {pushPermission === 'granted' && (
        <Card>
          <div className="flex items-center gap-2">
            <BellIcon className="h-4 w-4 text-brand-300" />
            <CardTitle>Benachrichtigungs-Typen</CardTitle>
          </div>
          <p className="mt-1 text-xs text-slate-400">Wähle welche Benachrichtigungen du erhalten möchtest.</p>
          <div className="mt-3 space-y-0 divide-y divide-ink-700">
            {[
              { key: 'motivations_push_enabled' as const, label: 'Motivations-Tipps', desc: 'Comeback- und Motivationsnachrichten' },
              { key: 'daily_goal_push_enabled' as const, label: 'Tagesziel-Erinnerungen', desc: 'Morgen-Start und Aktivitäts-Reminder' },
              { key: 'weekly_goal_push_enabled' as const, label: 'Wochenziel-Reminder', desc: 'Wenn du am Wochenende hinter dem Plan liegst' },
              { key: 'streak_push_enabled' as const, label: 'Streak-Retter', desc: 'Abends, wenn deine Streak in Gefahr ist' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-3">
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-sm font-medium text-slate-200">{label}</p>
                  <p className="text-xs text-slate-400">{desc}</p>
                </div>
                <button
                  type="button"
                  disabled={notifSaving}
                  onClick={() => void saveNotif({ [key]: !notifSettings[key] })}
                  className={[
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                    notifSettings[key] ? 'bg-brand-500' : 'bg-ink-600',
                    notifSaving ? 'opacity-50' : '',
                  ].join(' ')}
                  aria-label={label}
                >
                  <span
                    className={[
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform',
                      notifSettings[key] ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ')}
                  />
                </button>
              </div>
            ))}
          </div>
          {/* Ruhestunden */}
          <div className="mt-3 border-t border-ink-700 pt-3">
            <p className="text-sm font-medium text-slate-200">Ruhestunden</p>
            <p className="mt-0.5 text-xs text-slate-400">In dieser Zeit bekommst du keine Motivations-Benachrichtigungen.</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-400">Von</label>
                <select
                  value={notifSettings.quiet_hours_start}
                  disabled={notifSaving}
                  onChange={(e) => void saveNotif({ quiet_hours_start: parseInt(e.target.value, 10) })}
                  className="w-full rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}:00 Uhr</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-slate-400">Bis</label>
                <select
                  value={notifSettings.quiet_hours_end}
                  disabled={notifSaving}
                  onChange={(e) => void saveNotif({ quiet_hours_end: parseInt(e.target.value, 10) })}
                  className="w-full rounded-xl border border-ink-600 bg-ink-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {Array.from({ length: 24 }, (_, i) => (
                    <option key={i} value={i}>{String(i).padStart(2, '0')}:00 Uhr</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Per-Exercise Push */}
          {enrolledExercises.length > 1 && (
            <div className="mt-3 border-t border-ink-700 pt-3">
              <p className="text-sm font-medium text-slate-200">Benachrichtigungen pro Übung</p>
              <p className="mt-0.5 text-xs text-slate-400">Streak-Retter und Ziel-Erinnerungen pro Übung ein- oder ausschalten.</p>
              <div className="mt-2 space-y-0 divide-y divide-ink-700">
                {enrolledExercises.map((ex) => (
                  <div key={ex.id} className="flex items-center justify-between py-3">
                    <p className="text-sm font-medium text-slate-200">{ex.name}</p>
                    <button
                      type="button"
                      disabled={exPushSaving}
                      onClick={() => void toggleExPush(ex.id)}
                      className={[
                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400',
                        (exPushEnabled[ex.id] ?? true) ? 'bg-brand-500' : 'bg-ink-600',
                        exPushSaving ? 'opacity-50' : '',
                      ].join(' ')}
                      aria-label={ex.name}
                    >
                      <span className={[
                        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
                        (exPushEnabled[ex.id] ?? true) ? 'translate-x-5' : 'translate-x-0',
                      ].join(' ')} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

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

      {/* Übungen – abgelehnte Übungen beitreten */}
      {declinedExercises.length > 0 && (
        <Card>
          <CardTitle>Übungen</CardTitle>
          <p className="mt-1 text-xs text-slate-400">
            Du hast diese Übungen abgelehnt. Du kannst jederzeit einsteigen.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {declinedExercises.map((ex) => (
              <div
                key={ex.id}
                className="flex items-center gap-3 rounded-2xl bg-ink-800 px-4 py-3"
              >
                <img
                  src={EXERCISE_ICONS[ex.slug] ?? '/pushup-icon.png'}
                  alt={ex.name}
                  className="h-10 w-10 rounded-xl object-cover"
                />
                <span className="flex-1 text-sm font-medium text-slate-300">{ex.name}</span>
                <Button
                  size="sm"
                  loading={enrollingId === ex.id}
                  disabled={enrollingId !== null}
                  onClick={async () => {
                    setEnrollingId(ex.id);
                    await enroll(ex.id, 'enrolled');
                    setEnrollingId(null);
                    toast.success(`${ex.name} hinzugefügt 💪`);
                  }}
                >
                  Mitmachen
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

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
