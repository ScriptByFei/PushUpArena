import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      // 'autoUpdate': neue Versionen werden im Hintergrund installiert und beim Erkennen
      // automatisch aktiviert + neu geladen (kein Banner, kein Tippen).
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'offline.html',
        'robots.txt',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/maskable-512.png',
        'icons/apple-touch-icon.png',
      ],
      manifest: {
        name: 'PushupArena',
        short_name: 'PushupArena',
        description: 'Tracke deine Liegestütze, setze Ziele und vergleiche dich mit Freunden.',
        theme_color: '#6366f1',
        background_color: '#0b1020',
        display: 'standalone',
        orientation: 'portrait',
        id: '/',
        start_url: '/',
        scope: '/',
        lang: 'de',
        categories: ['health', 'fitness', 'lifestyle'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Nur Assets cachen – index.html NIEMALS precachen oder abfangen.
        // Navigation geht immer direkt ans Netzwerk → garantiert frische App-Version.
        cacheId: 'pushup-arena-v3',
        globPatterns: ['**/*.{js,css,svg,png,ico,woff2}'],
        // Keine navigateFallback, kein runtimeCaching für Navigation.
        // Offline-Nutzung: Supabase-Anfragen scheitern ohnehin; UI-Assets sind gecacht.
        runtimeCaching: [],
        // OneSignal in den PWA-Service-Worker einbinden damit es keinen Scope-Konflikt gibt.
        importScripts: ['/OneSignalSDKWorker.js'],
      },
      devOptions: {
        // Service Worker im Dev-Modus deaktiviert (sauberes HMR).
        enabled: false,
      },
    }),
  ],
});
