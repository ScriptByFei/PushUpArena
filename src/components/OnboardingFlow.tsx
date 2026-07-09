/**
 * OnboardingFlow – erscheint einmalig nach der Registrierung.
 *
 * Schritt 1 (optional): Name eingeben – nur für neue User ohne user_identities.
 * Schritt 2:            Anzeigenamen wählen (display_name_confirmed = false).
 * Schritt 3:            Push-Benachrichtigungen aktivieren (falls unterstützt).
 */
import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { requestPushPermission } from '@/lib/pushNotifications';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';

type Step = 'loading' | 'identity' | 'display_name' | 'push' | 'done';

const pushSupported =
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

export function OnboardingFlow() {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('loading');

  // Step 1: Echt-Name-Eingabe
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identitySaving, setIdentitySaving] = useState(false);

  // Step 2: Anzeigenamen wählen
  const [displayName, setDisplayName] = useState('');
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
  const [displayNameSaving, setDisplayNameSaving] = useState(false);

  // Step 3: Push-Benachrichtigungen
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function check() {
      // 1. user_identities prüfen
      const { data: identity } = await supabase
        .from('user_identities')
        .select('first_name, last_name')
        .eq('user_id', user!.id)
        .maybeSingle();

      let fn = identity?.first_name ?? '';
      let ln = identity?.last_name ?? '';
      let hasIdentity = !!identity;

      // Falls nicht in DB: Metadaten prüfen (neuer User nach Email-Bestätigung)
      if (!hasIdentity) {
        const meta = user!.user_metadata;
        fn = (meta?.first_name || meta?.given_name || '') as string;
        ln = (meta?.last_name || meta?.family_name || '') as string;
        hasIdentity = !!(fn.trim() && ln.trim());
      }

      // 2. display_name_confirmed prüfen
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name_confirmed')
        .eq('id', user!.id)
        .maybeSingle();

      const confirmed = (profile as Record<string, unknown> | null)
        ?.display_name_confirmed as boolean | undefined;

      if (!hasIdentity && confirmed === false) {
        // Neue User ohne Namen → Namen-Schritt
        setStep('identity');
        return;
      }

      if (confirmed === false) {
        // Neuer User → Anzeigenamen wählen lassen
        setFirstName(fn.trim());
        setLastName(ln.trim());
        setDisplayName(`${fn.trim()} ${ln.trim()}`);
        setStep('display_name');
        return;
      }

      setStep('done');
    }

    check();
  }, [user]);

  function goToPushOrDone() {
    if (pushSupported && Notification.permission === 'default') {
      // Als "gezeigt" markieren damit PushPrompt nicht nochmal erscheint
      localStorage.setItem('push-prompted', '1');
      setStep('push');
    } else {
      setStep('done');
    }
  }

  // ── Schritt 1: Echt-Namen eingeben ─────────────────────────────────────
  async function onIdentitySubmit(e: FormEvent) {
    e.preventDefault();
    setIdentityError(null);
    if (!firstName.trim()) { setIdentityError('Bitte gib deinen Vornamen an.'); return; }
    if (!lastName.trim()) { setIdentityError('Bitte gib deinen Nachnamen an.'); return; }
    if (!user) return;

    setIdentitySaving(true);
    const { error: err } = await supabase.from('user_identities').upsert({
      user_id: user.id,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
    }, { onConflict: 'user_id' });
    setIdentitySaving(false);

    if (err) { setIdentityError(err.message); return; }
    setDisplayName(`${firstName.trim()} ${lastName.trim()}`);
    setStep('display_name');
  }

  // ── Schritt 2: Anzeigenamen bestätigen/wählen ──────────────────────────
  async function onDisplayNameSubmit(e: FormEvent) {
    e.preventDefault();
    setDisplayNameError(null);
    const trimmed = displayName.trim();
    if (!trimmed) { setDisplayNameError('Bitte gib einen Anzeigenamen an.'); return; }
    if (trimmed.length > 50) { setDisplayNameError('Maximal 50 Zeichen.'); return; }
    if (!user) return;

    setDisplayNameSaving(true);
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name: trimmed, display_name_confirmed: true } as Record<string, unknown>)
      .eq('id', user.id);
    setDisplayNameSaving(false);

    if (err) { setDisplayNameError(err.message); return; }
    goToPushOrDone();
  }

  // ── Schritt 3: Push-Benachrichtigungen aktivieren ──────────────────────
  async function onEnablePush() {
    setPushBusy(true);
    try {
      await requestPushPermission();
    } catch (_) {
      // Fehler ignorieren — User sieht es im Browser-Dialog
    } finally {
      setPushBusy(false);
      setStep('done');
    }
  }

  if (step === 'loading' || step === 'done') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-6">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-ink-600" />

        {/* ── Schritt 1: Echt-Name ─────────────────────────────────── */}
        {step === 'identity' && (
          <>
            <p className="text-lg font-extrabold text-slate-100">Wie heißt du?</p>
            <p className="mt-1 text-sm text-slate-400">
              Vor- und Nachname werden als dein permanentes Handle gespeichert,
              damit du als Admin identifizierbar bist.
            </p>
            <form onSubmit={onIdentitySubmit} className="mt-5 space-y-4">
              {identityError && (
                <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {identityError}
                </p>
              )}
              <div className="flex gap-3">
                <Field label="Vorname" htmlFor="of-firstName" className="flex-1">
                  <Input
                    id="of-firstName"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Max"
                    autoComplete="given-name"
                  />
                </Field>
                <Field label="Nachname" htmlFor="of-lastName" className="flex-1">
                  <Input
                    id="of-lastName"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Mustermann"
                    autoComplete="family-name"
                  />
                </Field>
              </div>
              <Button type="submit" fullWidth size="lg" loading={identitySaving}>
                Weiter
              </Button>
            </form>
          </>
        )}

        {/* ── Schritt 2: Anzeigename wählen ────────────────────────── */}
        {step === 'display_name' && (
          <>
            <p className="text-lg font-extrabold text-slate-100">Wie soll dein Anzeigename sein?</p>
            <p className="mt-1 text-sm text-slate-400">
              Das ist der Name, den andere User sehen. Du kannst ihn jederzeit
              im Profil ändern.
            </p>
            {firstName && lastName && (
              <p className="mt-2 text-xs text-slate-500">
                Dein Handle bleibt immer <span className="text-brand-400">@{firstName} {lastName}</span>.
              </p>
            )}
            <form onSubmit={onDisplayNameSubmit} className="mt-5 space-y-4">
              {displayNameError && (
                <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {displayNameError}
                </p>
              )}
              <Field label="Anzeigename" htmlFor="of-displayName">
                <Input
                  id="of-displayName"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="z. B. Max Mustermann"
                  maxLength={50}
                  autoComplete="nickname"
                />
              </Field>
              <Button type="submit" fullWidth size="lg" loading={displayNameSaving}>
                Speichern
              </Button>
            </form>
          </>
        )}

        {/* ── Schritt 3: Push-Benachrichtigungen ───────────────────── */}
        {step === 'push' && (
          <>
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/20 text-3xl">
              🔔
            </div>
            <p className="text-lg font-extrabold text-slate-100">Benachrichtigungen aktivieren</p>
            <p className="mt-1 text-sm text-slate-400">
              Erhalte eine Nachricht wenn jemand eine Freundschaftsanfrage sendet
              oder annimmt, und wenn Meilensteine erreicht werden.
            </p>
            <div className="mt-6 space-y-3">
              <Button fullWidth size="lg" loading={pushBusy} onClick={onEnablePush}>
                Jetzt aktivieren
              </Button>
              <button
                onClick={() => setStep('done')}
                className="w-full text-center text-sm text-slate-500 hover:text-slate-400 transition-colors"
              >
                Später
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
