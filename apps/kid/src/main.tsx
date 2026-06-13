import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import './i18n';
import { App } from './App';
import { consumePairToken, hasPairTokenInUrl } from './lib/pair';
import * as bundles from './lib/bundles';
import { refreshIfNewer, startBackgroundRefresh } from './lib/bundles';
import { bindBundlesModule } from './lib/api';

// Late-bind bundles into api so getBundle() can reach getCachedBundle /
// fetchAndCacheBundle without a dynamic import (which would defeat chunk
// splitting). Both modules are on the launch path so this runs early.
bindBundlesModule(bundles);

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // CRITICAL for offline play: TanStack Query's default `networkMode:
      // 'online'` PAUSES a query (never calls its queryFn) whenever
      // `navigator.onLine` is false. But every kid query reads cache-first
      // (bundles + profiles from Dexie), so pausing them strands the kid on a
      // perpetual loading skeleton offline even though the data is local.
      // 'offlineFirst' runs the queryFn once regardless of connectivity (the
      // Dexie read resolves), and only gates RETRIES on being online.
      networkMode: 'offlineFirst',
    },
  },
});

function mount(): void {
  createRoot(root!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

// Device-pairing entry (parent spec §10.4 / §12.3 P9): when the parent emails
// the pair link to the device, the kid PWA opens with `?pair=<jwt>`. We
// exchange it for a long-lived parent-bearer BEFORE rendering so the very
// first paint is ProfileSelect (not Login). On failure (expired/used) we
// still render — App falls back to Login as if no pair link existed.
if (hasPairTokenInUrl()) {
  void consumePairToken().finally(mount);
} else {
  mount();
}

// Background freshness — non-blocking. Compares cached bundles against the
// server manifest and refetches any that are stale (product §8). Runs once on
// launch, then every 30 min while the tab is alive. The vite-plugin-pwa
// service worker is auto-registered by `injectRegister: 'auto'` in
// vite.config.ts — no manual call needed here.
void refreshIfNewer();
startBackgroundRefresh();
