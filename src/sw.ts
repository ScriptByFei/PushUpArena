/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Precache-Manifest wird von VitePWA zur Build-Zeit injiziert
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Sofort aktivieren: beim ersten Install und bei Updates via SKIP_WAITING-Message
self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', () => {
  void self.clients.claim();
});

// VitePWA sendet diese Message im autoUpdate-Modus
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting();
  }
});

// ── Push-Benachrichtigungen ────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data: { title?: string; body?: string } = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'PushUpArena', body: event.data.text() };
  }
  const title = data.title ?? 'PushUpArena 💪';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = {
    body: data.body ?? '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
