// Component test for the shared session error/retry/report + loader flow
// (Task 1-3), driven through the REAL NumbersSession — the simplest of the 9
// session screens (`!session || !q` guard, no extra sub-mode state machine).
// Patches `api.getBundle` to force the error path, and drives the real Sentry
// client (via a `beforeSend` counter, see below) to assert the report button
// fires exactly once. No backend, no network.
import '../test/setup-dom'; // MUST be first: registers jsdom + fake-indexeddb.

import { createElement } from 'react';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { api } from '../lib/api';
import { useStore } from '../store';
import { Sentry } from '../lib/sentry';
import { NumbersSession } from './NumbersSession';

function seedStore() {
  useStore.setState({
    lang: 'fr',
    profile: { id: 'kid-1', name: 'Test', birth_date: null } as never,
    play: { id: 'p1' } as never,
  });
}

function renderSession() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(NumbersSession, {
        level: 1,
        lesson: 1,
        isRevision: false,
        trigger: 'new',
        onDone: () => {},
        onHome: () => {},
        onBack: () => {},
      } as never),
    ),
  );
}

beforeEach(() => {
  localStorage.clear();
  seedStore();
});
afterEach(() => cleanup());

describe('NumbersSession load states', () => {
  it('shows the error state (not an endless loader) when the bundle fails, and retry refetches', async () => {
    let calls = 0;
    api.getBundle = async () => {
      calls++;
      throw new Error('boom');
    };
    renderSession();

    // Error copy appears (FR), with Réessayer + Signaler — never a dead skeleton.
    await screen.findByText(/Oups/i);
    assert.ok(screen.getByRole('button', { name: /Réessayer/i }));
    assert.ok(screen.getByRole('button', { name: /Signaler le problème/i }));

    const before = calls;
    fireEvent.click(screen.getByRole('button', { name: /Réessayer/i }));
    await waitFor(() => assert.ok(calls > before)); // refetch fired
  });

  it('report fires Sentry once and confirms', async () => {
    api.getBundle = async () => {
      throw new Error('boom');
    };

    // `Sentry` is re-exported from `../lib/sentry` as a raw `import * as Sentry`
    // namespace object — a real ES module namespace, which is non-writable *and*
    // non-configurable by spec (assigning `Sentry.captureException = …` throws
    // "Cannot assign to read only property"). So instead of monkey-patching the
    // function reference, we drive the real integration: init a client with a
    // fake DSN and a `beforeSend` hook that counts events and drops them (`null`)
    // before anything would try to hit the network.
    let captured = 0;
    Sentry.init({
      dsn: 'https://public@o0.ingest.sentry.io/0',
      // jsdom isn't a full browser — the default integrations (browser session
      // tracking, web-vitals, etc.) reach for globals jsdom doesn't provide.
      // We only need the core capture pipeline for this test.
      defaultIntegrations: false,
      integrations: [],
      beforeSend() {
        captured++;
        return null;
      },
    });

    renderSession();
    const report = await screen.findByRole('button', { name: /Signaler le problème/i });
    fireEvent.click(report);
    await screen.findByText(/Merci, on regarde/i);
    await waitFor(() => assert.equal(captured, 1));

    fireEvent.click(report); // idempotent — button is disabled once reported
    assert.equal(captured, 1);
  });
});
