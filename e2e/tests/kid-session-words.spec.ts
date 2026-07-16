import { expect, test } from '@playwright/test';
import { prisma, pollUntil } from '../helpers/db';
import {
  seedKidAuthAndPickAva,
  avaProfile,
  startModule,
  completeMcqLesson,
  finishToHub,
} from '../helpers/kid-session';

test('words: a full picture session persists stars', async ({ page }) => {
  // Proves the seeded-auth path never touches the rate-limited login route —
  // login and this spec's kid app both share the API's single kid-login rate
  // bucket (cross-origin CORS blocks a per-spec x-forwarded-for override), so
  // seeding auth via localStorage instead of a UI login must make zero requests here.
  const loginRequests: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/auth/login')) loginRequests.push(req.url());
  });

  await seedKidAuthAndPickAva(page);
  const ava = await avaProfile();
  const before = ava.totalStars;

  await startModule(page, { module: 'words', subMode: /Image → mot/ }); // words-picture sub-hub tile
  await completeMcqLesson(page, 7); // WordsPictureSession TOTAL = 7
  await finishToHub(page);

  await pollUntil(
    async () => (await prisma.childProfile.findUniqueOrThrow({ where: { id: ava.id } })).totalStars,
    (s) => s > before,
  );

  expect(loginRequests).toEqual([]);
});
