// Placeholder scaffold. The Vite + React offline PWA (Dexie, vite-plugin-pwa,
// Zustand, TanStack Query, Motion, Howler, i18next) is built in milestone 4. This
// file only verifies that @gabee/types resolves here so the kid app buffers events
// and consumes bundles against the same shared contracts.
import type { EventEnvelope, QuestionBundleResponse } from '@gabee/types';

export type KidContracts = {
  event: EventEnvelope;
  bundle: QuestionBundleResponse;
};
