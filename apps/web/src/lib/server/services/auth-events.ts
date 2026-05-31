import type { NextRequest } from 'next/server';
import type { Prisma } from '@gabee/db';
import { prisma } from '../db';
import { clientIpFrom } from '../rate-limit';

/**
 * Auth event log (parent spec §12.4). Append-only audit of any auth-touching
 * action: signup, login attempts (success + failure), password resets, email
 * confirmations, logouts. Every entry captures the client IP and User-Agent
 * so the admin /ops/audit dashboard can spot abuse patterns (credential
 * stuffing, geo anomalies, etc.).
 *
 * `parentId` is null when the actor isn't identifiable (e.g. failed login
 * with an email that doesn't match any account — we DO log it so we can
 * detect enumeration, but the FK can't bind to anything). The `detail` JSON
 * carries non-PII context like `{ email_kind: 'unknown' }`.
 *
 * Failure to write the log NEVER breaks the operation it audits — the catch
 * swallows errors and console.errors them so a DB hiccup doesn't 500
 * legitimate signups.
 */

type AuthEventKindIn =
  | 'signup'
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'forgot_password_requested'
  | 'password_reset_consumed'
  | 'email_confirmation_sent'
  | 'email_confirmed'
  | 'password_changed';

export interface AuthEventInput {
  req: NextRequest;
  kind: AuthEventKindIn;
  parentId?: string | null;
  detail?: Record<string, unknown>;
}

export async function logAuthEvent(input: AuthEventInput): Promise<void> {
  try {
    const ip = clientIpFrom(input.req);
    const userAgent = input.req.headers.get('user-agent')?.slice(0, 512) ?? null;
    await prisma.authEventLog.create({
      data: {
        kind: input.kind,
        parentId: input.parentId ?? null,
        ip: ip === 'unknown' ? null : ip,
        userAgent,
        detail: (input.detail ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[auth-events] failed to log', input.kind, e);
  }
}
