/**
 * Server-authoritative T&C version (provable-consent feature). The client
 * only ever says "I accept" — it never sends a version — so this constant is
 * the single source of truth for what "current" means. Bump it whenever the
 * text at `apps/web/src/app/[locale]/terms/page.tsx` (rendered from
 * `messages/{fr,en}.json` under `legal.terms`) materially changes.
 *
 * Bumping re-gates every parent: `hasCurrentTermsConsent` (see
 * `lib/server/services/consent.ts`) starts returning false for everyone until
 * they re-accept via `/parent/terms-update`.
 */
export const CURRENT_TERMS_VERSION = '2026-07-15';
