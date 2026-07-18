import { useEffect, useState } from 'react';

/**
 * PWA installability (product §8 — kid app is meant to be installed on the
 * device, not run in a tab). Strategy:
 *  - Chrome/Edge/Android: capture the `beforeinstallprompt` event so we can
 *    re-fire it from a deliberate UI moment (a button in Settings).
 *  - iOS Safari: no API. Detect Safari + iOS and show instructions instead
 *    (Add to Home Screen via the Share menu).
 *  - Already-installed (display-mode: standalone): hide the entry entirely.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;

// Deep-link install intent: the landing / parent-app CTAs link here with
// `?install=1` (they can't fire the PWA prompt themselves — wrong origin), so
// the kid app force-opens the install banner on arrival. Captured at module
// eval — BEFORE the router's URL-sync effect strips the query string — then the
// param is removed so a refresh doesn't re-open a dismissed banner. Mirrors the
// `?pair=` capture pattern in lib/pair.ts.
let installIntent = false;

// Capture early — the event fires before the React tree mounts on some
// browsers. The state then flows through `useInstall` once that mounts.
if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  if (params.has('install')) {
    installIntent = true;
    params.delete('install');
    const qs = params.toString();
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash,
    );
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    // Let any mounted hooks know.
    window.dispatchEvent(new CustomEvent('gabee:install-available'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('gabee:install-done'));
  });
}

// Read-once: was the app opened via an `?install=1` deep link? Consuming it
// resets the flag so only the first banner mount treats it as a forced open.
export function consumeInstallIntent(): boolean {
  const v = installIntent;
  installIntent = false;
  return v;
}

export type InstallState =
  | { kind: 'installed' }
  | { kind: 'available'; prompt: () => Promise<'accepted' | 'dismissed'> }
  | { kind: 'ios' }
  | { kind: 'unavailable' };

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari uses the legacy navigator.standalone.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // Chrome/Firefox on iOS contain "CriOS"/"FxiOS"; only Safari shows the
  // Add-to-Home-Screen flow we want to instruct on.
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return iOS && safari;
}

export function useInstall(): InstallState {
  const [, force] = useState(0);

  useEffect(() => {
    function rerender() { force((n) => n + 1); }
    window.addEventListener('gabee:install-available', rerender);
    window.addEventListener('gabee:install-done', rerender);
    return () => {
      window.removeEventListener('gabee:install-available', rerender);
      window.removeEventListener('gabee:install-done', rerender);
    };
  }, []);

  if (isStandalone()) return { kind: 'installed' };
  if (deferredPrompt) {
    return {
      kind: 'available',
      prompt: async () => {
        const e = deferredPrompt;
        if (!e) return 'dismissed';
        await e.prompt();
        const { outcome } = await e.userChoice;
        deferredPrompt = null;
        force((n) => n + 1);
        return outcome;
      },
    };
  }
  if (isIosSafari()) return { kind: 'ios' };
  return { kind: 'unavailable' };
}
