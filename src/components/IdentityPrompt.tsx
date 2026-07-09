/**
 * IdentityPrompt – erscheint einmalig für User ohne user_identities-Eintrag.
 * Fragt Vorname + Nachname-Anfangsbuchstabe ab und speichert sie.
 */
import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Input';

export function IdentityPrompt() {
  const { user } = useAuth();
  const [needed, setNeeded] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastNameInitial, setLastNameInitial] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_identities')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) setNeeded(true);
      });
  }, [user]);

  if (!needed) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) { setError('Bitte gib deinen Vornamen an.'); return; }
    if (!lastNameInitial.trim()) { setError('Bitte gib den ersten Buchstaben deines Nachnamens an.'); return; }
    if (!user) return;

    setSaving(true);
    const { error: err } = await supabase.from('user_identities').upsert({
      user_id: user.id,
      first_name: firstName.trim(),
      last_name_initial: lastNameInitial.toUpperCase().charAt(0),
    }, { onConflict: 'user_id' });
    setSaving(false);

    if (err) { setError(err.message); return; }
    setNeeded(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md animate-pop-in rounded-t-3xl border-t border-ink-700 bg-ink-900 px-6 pb-10 pt-6">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-ink-600" />
        <p className="text-lg font-extrabold text-slate-100">Kurze Info benötigt</p>
        <p className="mt-1 text-sm text-slate-400">
          Für den Admin wird einmalig dein Name hinterlegt. Andere User sehen nur deinen Anzeigenamen.
        </p>
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          {error && (
            <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <Field label="Vorname" htmlFor="ip-firstName" className="flex-1">
              <Input
                id="ip-firstName"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Max"
                autoComplete="given-name"
              />
            </Field>
            <Field label="Nachname (1. Buchstabe)" htmlFor="ip-lastInitial" className="w-28">
              <Input
                id="ip-lastInitial"
                required
                maxLength={1}
                value={lastNameInitial}
                onChange={(e) => setLastNameInitial(e.target.value.replace(/[^a-zA-ZäöüÄÖÜ]/, ''))}
                placeholder="M"
                autoComplete="family-name"
              />
            </Field>
          </div>
          <Button type="submit" fullWidth size="lg" loading={saving}>
            Speichern
          </Button>
        </form>
      </div>
    </div>
  );
}
