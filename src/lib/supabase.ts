import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True, wenn die Supabase-Umgebungsvariablen gesetzt sind. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  // Klarer Hinweis statt kryptischer Laufzeitfehler.
  console.error(
    '[PushupArena] Supabase ist nicht konfiguriert. Lege eine .env nach dem Muster ' +
      'von .env.example an (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).',
  );
}

// Hinweis: Es wird ausschließlich der öffentliche anon/publishable Key verwendet.
// Der Service-Role-/Secret-Key darf NIEMALS im Frontend landen.
export const supabase = createClient<Database>(
  supabaseUrl ?? 'http://localhost:54321',
  supabaseAnonKey ?? 'public-anon-key-missing',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
    // Passkeys (WebAuthn) feature flag
    experimental: { passkey: true },
  },
);
