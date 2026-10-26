/**
 * Copy `text` to the clipboard. Call it straight from the click handler: iOS
 * Safari only allows clipboard writes inside the user gesture (and on HTTPS).
 * Falls back to a hidden textarea + `execCommand('copy')` where the async
 * Clipboard API is missing or refused. Resolves false when both fail.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused or no focus: try the legacy path below.
    }
  }
  return legacyCopy(text);
}

/**
 * Copy `text` synchronously (hidden textarea + `execCommand('copy')`): done
 * before the handler returns, for a tap that also opens a new tab (the async
 * Clipboard API may only run once this tab has lost focus). False when the
 * browser refuses; then fall back to `copyText`.
 */
export function copyTextNow(text: string): boolean {
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  // Off-screen but selectable; 16px avoids the iOS zoom on focus.
  Object.assign(ta.style, { position: 'fixed', top: '0', left: '-9999px', opacity: '0', fontSize: '16px' });
  const previous = document.activeElement as HTMLElement | null;
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  ta.setSelectionRange(0, text.length); // iOS ignores select()
  let ok: boolean;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false; // reported to the caller as a failed copy
  }
  document.body.removeChild(ta);
  previous?.focus();
  return ok;
}
