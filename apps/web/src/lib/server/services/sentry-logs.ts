// Pull recent issues from Sentry's REST API so the admin "System logs" page
// shows real exceptions instead of a placeholder. Read-only, server-side only.
//
// Needs a Sentry auth token with `project:read` + `event:read` scope, plus the
// org + project slugs. All optional — when unset, isSentryLogsConfigured() is
// false and the page renders its "not wired yet" empty state. This token is
// SEPARATE from the build-time SENTRY_AUTH_TOKEN (source-map upload): least
// privilege, and the logs token is read-only.
//
// SaaS orgs may live on a region host (e.g. https://us.sentry.io) — override
// via SENTRY_API_BASE if the default sentry.io returns 404/redirects.

export interface SentryIssue {
  id: string;
  title: string;
  culprit: string | null;
  level: string;
  /** Total events for this issue in the queried window. */
  count: number;
  /** Distinct users affected. */
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  status: string;
}

export interface SentryLogsResult {
  configured: boolean;
  ok: boolean;
  issues: SentryIssue[];
  /** Human-readable error when a fetch failed (bad token, wrong slug, region). */
  error?: string;
  /** Deep link to the project's issue stream for the "view all" affordance. */
  projectUrl?: string;
}

const API_BASE = process.env.SENTRY_API_BASE || 'https://sentry.io';

export function isSentryLogsConfigured(): boolean {
  return (
    !!process.env.SENTRY_API_TOKEN &&
    !!process.env.SENTRY_ORG &&
    !!process.env.SENTRY_PROJECT
  );
}

/**
 * Best-effort deep link to Sentry — as specific as the configured env allows,
 * down to the bare app when nothing is set. Always returns something clickable
 * so the page can offer "open in Sentry" even when it can't load logs inline.
 */
export function sentryLink(): string {
  const org = process.env.SENTRY_ORG;
  if (org) return `${API_BASE}/organizations/${encodeURIComponent(org)}/issues/?query=is:unresolved`;
  return API_BASE;
}

/**
 * Fetch the most recent unresolved issues for the configured project. Returns a
 * typed result the page can render without try/catch of its own. Cached 60s so
 * repeated admin page loads don't hammer Sentry's rate limit.
 */
export async function getSentryIssues(limit = 25): Promise<SentryLogsResult> {
  if (!isSentryLogsConfigured()) {
    return { configured: false, ok: false, issues: [], projectUrl: sentryLink() };
  }
  const org = process.env.SENTRY_ORG!;
  const project = process.env.SENTRY_PROJECT!;
  const token = process.env.SENTRY_API_TOKEN!;
  const projectUrl = sentryLink();

  const url =
    `${API_BASE}/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/` +
    `?query=${encodeURIComponent('is:unresolved')}&statsPeriod=14d&limit=${limit}`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      // Cache to protect Sentry's rate limit; the admin doesn't need real-time.
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        configured: true,
        ok: false,
        issues: [],
        error: `Sentry API ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`,
        projectUrl,
      };
    }
    const data = (await res.json()) as RawIssue[];
    const issues: SentryIssue[] = data.map((i) => ({
      id: i.id,
      title: i.title ?? i.metadata?.type ?? '(untitled)',
      culprit: i.culprit ?? null,
      level: i.level ?? 'error',
      count: Number(i.count ?? 0),
      userCount: Number(i.userCount ?? 0),
      firstSeen: i.firstSeen,
      lastSeen: i.lastSeen,
      permalink: i.permalink,
      status: i.status ?? 'unresolved',
    }));
    return { configured: true, ok: true, issues, projectUrl };
  } catch (e) {
    return {
      configured: true,
      ok: false,
      issues: [],
      error: e instanceof Error ? e.message : 'Network error reaching Sentry',
      projectUrl,
    };
  }
}

interface RawIssue {
  id: string;
  title?: string;
  culprit?: string;
  level?: string;
  count?: string | number;
  userCount?: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  status?: string;
  metadata?: { type?: string };
}
