import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { createPrismaClient } from '../src/client';

// Fabricated, deterministic staging fixtures. NO real PII, nothing copied from
// prod. Guarded so it can never run against a non-staging DB by accident.
// Run: STAGING_FIXTURES=1 pnpm --filter @gabee/db exec tsx prisma/seed-fixtures.ts
if (process.env.STAGING_FIXTURES !== '1') {
  console.error('Refusing to run: set STAGING_FIXTURES=1 (staging only).');
  process.exit(1);
}

// Fixed ids → idempotent upserts (safe to re-run).
const P1 = '00000000-0000-4000-9000-000000000001';
const P2 = '00000000-0000-4000-9000-000000000002';
const KIDS = [
  { id: '00000000-0000-4000-9000-0000000000a1', parentId: P1, name: 'Ava', birthDate: '2018-04-12', gender: 'girl' as const },
  { id: '00000000-0000-4000-9000-0000000000a2', parentId: P1, name: 'Noah', birthDate: '2016-09-30', gender: 'boy' as const },
  { id: '00000000-0000-4000-9000-0000000000a3', parentId: P2, name: 'Mia', birthDate: '2019-01-05', gender: 'girl' as const },
];

// Shared staging password: "staging-pass" (documented in the runbook).
// Hashed with Node's built-in scrypt, matching apps/web/src/lib/server/auth.ts
// (hashPassword/verifyPassword) EXACTLY — 16-byte random salt, 64-byte derived
// key, both hex-encoded, default scrypt cost params (N=16384, r=8, p=1) — so a
// tester can actually log in with this password. Generated once via:
//   node -e "const {randomBytes,scrypt}=require('node:crypto');const {promisify}=require('node:util');
//   const s=promisify(scrypt);(async()=>{const salt=randomBytes(16);const d=await s('staging-pass',salt,64);
//   console.log(d.toString('hex'), salt.toString('hex'));})()"
// and round-trip-verified against the real verifyPassword() logic before being
// hardcoded here (see task-5-report.md).
const SHARED_HASH =
  '75f364fbca1cb8d421fe6a6d130f0886ffce3d54c8859fefb6042108cf646f2915a0ac31c266ece71a0b53e9461176f91dfe81062d22c36c73059ffb9a0bc11f';
const SHARED_SALT = '5e25b0df8468aa30598c7195bb1d52d4';

async function main() {
  const prisma = createPrismaClient();
  try {
    for (const [id, email] of [
      [P1, 'tester1@staging.gabee.app'],
      [P2, 'tester2@staging.gabee.app'],
    ] as const) {
      await prisma.parentAccount.upsert({
        where: { id },
        update: { email },
        create: {
          id,
          email,
          displayNameForKids: 'Tester',
          emailConfirmedAt: new Date(),
          credentials: {
            create: { id: randomUUID(), hash: SHARED_HASH, salt: SHARED_SALT, algorithm: 'scrypt' },
          },
        },
      });
    }
    for (const k of KIDS) {
      await prisma.childProfile.upsert({
        where: { id: k.id },
        update: { name: k.name },
        create: {
          id: k.id,
          parentId: k.parentId,
          name: k.name,
          language: 'fr',
          birthDate: new Date(k.birthDate),
          gender: k.gender,
        },
      });
    }
    // Tester-B-owned message, used by the IDOR probe (ops/security/dynamic/probes/idor.spec.ts)
    // to prove ownership scoping: A must be denied (404) reading a message that
    // REALLY exists and belongs to B, not a nonexistent id (which would 404 either way).
    const MESSAGE_ID = '00000000-0000-4000-9000-0000000000b1';
    await prisma.kidMessage.upsert({
      where: { id: MESSAGE_ID },
      update: {},
      create: {
        id: MESSAGE_ID,
        fromParentId: P2,
        toChildId: '00000000-0000-4000-9000-0000000000a3', // Mia, B's kid
        text: 'Hello from tester B',
      },
    });

    const parents = await prisma.parentAccount.count();
    const kids = await prisma.childProfile.count();
    const messages = await prisma.kidMessage.count();
    console.log(`fixtures OK — parents=${parents} kids=${kids} messages=${messages}`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
