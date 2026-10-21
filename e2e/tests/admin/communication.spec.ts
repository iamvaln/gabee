import * as os from 'node:os';
import * as path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { prisma, FIXTURES, pollUntil } from '../../helpers/db';
import {
  LINKEDIN_BODY,
  LINKEDIN_URL,
  PROPOSALS,
  addDays,
  ageWeek,
  mondayOf,
  resetContentStudio,
  seedProposalsWeek,
  seedProposingWeek,
  seedTitles,
  seedTodayBoard,
  studioToday,
} from '../../helpers/content';

// Communication studio (Aujourd'hui / Semaine). No AI: the database is seeded
// and the one AI-backed call the flow needs (direction → titles) is stubbed.

const IP = '10.20.0.7'; // distinct IP: admin login is rate-limited per IP
const STATE = path.join(os.tmpdir(), `gabee-e2e-communication-${process.pid}.json`);

test.use({
  extraHTTPHeaders: { 'x-forwarded-for': IP },
  storageState: STATE,
  permissions: ['clipboard-read', 'clipboard-write'],
});

// One sign-in for the file (5 logins / 5 min / IP): later tests reuse the session cookie.
test.beforeAll(async ({ browser }, testInfo) => {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    extraHTTPHeaders: { 'x-forwarded-for': IP },
    storageState: undefined, // the file this hook writes
  });
  const page = await context.newPage();
  await page.goto('/admin/login');
  await page.locator('#ae').fill(FIXTURES.adminEmail);
  await page.locator('#ap').fill(FIXTURES.adminPassword);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await context.storageState({ path: STATE });
  await context.close();
});

test.beforeEach(async () => {
  await resetContentStudio();
});

const card = (page: Page, platform: 'LinkedIn' | 'TikTok') => page.getByRole('article', { name: new RegExp(`^${platform}`) });

