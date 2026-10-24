// Minimal in-memory rate limiter — sufficient for single-instance MVP. Each window
// is a fixed bucket per (key, scope): when the count crosses the limit before
// `resetAt`, requests are rejected with `RateLimitError`.
//
// TODO(scale): replace with Redis (e.g. ioredis + a sliding-window script) once we
// run more than one Next.js instance behind Traefik — an in-memory Map doesn't
// share state across processes, so each pod gets its own quota and the effective
// limit multiplies by the replica count.

import { isIP } from 'node:net';
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

/**
 * Best-effort client IP from common reverse-proxy headers (Traefik sets these).
 *
 * Takes the LAST `X-Forwarded-For` entry, not the first. The first entry is the
 * textbook "original client", but that only holds when a trusted proxy REPLACES
 * the header. Traefik APPENDS: a request arriving with `X-Forwarded-For: 1.2.3.4`
 * is forwarded as `1.2.3.4, <real peer>`. Reading the first entry therefore hands
 * the bucket key to the caller — anyone could rotate `X-Forwarded-For` and reset
 * every limiter (login, signup, password-reset, contact) at will, i.e. no rate
 * limiting at all against a deliberate attacker.
 *
 * The last entry is the peer address Traefik actually observed, so it cannot be
 * spoofed by the client. This assumes exactly one trusted hop (Traefik) in front
 * of the app, which holds here: Traefik is internet-facing (Cloudflare is
 * grey-cloud/DNS-only) and the container is not otherwise reachable. If another
 * proxy is ever put in front, this needs a trusted-hop count instead.
 */
export function clientIpFrom(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const parts = fwd.split(',').map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  // Next.js exposes `req.ip` at runtime on some adapters, but it's not in the type;
  // fall back to a constant so a header-less request still gets bucketed (instead
  // of going unlimited under a falsy key).
  return 'unknown';
}

/**
 * Client IP for the anonymous visit beacon (`/api/visits`) ONLY.
 *
 * gabee.app is now proxied by Cloudflare (orange cloud), so the last
 * `X-Forwarded-For` hop Traefik sees is a Cloudflare edge: every visitor behind
 * the same edge would share one limiter bucket. Cloudflare sends the visitor's
 * address in `CF-Connecting-IP`; prefer it when present, else `clientIpFrom`.
 *
 * Deliberately not used elsewhere: a request that reaches the origin without
 * Cloudflare can set this header itself, so only a well-formed IP is accepted
 * and the visits route also applies a looser limiter on `clientIpFrom` (the
 * caller's real address), which a forged header cannot escape. The login and
 * security limiters (and the security-log IP) keep `clientIpFrom`.
 */
export function visitorIpFrom(req: NextRequest): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  return cf && isIP(cf) ? cf : clientIpFrom(req);
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
