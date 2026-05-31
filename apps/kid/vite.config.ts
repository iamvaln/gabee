import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// Offline / PWA layer (product spec §8). Strategy:
//  • Vite + Workbox precaches the kid app shell (HTML/JS/CSS/fonts/icons) so it
//    boots offline once installed.
//  • Question bundles are NOT precached here — they're per-bundle, large, and
//    versioned by the server. They live in IndexedDB (Dexie, `lib/bundles.ts`)
//    and are fetched explicitly at pair-time + refreshed on launch.
//  • `registerType: 'autoUpdate'` + `injectRegister: 'auto'` means the SW takes
//    over automatically when a new build is deployed — no in-app prompt.
//  • Dev SW is OFF so HMR stays fast; the SW is only emitted by `vite build`.

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      devOptions: { enabled: false },
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      workbox: {
        // Precache every build-time asset Vite emits. Bundles travel out-of-band
        // through Dexie, not Workbox, so we don't list them here.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Mulish webfont (Google Fonts CSS + the woff2s) — cache-first so
        // subsequent launches don't hit the network.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'gabee-google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'gabee-google-fonts-webfont',
              expiration: { maxEntries: 16, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
        // Single-page app — let the SW fall back to index.html for navigations
        // so refresh works offline.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Gabee',
        short_name: 'Gabee',
        description: 'Gabee — a bilingual learning bee for kids.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#FFFBEC',
        // Mint surface from the design system (rounded, calm — design-spec §15.6).
        theme_color: '#BBEAF2',
        lang: 'fr',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5173, strictPort: true },
});
