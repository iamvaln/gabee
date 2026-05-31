// Minimal in-memory rate limiter — sufficient for single-instance MVP. Each window
// is a fixed bucket per (key, scope): when the count crosses the limit before
// `resetAt`, requests are rejected with `RateLimitError`.
//
// TODO(scale): replace with Redis (e.g. ioredis + a sliding-window script) once we
// run more than one Next.js instance behind Traefik — an in-memory Map doesn't
// share state across processes, so each pod gets its own quota and the effective
// limit multiplies by the replica count.

import { type NextRequest } from 'next/server';
import { HttpError } from './http';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Identifier for the bucket scope (e.g. 'login'). */
  scope: string;
  /** Max requests per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

/** Best-effort client IP from common reverse-proxy headers (Traefik sets these). */
export function clientIpFrom(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    // First entry is the original client; the rest are intermediary proxies.
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  // Next.js exposes `req.ip` at runtime on some adapters, but it's not in the type;
  // fall back to a constant so a header-less request still gets bucketed (instead
  // of going unlimited under a falsy key).
  return 'unknown';
}

/**
 * Consume one token. Throws `RateLimitError` (HTTP 429) when the bucket is empty.
 * Sweeps expired buckets opportunistically (cheap; called from hot paths).
 */
export function rateLimit(key: string, opts: RateLimitOptions): void {
  const now = Date.now();
  const bucketKey = `${opts.scope}:${key}`;

  const existing = buckets.get(bucketKey);
  if (!existing || existing.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + opts.windowMs });
    maybeSweep(now);
    return;
  }

  if (existing.count >= opts.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    throw new HttpError(
      429,
      'rate_limited',
      `Too many requests; retry in ${retryAfterSec}s`,
      { retryAfterSec },
    );
  }

  existing.count += 1;
}

// Avoid unbounded growth of `buckets` under attack (lots of unique IPs). Sweep at
// most once per minute, dropping any bucket whose window has already closed.
let lastSweep = 0;
function maybeSweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}
