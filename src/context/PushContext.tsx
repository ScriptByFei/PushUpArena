import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { requestPushPermission, removePushSubscription, initPushNotifications } from '@/lib/pushNotifications';

const pushSupported =
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

interface PushContextValue {
  pushPermission: NotificationPermission;
  busy: boolean;
  togglePush: () => Promise<void>;
}

const PushContext = createContext<PushContextValue | null>(null);

export function PushProvider({ children }: { children: ReactNode }) {
  const [pushPermission, setPushPermission] = useState<NotificationPermission>(
    pushSupported ? Notification.permission : 'default',
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported) return;
    setPushPermission(Notification.permission);
    // Sicherstellen, dass die Subscription in der DB ist, falls Permission bereits erteilt wurde
    void initPushNotifications();
  }, []);

  async function togglePush() {
    setBusy(true);
    try {
      if (pushPermission === 'granted') {
        await removePushSubscription();
        setPushPermission('default');
      } else {
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
