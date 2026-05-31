import type {
  MessagesFreqHistogram,
  MessagesHealthRange,
  MessagesHealthResponse,
  MessagesTtrHistogram,
} from '@gabee/types';
import { prisma } from '../db';

// ─── PRIVACY BOUNDARY (changes-v1 §1.5) ──────────────────────────────────────
//
// This file aggregates the Messages feature-health dashboard. It NEVER selects the
// `text` column of `kid_messages` — every `findMany`/`groupBy` below uses an explicit
// `select`/`by` shape that omits content. Event payloads we read are the four
// messaging events (`parent_message_sent`, `parent_message_delivered_to_kid`,
// `parent_message_read`, `parent_message_deleted_by_sender`) — none of which carry
// text by contract (events.ts). Reviewers: if you add a query, keep the `select`
// explicit; never use `prisma.kidMessage.findMany({ where })` without one.

const DAY_MS = 86_400_000;

/** Range in ms, plus a label for the previous equal-length window. `all` has no bound. */
function rangeBounds(range: MessagesHealthRange): {
  from: Date | null;
  prevFrom: Date | null;
  prevTo: Date | null;
} {
  const now = Date.now();
  const days =
    range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : null;
  if (days === null) return { from: null, prevFrom: null, prevTo: null };
  const fromMs = now - days * DAY_MS;
  return {
    from: new Date(fromMs),
    prevFrom: new Date(fromMs - days * DAY_MS),
    prevTo: new Date(fromMs),
  };
}

