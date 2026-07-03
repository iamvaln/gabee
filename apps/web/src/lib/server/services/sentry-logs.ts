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
  /** Which Sentry project (slug) this issue came from — web vs kid. */
  project: string;
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

/**
 * Projects the logs page queries. `SENTRY_LOG_PROJECTS` is a comma-separated
 * slug list (e.g. "gabee-web,gabee-kid") so both stacks show in one table;
 * falls back to the single `SENTRY_PROJECT` used by the build source-map config.
 */
function logProjects(): string[] {
  const multi = process.env.SENTRY_LOG_PROJECTS;
  if (multi) return multi.split(',').map((s) => s.trim()).filter(Boolean);
  const single = process.env.SENTRY_PROJECT;
  return single ? [single] : [];
}

export function isSentryLogsConfigured(): boolean {
  return (
    !!process.env.SENTRY_API_TOKEN &&
    !!process.env.SENTRY_ORG &&
    logProjects().length > 0
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
  const token = process.env.SENTRY_API_TOKEN!;
  const projects = logProjects();
  const projectUrl = sentryLink();
  // Split the row budget across projects so one noisy stack can't crowd out
  // the other; we re-sort + re-cap after merging anyway.
  const perProject = Math.max(5, Math.ceil(limit / projects.length));

  try {
    const perResults = await Promise.all(
      projects.map((project) => fetchProjectIssues(org, project, token, perProject)),
    );
    // Any project failing surfaces as an error (partial data would mislead an
    // ops read). First failure wins the message.
    const failed = perResults.find((r) => !r.ok);
    if (failed) {
      return { configured: true, ok: false, issues: [], error: failed.error, projectUrl };
    }
    const issues = perResults
      .flatMap((r) => r.issues)
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())
      .slice(0, limit);
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

async function fetchProjectIssues(
  org: string,
  project: string,
  token: string,
  limit: number,
): Promise<{ ok: boolean; issues: SentryIssue[]; error?: string }> {
  const url =
    `${API_BASE}/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/` +
    `?query=${encodeURIComponent('is:unresolved')}&statsPeriod=14d&limit=${limit}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 60 },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    return {
      ok: false,
      issues: [],
      error: `Sentry API ${res.status} for "${project}"${body ? ` — ${body.slice(0, 160)}` : ''}`,
    };
  }
  const data = (await res.json()) as RawIssue[];
  return {
    ok: true,
    issues: data.map((i) => ({
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
      project,
    })),
  };
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
