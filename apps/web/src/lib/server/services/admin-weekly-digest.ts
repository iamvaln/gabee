/**
 * Weekly admin digest (ops report). One email a week to the operator with two
 * halves:
 *   A. Platform performance — last 7 days, with week-over-week deltas on the
 *      volume metrics, plus the dashboard quality indices as a snapshot.
 *   B. Needs attention — actionable queues (content to review, feedback to
 *      triage, GDPR/inbox, AI spend), each linking to the relevant admin page.
 *
 * Scheduling: the cron-digest sidecar pokes `/api/cron/admin-digest` DAILY
 * (same loop as the classification digest). This service self-gates so it only
 * actually sends once a week — on the target weekday (ADMIN_DIGEST_DOW, default
 * Sunday), or any later day that same week if the target day was missed
 * (outage / send failure). The `AdminDigestState` singleton marker keeps it
 * idempotent across restarts + startup pokes (never two sends in one week).
 */
import { prisma } from '../db';
import { sendEmail } from '../email';
import { getDashboard } from './admin-observability';
import { getContentMatrix } from './admin-content';
import { ADMIN_DIGEST_TO, ADMIN_APP_URL, ADMIN_DIGEST_DOW } from '../env';

const DAY_MS = 86_400_000;

export interface AdminDigestSummary {
  sent: boolean;
  skipped?: 'already_sent_this_week' | 'not_due_day' | 'send_failed';
  to?: string;
  error?: string;
}

/** Distinct count of a field over an event window (active children / sessions). */
async function distinctEvents(
  field: 'profileId' | 'sessionId',
  gte: Date,
  lt: Date,
): Promise<number> {
  const rows = await prisma.event.findMany({
    where: { serverTs: { gte, lt }, [field]: { not: null } },
    select: { [field]: true },
    distinct: [field],
  });
  return rows.length;
}

interface VolumeWindow {
  registrations: number;
  active_children: number;
  sessions: number;
  ai_cost_usd: number;
}

async function volumeFor(gte: Date, lt: Date): Promise<VolumeWindow> {
  const [registrations, active_children, sessions, aiAgg] = await Promise.all([
    prisma.parentAccount.count({ where: { createdAt: { gte, lt } } }),
    distinctEvents('profileId', gte, lt),
    distinctEvents('sessionId', gte, lt),
    prisma.aiUsage.aggregate({ _sum: { costUsd: true }, where: { createdAt: { gte, lt } } }),
  ]);
  return { registrations, active_children, sessions, ai_cost_usd: aiAgg._sum.costUsd ?? 0 };
}

interface Attention {
  pools_under_filled: number;
  plans_to_accept: number;
  candidates_to_review: number;
  low_rated_live: number;
  feedback_new: number;
  gdpr_open: number;
  inbox_new: number;
}

async function gatherAttention(): Promise<Attention> {
  const [matrix, candidates_to_review, low_rated_live, feedback_new, gdpr_open, inbox_new] =
    await Promise.all([
      getContentMatrix(),
      prisma.question.count({ where: { status: 'candidate' } }),
      // Confirmed (live) questions whose average rating dipped below 3 — quality
      // regressions worth a second look. avgRating null (unrated) is excluded by
      // the `< 3` comparison.
      prisma.question.count({ where: { status: 'confirmed', avgRating: { lt: 3 } } }),
      prisma.feedback.count({ where: { status: 'new' } }),
      prisma.gdprRequest.count({ where: { status: { in: ['new', 'verifying', 'in_progress'] } } }),
      prisma.inboxMessage.count({ where: { status: 'new' } }),
    ]);

  let pools_under_filled = 0;
  let plans_to_accept = 0;
  for (const row of matrix.rows) {
    for (const cell of row.cells) {
      if (cell.pool_confirmed < cell.pool_target) pools_under_filled += 1;
      if (cell.plan_status === 'ai_draft') plans_to_accept += 1;
    }
  }
  return {
    pools_under_filled,
    plans_to_accept,
    candidates_to_review,
    low_rated_live,
    feedback_new,
    gdpr_open,
    inbox_new,
  };
}

// ─── Formatting helpers (email-safe inline HTML) ─────────────────────────────

const pct = (x: number) => `${Math.round(x * 100)}%`;
const eur = (x: number) => `$${x.toFixed(2)}`;

