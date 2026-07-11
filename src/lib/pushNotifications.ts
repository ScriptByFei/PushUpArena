import { supabase } from '@/lib/supabase';

const VAPID_PUBLIC_KEY = 'BHGmKlk8i8upz5DDsK0OfZcDhyAhI1lQAeEk6B00V4Qg1MJ5NmYtDJwN75XxkodOrPxLHfdXUZQIxVLctwcSRHA';

let initialized = false;

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buf = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < rawData.length; ++i) view[i] = rawData.charCodeAt(i);
  return buf;
}

export const PUSH_USER_DISABLED_KEY = 'push-user-disabled';

export async function initPushNotifications(): Promise<void> {
  if (initialized) return;
  initialized = true;
  // Respect explicit user opt-out — don't re-subscribe silently
  if (localStorage.getItem(PUSH_USER_DISABLED_KEY)) return;
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    void ensureSubscription();
  }
}

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    await ensureSubscription();
  }
  return permission;
}

/** Returns the service worker registration with a timeout guard. */
async function getSwRegistration(timeoutMs = 8000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('SW not ready within timeout')), timeoutMs)
    ),
  ]);
}

/** Returns true if the existing subscription was created with the current VAPID key. */
function subscriptionKeyMatches(sub: PushSubscription): boolean {
  const existingKey = sub.options?.applicationServerKey;
  if (!existingKey) return false;
  const current = new Uint8Array(urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as ArrayBuffer);
  const existing = new Uint8Array(existingKey as ArrayBuffer);
  return current.length === existing.length && current.every((b, i) => b === existing[i]);
}

export async function ensureSubscription(): Promise<void> {
  try {
    const registration = await getSwRegistration();
    const existing = await registration.pushManager.getSubscription();

    let sub: PushSubscription;
    if (existing && subscriptionKeyMatches(existing)) {
      // Already subscribed with the correct VAPID key — nothing to do
      sub = existing;
    } else {
      // Missing or outdated subscription — (re-)subscribe with the current key
      if (existing) await existing.unsubscribe();
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    // Mark the current key as active so the Dashboard banner stays hidden
    localStorage.setItem('push_vapid_v', VAPID_PUBLIC_KEY);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('push_subscriptions')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert({ user_id: user.id, subscription: sub.toJSON() as any, updated_at: new Date().toISOString() } as any, {
        onConflict: 'user_id',
      });
  } catch (err) {
    console.error('[push] subscription error:', err);
    throw err; // re-throw so callers can handle busy state
  }
}

export async function removePushSubscription(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (user) await (supabase.from('push_subscriptions') as any).delete().eq('user_id', user.id);
  } catch (err) {
    console.error('[push] unsubscribe error:', err);
  }
}
