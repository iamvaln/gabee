import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { fileURLToPath, URL } from 'node:url';

// Source-map upload to Sentry is BUILD-time + opt-in: only when SENTRY_AUTH_TOKEN
// (an org token with the source-map scope) AND SENTRY_ORG are present in the
// build env. Absent (local dev, CI without the secret) → the plugin isn't added
// and no maps are emitted, so builds stay identical to before. In CI the kid
// build job passes SENTRY_PROJECT=gabee-kids.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryEnabled = !!sentryAuthToken && !!process.env.SENTRY_ORG;

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
  define: { __APP_VERSION__: JSON.stringify(process.env.VITE_APP_VERSION ?? 'dev') },
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
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,m4a,wav}'],
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
        name: 'Gabee, learning',
        short_name: 'Gabee',
        description: 'Gabee — a bilingual learning bee for kids.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'landscape',
        // When the PWA is already installed, prefer focusing/reusing the
        // installed window over spawning a new one. Combined with the browser's
        // link-capturing (which the user enables per-app: "open supported links
        // in Gabee"), an in-scope link opens the installed app instead of a tab.
        // Note: this is a nudge — browsers still gate actual link-capture on
        // that user setting; we can't force it from a cross-origin link.
        launch_handler: { client_mode: 'focus-existing' },
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
    // Sentry LAST so it can see every emitted asset. Only added when a build
    // token is present (see sentryEnabled above). Deletes the .map files after
    // upload so they're never served to kids / baked into the nginx image.
    ...(sentryEnabled
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT ?? 'gabee-kids',
            authToken: sentryAuthToken,
            // Explicit release from the release tag (SENTRY_RELEASE) — in the
            // Docker build there's no .git, so auto-detection would pass the
            // literal "undefined" and the upload API rejects it (CI failure on
            // v2.6.0/.1). Locally SENTRY_RELEASE is unset → undefined → the
            // plugin auto-detects from git, which works.
            release: process.env.SENTRY_RELEASE
              ? { name: process.env.SENTRY_RELEASE }
              : undefined,
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
            telemetry: false,
          }),
        ]
      : []),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Emit source maps only when we're going to upload + delete them (CI with a
    // token). Off otherwise so local/dev builds stay lean and nothing leaks.
    sourcemap: sentryEnabled,
    // One `vendor` chunk for ALL node_modules (cacheable independently of app
    // code), app code in the entry. Splitting node_modules across MULTIPLE
    // chunks (react / query / dexie / zustand / i18n) reordered cross-chunk
    // module init and surfaced a "Cannot access '…' before initialization"
    // crash at boot → blank screen in prod. A single vendor chunk keeps the
    // caching win without any inter-chunk init-order hazard.
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
    // The combined vendor chunk is ~500kB; that's fine (precached once, cached
    // across app deploys). Silence Vite's size warning at this known baseline.
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173, strictPort: true },
});
