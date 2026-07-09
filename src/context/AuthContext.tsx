import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import OneSignal from 'react-onesignal';

interface AuthResult {
  error: AuthError | null;
  /** Bei Registrierung true, wenn noch eine E-Mail-Bestätigung aussteht. */
  needsEmailConfirmation?: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, firstName?: string, lastName?: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<AuthResult>;
  updatePassword: (password: string) => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const redirectTo = (path: string) => `${window.location.origin}${path}`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
      if (newSession?.user) {
        void OneSignal.login(newSession.user.id);
        // Wenn Namen in User-Metadaten vorhanden (z.B. nach Email-Bestätigung),
        // in user_identities übertragen falls noch kein Eintrag existiert.
        const meta = newSession.user.user_metadata;
        if (meta?.first_name && meta?.last_name) {
          void supabase.from('user_identities').upsert({
            user_id: newSession.user.id,
            first_name: meta.first_name as string,
            last_name: meta.last_name as string,
          }, { onConflict: 'user_id', ignoreDuplicates: true });
        }
      } else {
        void OneSignal.logout();
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,

      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error };
      },

      async signUp(email, password, firstName, lastName) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectTo('/'),
            // Namen in User-Metadaten speichern – funktioniert auch ohne Session.
            // Beim ersten Login werden sie von onAuthStateChange in user_identities übertragen.
            data: firstName && lastName
              ? { first_name: firstName.trim(), last_name: lastName.trim() }
              : undefined,
          },
        });
        // identities leer => E-Mail bereits registriert; ansonsten Bestätigung nötig,
        // solange keine Session zurückkam.
        const needsEmailConfirmation = !error && !data.session;

        // Falls kein Email-Confirm nötig (Confirm deaktiviert), direkt speichern
        if (!error && data.session && data.user && firstName && lastName) {
          await supabase.from('user_identities').upsert({
            user_id: data.user.id,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          }, { onConflict: 'user_id' });
        }

        return { error, needsEmailConfirmation };
      },

      async signInWithGoogle() {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: redirectTo('/') },
        });
        return { error };
      },

      async signOut() {
        await supabase.auth.signOut();
      },

      async requestPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: redirectTo('/reset-password'),
        });
        return { error };
      },

      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        return { error };
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden.');
  return ctx;
}