/** "12 (▲3)" / "8 (▼2)" / "5 (=)" — delta vs the prior week. */
function withDelta(cur: number, prev: number, fmt: (n: number) => string = String): string {
  const d = cur - prev;
  const arrow = d > 0 ? `▲${fmt(Math.abs(d))}` : d < 0 ? `▼${fmt(Math.abs(d))}` : '=';
  return `${fmt(cur)} <span style="color:${d > 0 ? '#16a34a' : d < 0 ? '#dc2626' : '#94a3b8'};font-size:12px">(${arrow})</span>`;
}

interface Rendered {
  subject: string;
  text: string;
  html: string;
}

function render(
  weekLabel: string,
  cur: VolumeWindow,
  prev: VolumeWindow,
  dash: Awaited<ReturnType<typeof getDashboard>>,
  att: Attention,
): Rendered {
  const a = `${ADMIN_APP_URL}`;
  const subject = `📊 Gabee — bilan hebdo (sem. du ${weekLabel})`;

  // Plain-text fallback (also what noop logs / non-HTML clients show).
  const totalTodo =
    att.candidates_to_review +
    att.plans_to_accept +
    att.pools_under_filled +
    att.feedback_new +
    att.gdpr_open +
    att.inbox_new;
  const text = [
    `Gabee — bilan hebdomadaire (semaine du ${weekLabel})`,
    ``,
    `PERFORMANCE (7 derniers jours, delta vs semaine précédente)`,
    `- Nouvelles inscriptions : ${cur.registrations} (prev ${prev.registrations})`,
    `- Enfants actifs : ${cur.active_children} (prev ${prev.active_children})`,
    `- Sessions : ${cur.sessions} (prev ${prev.sessions})`,
    `- Coût IA : ${eur(cur.ai_cost_usd)} (prev ${eur(prev.ai_cost_usd)})`,
    `- Jours actifs médians/enfant : ${dash.north_star.median_active_days}`,
    `- Adherence : ${pct(dash.adherence.index)} · Engagement (fin naturelle) : ${pct(
      dash.engagement.natural_end_rate,
    )} · Maîtrise : ${pct(dash.learning.mastery_rate)}`,
    ``,
    `À TRAITER (${totalTodo} éléments)`,
    `- Candidats à revoir : ${att.candidates_to_review}`,
    `- Plans à valider : ${att.plans_to_accept}`,
    `- Pools sous-remplis (cellules) : ${att.pools_under_filled}`,
    `- Contenu live mal noté : ${att.low_rated_live}`,
    `- Feedbacks non triés : ${att.feedback_new}`,
    `- Demandes RGPD ouvertes : ${att.gdpr_open}`,
    `- Messages inbox non lus : ${att.inbox_new}`,
    ``,
    `Dashboard : ${a}/admin`,
  ].join('\n');

  const metric = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#475569;font-size:14px">${label}</td>` +
    `<td style="padding:6px 0;text-align:right;font-weight:700;font-size:15px;color:#0f172a">${value}</td></tr>`;

  const todo = (label: string, n: number, href: string) =>
    `<tr><td style="padding:7px 0;font-size:14px">` +
    `<a href="${href}" style="color:#0f172a;text-decoration:none">${label}</a></td>` +
    `<td style="padding:7px 0;text-align:right">` +
    `<span style="display:inline-block;min-width:26px;text-align:center;padding:2px 8px;border-radius:10px;font-weight:700;font-size:13px;` +
    `background:${n > 0 ? '#FEF3C7' : '#DCFCE7'};color:${n > 0 ? '#92400e' : '#166534'}">${n}</span></td></tr>`;

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
  <h2 style="margin:0 0 2px">📊 Bilan hebdomadaire Gabee</h2>
  <div style="color:#64748b;font-size:13px;margin-bottom:18px">Semaine du ${weekLabel}</div>

  <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;margin-bottom:16px">
    <div style="font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#475569;margin-bottom:6px">Performance · 7 j</div>
    <table style="width:100%;border-collapse:collapse">
      ${metric('Nouvelles inscriptions', withDelta(cur.registrations, prev.registrations))}
      ${metric('Enfants actifs', withDelta(cur.active_children, prev.active_children))}
      ${metric('Sessions', withDelta(cur.sessions, prev.sessions))}
      ${metric('Coût IA', withDelta(cur.ai_cost_usd, prev.ai_cost_usd, eur))}
      ${metric('Jours actifs médians / enfant', String(dash.north_star.median_active_days))}
      ${metric('Adherence index', pct(dash.adherence.index))}
      ${metric('Fin de session naturelle', pct(dash.engagement.natural_end_rate))}
      ${metric('Taux de maîtrise', pct(dash.learning.mastery_rate))}
    </table>
  </div>

  <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:14px 16px;margin-bottom:16px">
    <div style="font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#92400e;margin-bottom:6px">À traiter</div>
    <table style="width:100%;border-collapse:collapse">
      ${todo('Candidats à revoir', att.candidates_to_review, `${a}/admin/content/pool`)}
      ${todo('Plans à valider', att.plans_to_accept, `${a}/admin/content`)}
      ${todo('Pools sous-remplis (cellules)', att.pools_under_filled, `${a}/admin/content`)}
      ${todo('Contenu live mal noté', att.low_rated_live, `${a}/admin/content/pool`)}
      ${todo('Feedbacks non triés', att.feedback_new, `${a}/admin/feedback`)}
      ${todo('Demandes RGPD ouvertes', att.gdpr_open, `${a}/admin/gdpr`)}
      ${todo('Messages inbox non lus', att.inbox_new, `${a}/admin/inbox`)}
    </table>
  </div>

  <a href="${a}/admin" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:10px;font-size:14px">Ouvrir le dashboard →</a>
  <div style="color:#94a3b8;font-size:11px;margin-top:18px">Digest automatique · Gabee admin</div>
</div>`.trim();

  return { subject, text, html };
}

/**
 * Run the weekly admin digest. Daily-poked, self-gated to one send/week.
 * `opts.force` bypasses the day + already-sent gates (for ad-hoc ops runs).
 */
export async function runAdminWeeklyDigest(
  now: Date = new Date(),
  opts: { force?: boolean } = {},
): Promise<AdminDigestSummary> {
  const state = await prisma.adminDigestState.findUnique({ where: { id: 'default' } });
  const sinceLast = state?.lastWeeklyAt ? now.getTime() - state.lastWeeklyAt.getTime() : Infinity;

  if (!opts.force) {
    // Already mailed this week → no-op (covers daily re-pokes + restarts).
    if (sinceLast < 6 * DAY_MS) return { sent: false, skipped: 'already_sent_this_week' };
    // Send on the target weekday, or any later day that week if it was missed
    // (an outage on Sunday shouldn't cost the whole week's report).
    const dueByDay = now.getUTCDay() === ADMIN_DIGEST_DOW;
    const overdue = sinceLast >= 8 * DAY_MS; // > a week since last → catch up
    if (!dueByDay && !overdue) return { sent: false, skipped: 'not_due_day' };
  }

  const nowMs = now.getTime();
  const since7 = new Date(nowMs - 7 * DAY_MS);
  const since14 = new Date(nowMs - 14 * DAY_MS);

  const [cur, prev, dash, att] = await Promise.all([
    volumeFor(since7, now),
    volumeFor(since14, since7),
    getDashboard(),
    gatherAttention(),
  ]);

  const weekLabel = since7.toISOString().slice(0, 10);
  const { subject, text, html } = render(weekLabel, cur, prev, dash, att);

  const recipients = ADMIN_DIGEST_TO.split(',').map((s) => s.trim()).filter(Boolean);
  const result = await sendEmail({ to: recipients, subject, text, html });
  if (!result.ok) {
    // Surface the failure server-side. Without this the only trace is the
    // cron sidecar's best-effort stdout echo, so a genuinely failed weekly
    // digest would be invisible (no web log, no Sentry). Matches the parent
    // classification digest's per-send logging in services/classifications.ts.
    console.error(
      `[admin-digest] send failed to ${recipients.join(',')}: ${result.error ?? 'unknown_error'}`,
    );
    return { sent: false, skipped: 'send_failed', error: result.error };
  }

  await prisma.adminDigestState.upsert({
    where: { id: 'default' },
    create: { id: 'default', lastWeeklyAt: now },
    update: { lastWeeklyAt: now },
  });
  return { sent: true, to: recipients.join(',') };
}
