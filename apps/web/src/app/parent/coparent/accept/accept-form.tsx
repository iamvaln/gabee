'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Accept-or-decline button pair for the co-parent invite landing. The "decline"
// action calls DELETE /api/family/invites/:id — but the invitee doesn't own the
// invite (the inviter does), so Phase 1 we let them simply navigate away
// without persisting a decline status. A future iteration will surface a
// dedicated /api/family/decline endpoint.
export function AcceptCoparentForm({ token, kidCount }: { token: string; kidCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/family/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? 'Could not accept the invite.');
      }
      // Send the invitee straight to the parent home with a banner flag the
      // home reads (purely a query string — no server-side flash storage).
      router.push('/parent?coparent_joined=1');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function decline() {
    // No mutation in Phase 1 — the invite stays pending until it expires or
    // the inviter cancels it. Bounce home.
    router.push('/parent');
  }

  return (
    <>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button
          type="button"
          className="btn mint"
          onClick={accept}
          disabled={busy}
        >
          {busy ? 'Joining…' : kidCount > 0 ? `Accept & join (${kidCount} kid${kidCount > 1 ? 's' : ''})` : 'Accept'}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={decline}
          disabled={busy}
        >
          Decline
        </button>
      </div>
    </>
  );
}
