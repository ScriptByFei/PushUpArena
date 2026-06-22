// Edge Function: delete-account
// -----------------------------------------------------------------------------
// Löscht das Konto des aufrufenden Nutzers vollständig (DSGVO „Recht auf Löschung").
// Der Auth-Eintrag wird mit dem Service-Role-Key entfernt; alle abhängigen Daten
// (profiles, workout_entries, user_goals, friend_requests, friendships,
// user_achievements) werden per ON DELETE CASCADE automatisch mitgelöscht.
//
// Deployment:
//   supabase functions deploy delete-account
// Benötigte Secrets (vom Supabase-Stack i. d. R. automatisch gesetzt):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// WICHTIG: Der Service-Role-Key existiert nur hier serverseitig – niemals im Frontend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Aufrufenden Nutzer anhand seines JWT identifizieren.
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    // Mit Service-Role den Auth-Nutzer löschen (kaskadiert alle Daten).
    const admin = createClient(url, serviceKey);
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) return json({ error: deleteError.message }, 500);

    return json({ success: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
