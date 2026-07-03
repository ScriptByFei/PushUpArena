// Edge Function: notify-friend-request
// Sends a Web Push notification to a user when they receive a friend request.
// Called from the frontend after send_friend_request succeeds.
// Secrets required: VAPID_PRIVATE_KEY, VAPID_SUBJECT (same as notify-milestone)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// @ts-ignore
import webpush from 'npm:web-push@3';

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

const VAPID_PUBLIC_KEY = 'BDIqUrenCUVUEDKlF75B7tQs22s9jHt0UnQOSedt4L3qh4ODIpIbbwfMz-aEqknbw6HE28rTkcBhqFE37Gy57nY';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@pushuparena.app';

    // Identify the calling user (the sender)
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const { receiver_id } = await req.json();
    if (!receiver_id) return json({ error: 'Missing receiver_id' }, 400);

    // Use service role client for DB access
    const admin = createClient(url, serviceKey);

    // Get sender's display name
    const { data: senderProfile } = await admin
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .single();
    const senderName = senderProfile?.display_name || senderProfile?.username || 'Jemand';

    // Get receiver's push subscription
    const { data: sub } = await admin
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', receiver_id)
      .single();

    if (!sub?.subscription) {
      return json({ ok: true, sent: false, reason: 'no subscription' });
    }

    webpush.setVapidDetails(vapidSubject, VAPID_PUBLIC_KEY, vapidPrivateKey);

    await webpush.sendNotification(
      sub.subscription,
      JSON.stringify({
        title: 'PushUpArena',
        body: `🤝 ${senderName} möchte dein Freund sein!`,
      }),
    );

    return json({ ok: true, sent: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[notify-friend-request]', msg);
    return json({ error: msg }, 500);
  }
});
