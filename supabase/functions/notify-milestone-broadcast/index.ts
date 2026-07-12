// Edge Function: notify-milestone-broadcast
// Broadcasts when a user hits 100+ reps. Excludes the sender (they get notify-milestone instead).
// Idempotency: uses dedup_key in notification_logs to ensure at-most-once delivery per user/day.

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

/** Berlin-Datum als YYYY-MM-DD */
function berlinDate(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
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
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@pushuparena.app';

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    const { total } = await req.json();
    const admin = createClient(url, serviceKey);
    const today = berlinDate();

    // ── Idempotenz-Guard ────────────────────────────────────────────────────
    // Dedup-Key: pro Sender + Meilenstein + Tag nur einmal senden
    const dedupKey = `milestone:100:${user.id}:${today}`;

    const { error: insertError } = await admin
      .from('notification_logs')
      .insert({
        user_id: user.id,
        trigger_type: 'milestone_broadcast',
        sent_at: new Date().toISOString(),
        dedup_key: dedupKey,
        metadata: { milestone: 100, total, triggered_by: user.id },
      });

    if (insertError) {
      // Unique-Verletzung = bereits heute gesendet → überspringen
      if (insertError.code === '23505') {
        console.log(`[milestone-broadcast] SKIPPED – dedup_key already exists: ${dedupKey}`);
        return json({ ok: true, skipped: true, reason: 'already_sent_today' });
      }
      // Anderer DB-Fehler → trotzdem senden, aber loggen
      console.error('[milestone-broadcast] Warning: could not insert log entry:', insertError.message);
    } else {
      console.log(`[milestone-broadcast] Trigger accepted – dedup_key: ${dedupKey}`);
    }

    // ── Sender-Profil laden ─────────────────────────────────────────────────
    const { data: profile } = await admin
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .single();
    const name = profile?.display_name || profile?.username || 'Jemand';

    // ── Subscriptions aller anderen User holen ──────────────────────────────
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('user_id, subscription')
      .neq('user_id', user.id);

    if (!subs || subs.length === 0) {
      console.log('[milestone-broadcast] No subscribers → sent: 0');
      return json({ ok: true, sent: 0 });
    }

    console.log(`[milestone-broadcast] Sending to ${subs.length} subscriber(s): ${name} → ${total} reps`);

    webpush.setVapidDetails(vapidSubject, VAPID_PUBLIC_KEY, vapidPrivateKey);

    const payload = JSON.stringify({
      title: '🔥 Meilenstein erreicht!',
      body: `🔥 ${name} hat heute ${total} Liegestützen gemacht!`,
    });

    let sent = 0;
    let failed = 0;
    const staleEndpoints: string[] = [];

    await Promise.allSettled(
      subs.map(async (row: { user_id: string; subscription: unknown }) => {
        try {
          await webpush.sendNotification(row.subscription, payload);
          sent++;
          console.log(`[milestone-broadcast] ✓ Sent to user ${row.user_id}`);
        } catch (e: unknown) {
          failed++;
          const status = (e as { statusCode?: number })?.statusCode;
          if (status === 410 || status === 404) {
            // Subscription abgelaufen → löschen
            staleEndpoints.push(row.user_id);
            console.log(`[milestone-broadcast] 410/404 – removing stale sub for user ${row.user_id}`);
          } else {
            console.error(`[milestone-broadcast] ✗ Failed for user ${row.user_id}: ${status}`);
          }
        }
      }),
    );

    // Abgelaufene Subscriptions entfernen
    if (staleEndpoints.length > 0) {
      await admin
        .from('push_subscriptions')
        .delete()
        .in('user_id', staleEndpoints);
      console.log(`[milestone-broadcast] Removed ${staleEndpoints.length} stale subscription(s)`);
    }

    console.log(`[milestone-broadcast] Done – sent: ${sent}, failed: ${failed}, stale_removed: ${staleEndpoints.length}`);
    return json({ ok: true, sent, failed, stale_removed: staleEndpoints.length });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[notify-milestone-broadcast] Unexpected error:', msg);
    return json({ error: msg }, 500);
  }
});
