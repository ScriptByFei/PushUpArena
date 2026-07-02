/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope;

// Neuen SW sofort aktivieren (verhält sich wie autoUpdate)
self.skipWaiting();
clientsClaim();

// Precache-Manifest wird von VitePWA zur Build-Zeit injiziert
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

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
