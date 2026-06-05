import { cookies } from 'next/headers';
import { requireParentPage } from '@/lib/server/auth';
import { prisma } from '@/lib/server/db';
import { getAccount } from '@/lib/server/services/accounts';
import { MintBee } from './_components/mint-bee';
import { AddChildForm } from './add-child-form';
import { HomeClassificationCard } from './_components/home-classification-card';
import { HomeKidsPulse, type KidPulse } from './_components/home-kids-pulse';
import { HomeAggregates, type AggregatesData } from './_components/home-aggregates';
import { ageFromBirthDate } from '@/lib/age';

export const dynamic = 'force-dynamic';

// H1 — Parent Home (parent spec §5). Layout mirrors the design handoff
// (docs/UpdatesParentsAdmin:Landing/handoff-unzipped/gabee/project/parent-home.jsx):
//   .home-hero (mascot + greeting)
//   .home-grid (§5.1 classification card · §5.3 aggregates)
//   §5.2 kids pulse + open-Gabee banner
// All visual styles live in parent.css; no per-page CSS.
export default async function ParentHome() {
  const session = await requireParentPage();
  const lang: 'fr' | 'en' =
    (await cookies()).get('parent_lang')?.value === 'en' ? 'en' : 'fr';
  const isFr = lang === 'fr';

  // Window boundaries — "today" = since local midnight server-side (good enough
  // for Phase 1; per-kid timezone is post-Phase 1). "Week" = trailing 7 days.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // One round-trip per metric, all in parallel. Each is a tight Prisma call;
  // anything that can't be answered yet (no events seeded) falls through to a
  // zero / empty default below.
  let pendingCount = 0;
  let todayPerKid: Awaited<ReturnType<typeof loadKidActivityToday>> = new Map();
  let weekAgg: { weekSessions: number; weekDurationS: number } = {
    weekSessions: 0,
    weekDurationS: 0,
  };
  let weekSpark: number[] = [0, 0, 0, 0, 0, 0, 0];
  let adherence: number | null = null;
  let hasDevice = false;
  let offline = false;

  const account = await getAccount(session.parentId);
  const childIds = account.children.map((c) => c.id);

  try {
    const [pending, perKid, week, spark, adh, deviceCount] = await Promise.all([
      prisma.sessionClassification.count({
        where: { label: null, profile: { parentId: session.parentId } },
      }),
      loadKidActivityToday(childIds, startOfToday),
      loadWeekAggregates(session.parentId, weekStart),
      loadWeekSparkline(session.parentId, weekStart),
      loadAdherence(session.parentId, weekStart),
      prisma.deviceLink.count({ where: { parentId: session.parentId, revokedAt: null } }),
    ]);
    pendingCount = pending;
    todayPerKid = perKid;
    weekAgg = week;
    weekSpark = spark;
    adherence = adh;
    hasDevice = deviceCount > 0;
  } catch {
    // Single catch — if the DB is unreachable the whole page renders an
    // offline-flavoured classification card and zero aggregates. Last-seen
    // count would require persisting it server-side; for now we surface 0.
    offline = true;
  }

  const kids: KidPulse[] = account.children.map((c) => {
    const a = todayPerKid.get(c.id);
    return {
      id: c.id,
      name: c.name,
      avatar: c.avatar,
      age: ageFromBirthDate(c.birth_date),
      todaySessions: a?.sessions ?? 0,
      todayMinutes: Math.round((a?.durationS ?? 0) / 60),
      modulesPlayedToday: a?.modules ?? new Set<string>(),
    };
  });

  const aggregates: AggregatesData = {
    weekMinutes: Math.round(weekAgg.weekDurationS / 60),
    weekSessions: weekAgg.weekSessions,
    sessionsSpark: weekSpark,
    adherence,
    // Phase 1: no overlong-session rule yet → always green.
    healthy: true,
    // Phase 2: previous-week comparison not computed yet.
    weekMinutesDelta: null,
    adherenceDeltaPts: null,
  };

  // ── Empty state: no kids yet ───────────────────────────────────────────────
  // Mirrors parent-home.jsx state="empty" but inlines the AddChildForm so a
  // brand-new parent can configure their first kid without a separate route.
  if (account.children.length === 0) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 40 }}>
          <div className="e-bee">
            <MintBee size={104} expression="idle" wings bob />
          </div>
          <h3>{isFr ? 'Bienvenue chez Gabee !' : 'Welcome to Gabee!'}</h3>
          <p>
            {isFr
              ? 'Ajoute ton premier enfant pour commencer à suivre ses apprentissages.'
              : 'Add your first kid to start following their learning.'}
          </p>
        </div>
        <div className="card card-pad" style={{ maxWidth: 520, margin: '0 auto' }}>
          <AddChildForm lang={lang} />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      {offline && (
        <div className="offline-banner">
          {isFr
            ? 'Hors-ligne — lecture seule.'
            : 'Offline — read-only.'}
        </div>
      )}

      <div className="home-hero">
        <MintBee size={68} expression="idle" wings bob />
        <div>
          <h1>
            {isFr ? 'Bonjour' : 'Hello'}
            {account.email ? `, ${displayFirstName(account.email)}` : ''} 👋
          </h1>
          <p>
            {isFr
              ? 'Voici ce que tes enfants ont fait.'
              : "Here's what your kids have been up to."}
          </p>
        </div>
      </div>

      {/* §5.1 + §5.3 — side-by-side on wide widths, stack on narrow. */}
      <div className="home-grid">
        <HomeClassificationCard lang={lang} n={pendingCount} offline={offline} hasDevice={hasDevice} />
        <HomeAggregates lang={lang} data={aggregates} />
      </div>

      <div style={{ height: 30 }} />

      {/* §5.2 — kids pulse + Phase 2 narrative card */}
      <HomeKidsPulse lang={lang} kids={kids} />
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function displayFirstName(email: string): string {
  const local = email.split('@')[0] ?? '';
  if (!local) return '';
  // First chunk before a separator, capitalised — keeps the greeting personal
  // without needing a profile field for it.
  const head = local.split(/[._\-+]/)[0] ?? local;
  return head.charAt(0).toUpperCase() + head.slice(1);
}