/** Build the messages-health payload. Returns safe zeros + empty arrays on no data. */
export async function getMessagesHealth(
  range: MessagesHealthRange,
): Promise<MessagesHealthResponse> {
  const { from, prevFrom, prevTo } = rangeBounds(range);

  // ─── Volume from kid_messages (NO `text` selected) ─────────────────────────
  // Explicit select shape — never includes `text`. Status + timestamps only.
  const rowsInWindow = await prisma.kidMessage.findMany({
    where: from ? { createdAt: { gte: from } } : {},
    select: {
      id: true,
      fromParentId: true,
      toChildId: true,
      status: true,
      createdAt: true,
      readAt: true,
      deletedAt: true,
    },
  });

  const sent = rowsInWindow.length;
  const read = rowsInWindow.filter((r) => r.status === 'read').length;
  const deleted = rowsInWindow.filter(
    (r) => r.status === 'deleted_by_sender',
  ).length;

  // ─── Delivery counts from events ───────────────────────────────────────────
  // `parent_message_delivered_to_kid` fires the first time the bandeau appears on
  // the kid device. If the kid app is offline at flush time it'll arrive late, so
  // we coalesce by message_id (distinct).
  const deliveryEvents = await prisma.event.findMany({
    where: {
      name: 'parent_message_delivered_to_kid',
      ...(from ? { serverTs: { gte: from } } : {}),
    },
    select: { payload: true, clientTs: true },
  });

  const deliveredMessageIds = new Set<string>();
  const firstDeliveryByMessage = new Map<string, Date>();
  for (const e of deliveryEvents) {
    const p = e.payload as { message_id?: string } | null;
    const mid = p?.message_id;
    if (!mid) continue;
    deliveredMessageIds.add(mid);
    const prev = firstDeliveryByMessage.get(mid);
    if (!prev || e.clientTs < prev) firstDeliveryByMessage.set(mid, e.clientTs);
  }
  const delivered = deliveredMessageIds.size;

  // ─── Read rate (current vs previous window) ────────────────────────────────
  const read_rate = delivered > 0 ? read / delivered : 0;

  let read_rate_prev: number | null = null;
  if (range !== 'all' && prevFrom && prevTo) {
    const [prevRows, prevDelivery] = await Promise.all([
      prisma.kidMessage.findMany({
        where: { createdAt: { gte: prevFrom, lt: prevTo } },
        select: { status: true },
      }),
      prisma.event.findMany({
        where: {
          name: 'parent_message_delivered_to_kid',
          serverTs: { gte: prevFrom, lt: prevTo },
        },
        select: { payload: true },
      }),
    ]);
    const prevDeliveredSet = new Set<string>();
    for (const e of prevDelivery) {
      const p = e.payload as { message_id?: string } | null;
      if (p?.message_id) prevDeliveredSet.add(p.message_id);
    }
    const prevReadCount = prevRows.filter((r) => r.status === 'read').length;
    const prevDelivered = prevDeliveredSet.size;
    read_rate_prev = prevDelivered > 0 ? prevReadCount / prevDelivered : 0;
  }

  // ─── Time-to-read distribution (delivered → read) ──────────────────────────
  // Prefer event-derived TTR: delivered.clientTs → read.clientTs for the same
  // message_id. Fall back to row's createdAt → readAt when an event is missing
  // (e.g. dev DB where the delivery event hadn't arrived yet).
  const readEvents = await prisma.event.findMany({
    where: {
      name: 'parent_message_read',
      ...(from ? { serverTs: { gte: from } } : {}),
    },
    select: { payload: true, clientTs: true },
  });
  const readByMessage = new Map<string, Date>();
  for (const e of readEvents) {
    const p = e.payload as { message_id?: string } | null;
    const mid = p?.message_id;
    if (!mid) continue;
    const prev = readByMessage.get(mid);
    if (!prev || e.clientTs > prev) readByMessage.set(mid, e.clientTs);
  }

  const ttrMinutes: number[] = [];
  for (const row of rowsInWindow) {
    if (row.status !== 'read') continue;
    const deliveredAt = firstDeliveryByMessage.get(row.id) ?? row.createdAt;
    const readAt = readByMessage.get(row.id) ?? row.readAt;
    if (!readAt) continue;
    const ms = readAt.getTime() - deliveredAt.getTime();
    if (ms < 0) continue;
    ttrMinutes.push(ms / 60_000);
  }

  const ttr_histogram = bucketTtrMinutes(ttrMinutes);
  const median_ttr_minutes = median(ttrMinutes);

  // ─── Active senders / recipients (distinct) ────────────────────────────────
  const active_senders = new Set(rowsInWindow.map((r) => r.fromParentId)).size;
  const active_recipients = new Set(rowsInWindow.map((r) => r.toChildId)).size;

  // ─── Send-frequency histogram (per active sender) ──────────────────────────
  const perSender = new Map<string, number>();
  for (const r of rowsInWindow) {
    perSender.set(r.fromParentId, (perSender.get(r.fromParentId) ?? 0) + 1);
  }
  const send_frequency_histogram: MessagesFreqHistogram = [0, 0, 0, 0];
  for (const count of perSender.values()) {
    if (count === 1) send_frequency_histogram[0]++;
    else if (count <= 5) send_frequency_histogram[1]++;
    else if (count <= 10) send_frequency_histogram[2]++;
    else send_frequency_histogram[3]++;
  }

  // ─── Adoption curve (last 8 weeks, % of all parents who have ever sent) ────
  const totalParents = await prisma.parentAccount.count();
  const eightWeeksAgo = new Date(Date.now() - 8 * 7 * DAY_MS);
  // Earliest send per parent, for every parent who has ever sent.
  // `groupBy` here selects only fromParentId + min(createdAt). No content.
  const everSenders = await prisma.kidMessage.groupBy({
    by: ['fromParentId'],
    _min: { createdAt: true },
  });
  const adoption_curve_weekly: number[] = [];
  if (totalParents > 0) {
    for (let w = 7; w >= 0; w--) {
      const cutoff = new Date(Date.now() - w * 7 * DAY_MS);
      const numerator = everSenders.filter(
        (s) => s._min.createdAt != null && s._min.createdAt <= cutoff,
      ).length;
      adoption_curve_weekly.push((numerator / totalParents) * 100);
    }
  } else {
    for (let i = 0; i < 8; i++) adoption_curve_weekly.push(0);
  }
  // (eightWeeksAgo retained for clarity; the cutoff loop above uses it implicitly.)
  void eightWeeksAgo;

  // ─── 4-week sender-retention cohort (N+1..N+4) ─────────────────────────────
  // Cohort = parents whose FIRST send landed in the cohort week (5 weeks ago, so
  // that all four follow-up weeks are observable). Retention[i] = % of that cohort
  // who sent at least once in week N+i+1.
  const sender_retention = await computeSenderRetention();

  // ─── Classification → message coupling ─────────────────────────────────────
  // Of parents who classified AT LEAST ONE session on a given day, what share
  // also sent at least one message that same day? Aggregated over the window.
  const classification_to_message_coupling = await computeClassificationCoupling(
    from,
    rowsInWindow,
  );

  return {
    range,
    volume: { sent, delivered, read, deleted },
    read_rate,
    read_rate_prev,
    median_ttr_minutes,
    ttr_histogram,
    active_senders,
    active_recipients,
    send_frequency_histogram,
    funnel: { sent, delivered, read },
    adoption_curve_weekly,
    sender_retention,
    classification_to_message_coupling,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bucketTtrMinutes(values: number[]): MessagesTtrHistogram {
  const buckets: MessagesTtrHistogram = [0, 0, 0, 0, 0];
  for (const m of values) {
    if (m < 5) buckets[0]++;
    else if (m < 30) buckets[1]++;
    else if (m < 120) buckets[2]++; // 2h
    else if (m < 24 * 60) buckets[3]++;
    else buckets[4]++;
  }
  return buckets;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** N+1..N+4 retention for senders whose first send fell in the cohort week. */
async function computeSenderRetention(): Promise<
  [number, number, number, number]
> {
  // Cohort week: 5 weeks ago → 4 weeks ago. Anchored to "now" to keep the math simple
  // in dev where data is sparse.
  const now = Date.now();
  const week = 7 * DAY_MS;
  const cohortStart = new Date(now - 5 * week);
  const cohortEnd = new Date(now - 4 * week);

  // Earliest send per parent — no text selected.
  const everSenders = await prisma.kidMessage.groupBy({
    by: ['fromParentId'],
    _min: { createdAt: true },
  });
  const cohort = everSenders
    .filter((s) => {
      const t = s._min.createdAt;
      return t != null && t >= cohortStart && t < cohortEnd;
    })
    .map((s) => s.fromParentId);
  if (cohort.length === 0) return [0, 0, 0, 0];

  // Sends in the four follow-up weeks for cohort members only.
  const followUp = await prisma.kidMessage.findMany({
    where: {
      fromParentId: { in: cohort },
      createdAt: { gte: cohortEnd, lt: new Date(now) },
    },
    select: { fromParentId: true, createdAt: true },
  });

  const retention: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const ws = new Date(cohortEnd.getTime() + i * week);
    const we = new Date(cohortEnd.getTime() + (i + 1) * week);
    const active = new Set<string>();
    for (const r of followUp) {
      if (r.createdAt >= ws && r.createdAt < we) active.add(r.fromParentId);
    }
    retention[i] = (active.size / cohort.length) * 100;
  }
  return retention;
}

/** Same-day classification ↔ same-day send share over the window. */
async function computeClassificationCoupling(
  from: Date | null,
  windowRows: { fromParentId: string; createdAt: Date }[],
): Promise<number> {
  // We need (parentId, day) pairs on both sides; intersect.
  // Classifications are joined to parents via the child profile, so we read profiles
  // + parent ids alongside (select-only, no PII beyond what already exists in the row).
  const classifications = await prisma.sessionClassification.findMany({
    where: {
      label: { not: null },
      ...(from ? { classifiedAt: { gte: from } } : {}),
    },
    select: {
      classifiedAt: true,
      profile: { select: { parentId: true } },
    },
  });
  const classifyDayKeys = new Set<string>();
  for (const c of classifications) {
    if (!c.classifiedAt) continue;
    const day = c.classifiedAt.toISOString().slice(0, 10);
    classifyDayKeys.add(`${c.profile.parentId}|${day}`);
  }
  if (classifyDayKeys.size === 0) return 0;

  const sendDayKeys = new Set<string>();
  for (const r of windowRows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    sendDayKeys.add(`${r.fromParentId}|${day}`);
  }
  let overlap = 0;
  for (const k of classifyDayKeys) if (sendDayKeys.has(k)) overlap++;
  return overlap / classifyDayKeys.size;
}
