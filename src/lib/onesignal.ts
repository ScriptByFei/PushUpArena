import OneSignal from 'react-onesignal';

let initialized = false;

export async function initOneSignal(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await OneSignal.init({
    appId: 'b903194f-0494-48c4-aed0-5bd439c57e1f',
    serviceWorkerPath: '/OneSignalSDKWorker.js',
    notifyButton: { enable: false } as never,
  });
  // Wenn der User bereits Browser-Permission hat: sicherstellen dass OneSignal
  // auch wirklich subscribed ist (z. B. nach App-Update oder Neuinstallation)
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      await (OneSignal.User as any).PushSubscription?.optIn?.();
    } catch {
      // ignorieren
    }
  }
}
