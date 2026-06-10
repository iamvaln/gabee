import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/health — liveness probe. Returns 200 with a small JSON payload
// when the Next.js process is up and serving. Used by:
//   - The Docker healthcheck on the `web` service (compose.yml)
//   - The cron-digest sidecar (`depends_on: service_healthy`)
//   - Any uptime monitor we point at it later
//
// Deliberately does NOT touch the database — we want this to stay green
// during a transient DB blip so Compose doesn't restart-loop the web
// container while waiting for Postgres. If you need a deeper check, add
// /api/health/ready (DB + bundles available) on top of this.
export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: 'gabee-web',
      version: process.env.IMAGE_TAG ?? 'dev',
      time: new Date().toISOString(),
    },
    {
      headers: {
        // Always fetched fresh; never want a CDN/edge cache shadowing a
        // failing process behind a stale 200.
        'cache-control': 'no-store, max-age=0',
      },
    },
  );
}
