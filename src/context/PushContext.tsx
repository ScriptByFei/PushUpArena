import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { requestPushPermission, removePushSubscription, initPushNotifications, PUSH_USER_DISABLED_KEY } from '@/lib/pushNotifications';

const pushSupported =
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

/** Returns the effective push permission, treating an explicit user opt-out as 'default'. */
function getEffectivePermission(): NotificationPermission {
  if (!pushSupported) return 'default';
  if (Notification.permission !== 'granted') return Notification.permission;
  // OS permission is granted, but did the user explicitly turn it off inside the app?
  if (localStorage.getItem(PUSH_USER_DISABLED_KEY)) return 'default';
  return 'granted';
}

interface PushContextValue {
  pushPermission: NotificationPermission;
  busy: boolean;
  togglePush: () => Promise<void>;
}

const PushContext = createContext<PushContextValue | null>(null);

export function PushProvider({ children }: { children: ReactNode }) {
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(getEffectivePermission);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported) return;
    const effective = getEffectivePermission();
    setPushPermission(effective);
    // Only auto-subscribe when the user has actively granted permission and not opted out
    if (effective === 'granted') {
      void initPushNotifications();
    }
  }, []);

  async function togglePush() {
    setBusy(true);
    try {
      if (pushPermission === 'granted') {
        // User explicitly turning off — persist the choice so it survives app restarts
        localStorage.setItem(PUSH_USER_DISABLED_KEY, '1');
        await removePushSubscription();
        setPushPermission('default');
      } else {
        // User turning on — clear any prior opt-out
        localStorage.removeItem(PUSH_USER_DISABLED_KEY);
        const permission = await requestPushPermission();
        setPushPermission(permission);
      }
    } catch (err) {
      console.error('[push] togglePush error:', err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PushContext.Provider value={{ pushPermission, busy, togglePush }}>
      {children}
    </PushContext.Provider>
  );
}

export function usePush() {
  const ctx = useContext(PushContext);
  if (!ctx) throw new Error('usePush must be used inside PushProvider');
  return ctx;
}