test('owner chooses a direction and validates the week', async ({ page }) => {
  await seedTodayBoard(); // this week exists too: the screen shows a week switch
  const nextMonday = addDays(mondayOf(studioToday()), 7);
  const { weekId } = await seedProposalsWeek(nextMonday);

  // The titles run is the Strategist (AI): stand in for it with the seeded titles,
  // then answer with the real week DTO. The answer is held until the test checks
  // that nothing can start a second run meanwhile.
  let directionBody: unknown = null;
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/api/admin/communication/weeks/*/direction', async (route) => {
    directionBody = route.request().postDataJSON();
    await held;
    await seedTitles(weekId, 1);
    const response = await page.request.get(`/api/admin/communication/weeks/${weekId}`);
    await route.fulfill({ response });
  });

  await page.goto('/admin/communication/semaine');
  await expect(page.getByRole('heading', { name: 'Semaine', level: 1 })).toBeVisible();
  const thisWeekTab = page.getByRole('button', { name: 'Cette semaine' });
  await expect(page.getByRole('button', { name: 'Semaine prochaine' })).toHaveAttribute('aria-pressed', 'true');

  // Step 1: three directions; pick the second, refine it, add a LinkedIn angle.
  const directions = page.getByRole('radio');
  await expect(directions).toHaveCount(3);
  const stop = page.getByRole('button', { name: 'Arrêter cette direction' });
  await expect(stop).toBeDisabled();
  await page.getByText(PROPOSALS[1].title).click();
  await page.getByLabel('Votre précision (facultatif)').fill('Insister sur les familles bilingues.');
  await page.getByText('Angle par plateforme').click();
  await page.getByLabel('Angle LinkedIn').fill('Témoignage de parent');
  await stop.click();

  // While the titles are being written, the week switch is locked (switching would unlock a second run).
  await expect(page.getByText('Gabee rédige les titres de la semaine…')).toBeVisible();
  await expect(thisWeekTab).toBeDisabled();
  release();
  await expect(thisWeekTab).toBeEnabled();

  expect(directionBody).toEqual({
    proposal_index: 1,
    refinement: 'Insister sur les familles bilingues.',
    platform_angles: { linkedin: 'Témoignage de parent' },
  });

  // Step 2: seven day lines; each platform is one English post short.
  const days = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Sauter' }) });
  await expect(days).toHaveCount(7);
  const quota = page.getByRole('status', { name: 'Posts en anglais' });
  await expect(quota).toContainText('LinkedIn : 1 / 2');
  await expect(quota).toContainText('TikTok : 1 / 2');
  const override = page.getByLabel('Valider quand même avec moins de posts en anglais');
  await expect(override).toBeVisible();
  const validate = page.getByRole('button', { name: 'Valider la semaine' });
  await expect(validate).toBeDisabled();

  // The per-line checklist is a review aid, never worded as the server's "validated".
  const day1 = days.nth(0);
  await day1.getByRole('button', { name: 'Marquer comme relu' }).click();
  await expect(day1.getByText('Relu', { exact: true })).toBeVisible();
  await expect(day1.getByRole('button', { name: /Relu/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1 jour sur 7 relu.')).toBeVisible();
  await expect(page.locator('.studio-days').getByText('Validé')).toHaveCount(0);

  // Switch the second day to English on both platforms (real PATCH, no AI before validation).
  const day2 = days.nth(1);
  await day2.getByRole('radio', { name: 'LinkedIn en anglais' }).click();
  await expect(quota).toContainText('LinkedIn : 2 / 2');
  await day2.getByRole('radio', { name: 'TikTok en anglais' }).click();
  await expect(quota).toContainText('TikTok : 2 / 2');
  await expect(override).toHaveCount(0);

  await validate.click();
  await expect(page.getByText(/Semaine validée/)).toBeVisible();

  const week = await prisma.contentWeek.findUniqueOrThrow({ where: { id: weekId }, include: { slots: true } });
  expect(week.status).toBe('validated');
  expect(week.slots.every((s) => s.status === 'validated')).toBe(true);
  const audit = await prisma.auditLog.findFirst({ where: { kind: 'content.week.validate', targetId: weekId } });
  expect(audit).not.toBeNull();
});

test('owner approves a draft, copies it and marks it published', async ({ page }) => {
  const { linkedinDraftId } = await seedTodayBoard({ linkedinImage: true });

  await page.goto('/admin/communication');
  await expect(page.getByRole('heading', { name: "Aujourd'hui", level: 1 })).toBeVisible();
  await expect(page.getByText('Lire 10 minutes avant le dîner')).toBeVisible();

  const li = card(page, 'LinkedIn');
  await expect(li.getByText('Prêt à valider')).toBeVisible();

  // Copy: the post exactly as it will be pasted (text, tracked link, hashtags).
  await li.getByRole('button', { name: 'Copier le texte' }).click();
  await expect(li.getByText('Texte copié')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain(LINKEDIN_BODY);
  expect(copied).toContain(LINKEDIN_URL);
  expect(copied).toContain('#lecture #parents #enfants');

  // Download: the app probes the media route (a redirect to a presigned URL served as an
  // attachment), then navigates to it so the file downloads and the page stays put. The
  // readable file name is covered by the route's integration test. First, storage down:
  // the error is said in plain French, nothing navigates.
  const mediaRoute = `**/api/admin/communication/drafts/${linkedinDraftId}/media`;
  await page.route(mediaRoute, (route) =>
    route.fulfill({ status: 503, json: { error: { code: 'storage_unavailable', message: 'Media storage is not configured.' } } }),
  );
  await li.getByRole('button', { name: 'Télécharger le média' }).click();
  await expect(li.getByRole('alert')).toContainText('Le stockage des médias ne répond pas');
  await page.unroute(mediaRoute);

  let navigated = false;
  await page.route(mediaRoute, (route) => {
    if (route.request().isNavigationRequest()) {
      navigated = true;
      return route.fulfill({ status: 204 }); // what an attachment does: the page stays
    }
    return route.fulfill({ status: 302, headers: { location: 'https://media.e2e.test/get/lecture.png' } });
  });
  await li.getByRole('button', { name: 'Télécharger le média' }).click();
  await expect.poll(() => navigated).toBe(true);
  await expect(li.getByRole('alert')).toHaveCount(0);
  await expect(page).toHaveURL(/\/admin\/communication$/);

  // Approve, then record the publication.
  await li.getByRole('button', { name: 'Valider', exact: true }).click();
  await expect(li.getByText('Validé', { exact: true })).toBeVisible();
  await li.getByRole('button', { name: 'Marquer comme publié' }).click();

  const dialog = page.getByRole('dialog', { name: 'Marquer comme publié' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Lien du post publié')).toBeFocused();
  await dialog.getByLabel('Lien du post publié').fill('https://www.linkedin.com/feed/update/urn:li:activity:1');
  await dialog.getByRole('radio', { name: '4 étoiles' }).check();
  await dialog.getByLabel('Commentaire (facultatif)').fill('Bon retour des parents.');
  await dialog.getByRole('button', { name: 'Enregistrer la publication' }).click();

  await expect(dialog).toHaveCount(0);
  await expect(li.getByText('Publié', { exact: true })).toBeVisible();
  await expect(li.getByRole('link', { name: /Voir le post/ })).toHaveAttribute('href', 'https://www.linkedin.com/feed/update/urn:li:activity:1');

  const publication = await pollUntil(
    () => prisma.contentPublication.findUnique({ where: { draftId: linkedinDraftId } }),
    (row) => row !== null,
  );
  expect(publication?.rating).toBe(4);
  expect(publication?.comment).toBe('Bon retour des parents.');
  const draft = await prisma.contentDraft.findUniqueOrThrow({ where: { id: linkedinDraftId } });
  expect(draft.status).toBe('published');
});

test('tiktok card shows the filming plan when no video', async ({ page }) => {
  await seedTodayBoard();
  await page.goto('/admin/communication');

  const tt = card(page, 'TikTok');
  await expect(tt.getByText('Plan de tournage')).toBeVisible();
  await expect(tt.getByText('Show the timer starting at 10:00')).toBeVisible();
  await expect(tt.getByText('Child reading aloud')).toBeVisible();
  await expect(tt.getByText('10 minutes a day')).toBeVisible();
  // A TikTok post is a video: approval waits for a cleared video.
  await expect(tt.getByText(/Un post TikTok est une vidéo/)).toBeVisible();
  await expect(tt.getByRole('button', { name: 'Valider', exact: true })).toBeDisabled();
  await expect(tt.getByRole('button', { name: 'Télécharger le média' })).toHaveCount(0);

  // The LinkedIn card without media says it goes out as text only.
  await expect(card(page, 'LinkedIn').getByText('Aucun média autorisé — le post partira en texte seul')).toBeVisible();
});

test('today screen fits a 360px viewport', async ({ page }) => {
  await seedTodayBoard({ longTokens: true, linkedinImage: true });
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/admin/communication');

  const li = card(page, 'LinkedIn');
  await expect(li.getByText(/#lecturelecture/)).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(360);
  // Nothing inside the scrolling page overflows sideways either.
  const pageOverflow = await page.locator('.page').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(pageOverflow).toBeLessThanOrEqual(0);

  // Thumb-sized actions.
  const approve = li.getByRole('button', { name: 'Valider', exact: true });
  const box = await approve.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  // The sidebar is a drawer behind the menu button.
  const nav = page.getByRole('navigation', { name: 'Menu principal' });
  await expect(nav).toBeHidden();
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Semaine' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
});

test('an interrupted draft offers Réessayer instead of waiting forever', async ({ page }) => {
  const { linkedinDraftId } = await seedTodayBoard({ linkedinInterrupted: true });
  let calls = 0;
  await page.route(`**/api/admin/communication/drafts/${linkedinDraftId}/regenerate`, (route) => {
    calls++;
    return route.fulfill({ status: 503, json: { error: { code: 'ai_unavailable', message: "Le service d'IA est indisponible." } } });
  });
  await page.goto('/admin/communication');

  const li = card(page, 'LinkedIn');
  await expect(li.getByText('Interrompu', { exact: true })).toBeVisible();
  await expect(li.getByText('La rédaction s’est interrompue. Relancez-la : rien n’est perdu.')).toBeVisible();
  await expect(li.getByText(/Gabee rédige le post/)).toHaveCount(0);
  await li.getByRole('button', { name: 'Réessayer' }).click();
  await expect(li.getByText(/Le service d'IA est indisponible pour le moment/)).toBeVisible();
  expect(calls).toBe(1);
});

test('a proposing week offers to relaunch only once it looks stuck', async ({ page }) => {
  const nextMonday = addDays(mondayOf(studioToday()), 7);
  const { weekId } = await seedProposingWeek(nextMonday, 2); // a run may still be live
  await page.goto('/admin/communication/semaine');
  await expect(page.getByText('Gabee prépare 3 directions pour la semaine…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Relancer les propositions' })).toHaveCount(0);

  await ageWeek(weekId, 11); // nothing for 11 minutes: no run can be live any more
  await page.reload();
  await expect(page.getByRole('button', { name: 'Relancer les propositions' })).toBeVisible();
  await expect(page.getByText('Les propositions de cette semaine n’ont pas abouti.', { exact: false })).toBeVisible();
});