/**
 * For each child, count sessions started today + sum their durations, and
 * collect which modules they touched. One query each (events for module
 * touches, classifications for start/duration). Returns an empty map for kids
 * with no activity rather than padding zeros — the caller defaults missing
 * entries to zero.
 */
async function loadKidActivityToday(
  childIds: string[],
  startOfToday: Date,
): Promise<Map<string, { sessions: number; durationS: number; modules: Set<string> }>> {
  const out = new Map<
    string,
    { sessions: number; durationS: number; modules: Set<string> }
  >();
  if (childIds.length === 0) return out;

  // Sessions started today, per kid, with duration.
  const todaysSessions = await prisma.sessionClassification.findMany({
    where: {
      profileId: { in: childIds },
      startedAt: { gte: startOfToday },
    },
    select: { profileId: true, durationS: true, firstModule: true },
  });

  // The `firstModule` on a classification is good for the "what modules did
  // they touch today" pip row — kids rarely change modules mid-session.
  for (const row of todaysSessions) {
    let agg = out.get(row.profileId);
    if (!agg) {
      agg = { sessions: 0, durationS: 0, modules: new Set<string>() };
      out.set(row.profileId, agg);
    }
    agg.sessions += 1;
    agg.durationS += row.durationS ?? 0;
    if (row.firstModule) agg.modules.add(row.firstModule);
  }

  return out;
}

/** Total sessions + total duration across all children for the last 7 days. */
async function loadWeekAggregates(
  parentId: string,
  weekStart: Date,
): Promise<{ weekSessions: number; weekDurationS: number }> {
  const rows = await prisma.sessionClassification.findMany({
    where: { profile: { parentId }, startedAt: { gte: weekStart } },
    select: { durationS: true },
  });
  const weekSessions = rows.length;
  const weekDurationS = rows.reduce((sum, r) => sum + (r.durationS ?? 0), 0);
  return { weekSessions, weekDurationS };
}

/**
 * Adherence (parent spec §5.3) — % of classified sessions over the trailing
 * week that were `child_initiated`. Returns null when there are no classified
 * sessions yet (so the tile renders an em-dash rather than a misleading 0%).
 */
async function loadAdherence(parentId: string, weekStart: Date): Promise<number | null> {
  const classified = await prisma.sessionClassification.count({
    where: {
      profile: { parentId },
      startedAt: { gte: weekStart },
      label: { not: null },
    },
  });
  if (classified === 0) return null;
  const selfInit = await prisma.sessionClassification.count({
    where: {
      profile: { parentId },
      startedAt: { gte: weekStart },
      label: 'child_initiated',
    },
  });
  return selfInit / classified;
}

/**
 * 7-day sparkline of session counts (oldest → newest). Done in JS over the
 * same window — small N (≤ a few hundred rows for an active family) makes a
 * GROUP BY overkill here.
 */
async function loadWeekSparkline(parentId: string, weekStart: Date): Promise<number[]> {
  const rows = await prisma.sessionClassification.findMany({
    where: { profile: { parentId }, startedAt: { gte: weekStart } },
    select: { startedAt: true },
  });
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) {
    const dayOffset = Math.floor(
      (r.startedAt.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000),
    );
    if (dayOffset >= 0 && dayOffset < 7) buckets[dayOffset] = (buckets[dayOffset] ?? 0) + 1;
  }
  return buckets;
}
