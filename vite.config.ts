import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';

// Lies die Version die gen-version.mjs geschrieben hat und embed sie im Bundle.
// So kann PWAUpdater zur Laufzeit "meine Build-Version" mit "Server-Version" vergleichen.
function getBuildVersion(): string {
  try {
    return String((JSON.parse(readFileSync('./public/version.json', 'utf-8')) as { v: number }).v);
  } catch {
    return String(Date.now());
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    // Zur Build-Zeit eingebettet — wird zu einem Literal-String im Bundle.
    __BUILD_VERSION__: JSON.stringify(getBuildVersion()),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      // injectManifest: eigene sw.ts wird verwendet (enthält Push-Handler).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
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
        globPatterns: ['**/*.{js,css,svg,png,webp,ico,woff2}'],
      },
      devOptions: {
        // Service Worker im Dev-Modus deaktiviert (sauberes HMR).
        enabled: false,
      },
    }),
  ],
});
