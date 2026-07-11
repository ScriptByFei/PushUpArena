// Edge Function: notify-friend-accepted
// Sends a Web Push notification to the original sender when their friend request is accepted.

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

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const { request_id } = await req.json();
    if (!request_id) return json({ error: 'Missing request_id' }, 400);

    const admin = createClient(url, serviceKey);

    const { data: friendReq } = await admin
      .from('friend_requests')
      .select('sender_id, receiver_id')
      .eq('id', request_id)
      .single();

    if (!friendReq) return json({ ok: true, sent: false, reason: 'request not found' });
    if (friendReq.receiver_id !== user.id) return json({ error: 'Forbidden' }, 403);

    const { data: accepterProfile } = await admin
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .single();
    const accepterName = accepterProfile?.display_name || accepterProfile?.username || 'Jemand';

    const { data: sub } = await admin
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_id', friendReq.sender_id)
      .single();

    if (!sub?.subscription) {
      return json({ ok: true, sent: false, reason: 'no subscription' });
    }

    webpush.setVapidDetails(vapidSubject, VAPID_PUBLIC_KEY, vapidPrivateKey);

    await webpush.sendNotification(
      sub.subscription,
      JSON.stringify({
        title: '🎉 Neue Freundschaft!',
        body: `🎉 ${accepterName} hat deine Freundschaftsanfrage angenommen!`,
      }),
    );

    return json({ ok: true, sent: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[notify-friend-accepted]', msg);
    return json({ error: msg }, 500);
  }
});
