// Edge Function: notify-milestone-broadcast
// Broadcasts when a user hits 100+ reps. Excludes the sender (they get notify-milestone instead).

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

const VAPID_PUBLIC_KEY = 'BHGmKlk8i8upz5DDsK0OfZcDhyAhI1lQAeEk6B00V4Qg1MJ5NmYtDJwN75XxkodOrPxLHfdXUZQIxVLctwcSRHA';

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

    const { total } = await req.json();
    const admin = createClient(url, serviceKey);

    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .single();
    const name = profile?.display_name || profile?.username || 'Jemand';

    // Exclude sender so they don't get a duplicate (they get notify-milestone)
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('user_id, subscription')
      .neq('user_id', user.id);

    if (!subs || subs.length === 0) return json({ ok: true, sent: 0 });

    webpush.setVapidDetails(vapidSubject, VAPID_PUBLIC_KEY, vapidPrivateKey);

    const payload = JSON.stringify({
      title: '🔥 Meilenstein erreicht!',
      body: `🔥 ${name} hat heute ${total} Liegestützen gemacht!`,
    });

    let sent = 0;
    await Promise.allSettled(
      subs.map(async (row: { user_id: string; subscription: unknown }) => {
        try {
          await webpush.sendNotification(row.subscription, payload);
          sent++;
        } catch (e) {
          if ((e as any)?.statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('user_id', row.user_id);
          }
        }
      }),
    );

    return json({ ok: true, sent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[notify-milestone-broadcast]', msg);
    return json({ error: msg }, 500);
  }
});
