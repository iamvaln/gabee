// Test-only DOM environment for component integration tests run under
// `node --import tsx --test`. Import this FIRST (before React / the component)
// so jsdom globals and a working IndexedDB exist before anything touches them.
import 'global-jsdom/register';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import '../i18n'; // initialise the i18next instance (normally done by main.tsx)

// jsdom does not implement IndexedDB, and Dexie reads it off both `globalThis`
// and the jsdom `window`. Install the fake on both so `lib/db` (Dexie) works and
// the session's `enqueueEvent(...)` writes don't reject unhandled.
const g = globalThis as unknown as Record<string, unknown>;
g.indexedDB = indexedDB;
g.IDBKeyRange = IDBKeyRange;
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).indexedDB = indexedDB;
  (window as unknown as Record<string, unknown>).IDBKeyRange = IDBKeyRange;
}

// Tell React we're in an act()-aware environment so Testing Library can flush
// state updates without "not wrapped in act(...)" warnings.
g.IS_REACT_ACT_ENVIRONMENT = true;
