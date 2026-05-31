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
      includeAssets: [
        'favicon-16.png',
        'favicon-32.png',
        'favicon-48.png',
        'favicon-180.png',
        'favicon-512.png',
        'apple-touch-icon.png',
      ],
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
          // PWA installability requires at least one 192 and one 512 icon. We
          // use the 180 (apple-touch size) where 192 is expected — browsers
          // upscale it without visible artifacts at this size delta. The 512
          // covers both regular + maskable; the design is centered so the
          // browser's mask safe-zone won't crop the bee.
          { src: 'favicon-180.png', sizes: '192x192', type: 'image/png' },
          { src: 'favicon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Split heavy node_modules into their own chunks so the browser can cache
    // them independently of app code (the React + TanStack Query + Dexie +
    // Zustand layers rarely change; app code changes per deploy). Without this
    // the single bundle hits ~650kB and triggers Vite's 500kB warning.
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-i18next') || id.includes('/i18next')) return 'i18n';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('dexie')) return 'dexie';
          if (id.includes('zustand')) return 'zustand';
          if (id.includes('react-dom') || id.includes('/react/')) return 'react';
          return 'vendor';
        },
      },
    },
  },
  server: { port: 5173, strictPort: true },
});
