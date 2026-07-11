/**
 * Standalone DB-integration check for Task 8 (hourly usage histogram / peak
 * playing hour). Lives under scripts/ (NOT src/) so the `pnpm test` runner —
 * which only globs `src/**\/*.test.ts` — never picks it up. Not part of CI.
 *
 * Run: pnpm --filter @gabee/web exec tsx scripts/verify-hourly-usage.mts
 *
 * NOTE: this hits the shared local dev DB, which may already have unrelated
 * sessionClassification rows (including some in hour 22). To keep the
 * assertions robust against that pre-existing data, we don't assert an exact
 * peakHour value — we assert bucket[22] picked up our 2 inserted rows and
 * that peakHour is a valid 0..23 index (it will legitimately be 22 UNLESS
 * some other hour already has >=3 rows in the shared DB, which is why we
 * don't hard-assert peakHour === 22).
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

function loadDotEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
const here = path.dirname(fileURLToPath(import.meta.url));
loadDotEnv(path.join(here, '..', '..', '..', 'packages', 'db', '.env'));

const { prisma } = await import('../src/lib/server/db');
const { getHourlyUsage } = await import('../src/lib/server/services/hourly-usage');

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const testTag = `verify-hourly-usage-${Date.now()}`;
  const email = `${testTag}@example.invalid`;

  const parent = await prisma.parentAccount.create({
    data: { email },
    select: { id: true },
  });
  const parentId = parent.id;

  try {
    const profile = await prisma.childProfile.create({
      data: { parentId, name: 'Verify Kid', language: 'en' },
      select: { id: true },
    });
    const profileId = profile.id;

    // Two rows at 20:00 UTC with tzOffsetMin=120 (Europe/Paris) → local hour 22.
    // One row with tzOffsetMin=null → excluded from buckets, counted separately.
    const startedAt20z = new Date('2026-07-10T20:00:00Z');

    await prisma.sessionClassification.createMany({
      data: [
        {
          sessionId: randomUUID(),
          profileId,
          startedAt: startedAt20z,
          tz: 'Europe/Paris',
          tzOffsetMin: 120,
        },
        {
          sessionId: randomUUID(),
          profileId,
          startedAt: startedAt20z,
          tz: 'Europe/Paris',
          tzOffsetMin: 120,
        },
        {
          sessionId: randomUUID(),
          profileId,
          startedAt: new Date('2026-07-10T09:00:00Z'),
          tz: null,
          tzOffsetMin: null,
        },
      ],
    });

    const usage = await getHourlyUsage();

    assert(usage.buckets.length === 24, `buckets should have length 24, got ${usage.buckets.length}`);
    assert(usage.buckets[22]! >= 2, `buckets[22] should be >= 2, got ${usage.buckets[22]}`);
    assert(usage.excludedNoTz >= 1, `excludedNoTz should be >= 1, got ${usage.excludedNoTz}`);
    assert(
      usage.peakHour !== null && usage.peakHour >= 0 && usage.peakHour <= 23,
      `peakHour should be a valid 0..23 index, got ${usage.peakHour}`,
    );

    console.log('PASS', {
      'buckets[22]': usage.buckets[22],
      peakHour: usage.peakHour,
      excludedNoTz: usage.excludedNoTz,
    });
  } finally {
    // Cascade: ChildProfile (parentId FK) -> SessionClassification (profileId
    // FK), both onDelete: Cascade in schema.prisma — deleting the parent
    // cleans up everything we created.
    await prisma.parentAccount.delete({ where: { id: parentId } });
    await prisma.$disconnect();
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
