import { randomUUID } from 'node:crypto';
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
  resetAudience,
  resetContentStudio,
  resetJournal,
  resetStudioSettings,
  seedAudience,
  seedFailedJournal,
  seedMediaAsset,
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
  await resetJournal();
  await resetAudience();
  await resetStudioSettings();
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

test('a cut-off direction call stops warning once polling shows the titles', async ({ page }) => {
  const nextMonday = addDays(mondayOf(studioToday()), 7);
  const { weekId } = await seedProposalsWeek(nextMonday);
  await page.clock.install(); // the 20 s wait poll is fast-forwarded below
  // The request reached the server (the week moved to direction_set) but its answer never arrived.
  await page.route('**/api/admin/communication/weeks/*/direction', async (route) => {
    await prisma.contentWeek.update({ where: { id: weekId }, data: { status: 'direction_set', chosenIndex: 0 } });
    await route.abort('connectionreset');
  });

  await page.goto('/admin/communication/semaine');
  await page.getByText(PROPOSALS[0].title).click();
  await page.getByRole('button', { name: 'Arrêter cette direction' }).click();
  const cut = page.getByText(/La connexion a été coupée/);
  await expect(cut).toBeVisible();
  await expect(page.getByText('Gabee rédige les titres de la semaine…')).toBeVisible();

  // The run finished after all: the next poll shows the titles and the warning is gone.
  await seedTitles(weekId, 0);
  await page.clock.fastForward(21_000);
  await expect(page.getByRole('button', { name: 'Valider la semaine' })).toBeVisible();
  await expect(cut).toHaveCount(0);
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
  // Focus returns to the menu button (not <body>) once the page behind is reachable again.
  await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeFocused();

  // Same through the drawer's own close button.
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.locator('#admin-side').getByRole('button', { name: 'Fermer le menu' }).click();
  await expect(nav).toBeHidden();
  await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toBeFocused();
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

  await ageWeek(weekId, 21); // nothing for 21 minutes: no run can be live any more
  await page.reload();
  await expect(page.getByRole('button', { name: 'Relancer les propositions' })).toBeVisible();
  await expect(page.getByText('Les propositions de cette semaine n’ont pas abouti.', { exact: false })).toBeVisible();
});

test('a launch cut off by the proxy keeps Aujourd\'hui updating until the proposals land', async ({ page }) => {
  // What prod does when the Strategist outlives Cloudflare's 100 s: the week exists in
  // `proposing`, the browser gets a proxy error page (not the API's JSON).
  const today = studioToday();
  const sunday = new Date(`${today}T00:00:00Z`).getUTCDay() === 0;
  const startsOn = sunday ? addDays(today, 1) : mondayOf(today);
  const firstDay = addDays(today, 1);
  let weekId = '';
  await page.route('**/api/admin/communication/weeks', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const week = await prisma.contentWeek.create({
      data: { startsOn: new Date(`${startsOn}T00:00:00Z`), firstDay: new Date(`${sunday ? startsOn : firstDay}T00:00:00Z`), status: 'proposing' },
    });
    weekId = week.id;
    await route.fulfill({ status: 524, contentType: 'text/html', body: '<html><body>error code: 524</body></html>' });
  });
  const isWeeksGet = (url: string, method: string) => method === 'GET' && url.endsWith('/api/admin/communication/weeks');

  await page.goto('/admin/communication');
  // The board re-read that follows the failure: it must land (week still proposing)
  // before the week moves on, or the test would not prove any polling.
  const reread = page.waitForResponse((r) => weekId !== '' && isWeeksGet(r.url(), r.request().method()));
  await page.getByRole('button', { name: 'Lancer la semaine maintenant' }).click();
  await reread;
  const cut = page.getByText('La connexion a été coupée', { exact: false });
  await expect(cut.first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Relancer les propositions' })).toHaveCount(0);

  // The Strategist finishes on the server: the page notices on its own, no reload.
  const polled = page.waitForRequest((r) => isWeeksGet(r.url(), r.method()), { timeout: 30_000 });
  await prisma.contentWeek.update({ where: { id: weekId }, data: { status: 'proposals_ready', proposals: { proposals: PROPOSALS } } });
  await polled;
  await expect(cut).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Ouvrir la semaine' })).toBeVisible();
});

test('upload a video, clear it and attach it to a tiktok draft', async ({ page }) => {
  const { tiktokDraftId } = await seedTodayBoard();
  await seedMediaAsset({ kind: 'image', fileName: 'affiche.png', aspect: '16:9', cleared: true });

  // Storage is R2 in production and refused as memory under `next start` (Ruling 14): stand in for the
  // browser's two storage hops — the signed PUT and the server-side verification — and seed the row
  // that verification would leave behind.
  const assetId = randomUUID();
  const putUrl = 'https://e2e-media.r2.cloudflarestorage.com/media/2026/10/upload.mp4?X-Amz-Signature=e2e';
  let initBody: unknown = null;
  let put: { method: string; contentType: string | undefined; size: number } | null = null;
  let completed = 0;
  let releasePut!: () => void;
  const putHeld = new Promise<void>((r) => (releasePut = r));
  await page.route('**/api/admin/communication/media', (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    initBody = route.request().postDataJSON();
    return route.fulfill({ json: { assetId, uploadUrl: putUrl } });
  });
  await page.route('https://e2e-media.r2.cloudflarestorage.com/**', async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT', 'access-control-allow-headers': 'content-type' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    put = { method: route.request().method(), contentType: route.request().headers()['content-type'], size: route.request().postDataBuffer()?.length ?? 0 };
    await putHeld;
    return route.fulfill({ status: 200, headers: cors, body: '' });
  });
  await page.route(`**/api/admin/communication/media/${assetId}/complete`, async (route) => {
    completed++;
    const row = await seedMediaAsset({ id: assetId, kind: 'video', fileName: 'lecture-du-soir.mp4', aspect: '9:16', tags: ['lecture', 'soir'] });
    return route.fulfill({
      json: {
        asset: { ...row, createdAt: row.createdAt.toISOString(), updatedAt: undefined, objectKey: undefined, uploadedById: undefined, checksum: undefined },
      },
    });
  });

  await page.goto('/admin/communication/medias');
  await expect(page.getByRole('heading', { name: 'Médiathèque', level: 1 })).toBeVisible();
  await expect(page.getByRole('article', { name: 'affiche.png' })).toBeVisible();

  await page.getByRole('button', { name: 'Téléverser un fichier' }).click();
  const dialog = page.getByRole('dialog', { name: 'Téléverser un fichier' });
  const fileInput = dialog.getByLabel('Fichier');

  // Checked in the browser first, in plain French: an SVG is refused before anything is sent.
  await fileInput.setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(dialog.getByText(/Ce type de fichier n’est pas accepté/)).toBeVisible();

  const video = Buffer.alloc(64 * 1024, 1);
  await fileInput.setInputFiles({ name: 'lecture-du-soir.mp4', mimeType: 'video/mp4', buffer: video });
  // A video needs its format (the server cannot read it from the file).
  const send = dialog.getByRole('button', { name: 'Envoyer le fichier' });
  await send.click();
  await expect(dialog.getByText('Choisissez le format de la vidéo.')).toBeVisible();
  await dialog.getByLabel('Format de la vidéo').selectOption('9:16');
  await dialog.getByLabel('Mots-clés (facultatif)').fill('lecture, soir');
  await send.click();

  // While the file travels to storage: progress, and a way to stop.
  await expect(dialog.getByRole('progressbar', { name: 'Envoi du fichier' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Annuler l’envoi' })).toBeVisible();
  releasePut();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'lecture-du-soir.mp4 est dans la médiathèque' })).toBeVisible();

  expect(initBody).toEqual({ file_name: 'lecture-du-soir.mp4', mime: 'video/mp4', size_bytes: video.length, aspect: '9:16', tags: ['lecture', 'soir'] });
  expect(put).toEqual({ method: 'PUT', contentType: 'video/mp4', size: video.length });
  expect(completed).toBe(1);

  // Clear it for publication, with a note.
  const asset = page.getByRole('article', { name: 'lecture-du-soir.mp4' });
  await expect(asset.getByText('Non autorisé', { exact: true })).toBeVisible();
  await asset.getByRole('button', { name: 'Autoriser' }).click();
  const clear = page.getByRole('dialog', { name: 'Autoriser ce média ?' });
  await clear.getByLabel('Note (facultatif)').fill('Tourné à la maison, aucun enfant reconnaissable.');
  await clear.getByRole('button', { name: 'Autoriser la publication' }).click();
  await expect(asset.getByText('Autorisé', { exact: true })).toBeVisible();
  await expect(asset.getByText('Tourné à la maison, aucun enfant reconnaissable.')).toBeVisible();
  const cleared = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
  expect([cleared.cleared, cleared.clearanceNote]).toEqual([true, 'Tourné à la maison, aucun enfant reconnaissable.']);

  // Attach it to today's TikTok draft from the card, then approve.
  await page.goto('/admin/communication');
  const tt = card(page, 'TikTok');
  await expect(tt.getByRole('button', { name: 'Valider', exact: true })).toBeDisabled();
  await tt.getByRole('button', { name: 'Modifier' }).click();
  await tt.getByRole('button', { name: 'Choisir un média' }).click();
  const picker = page.getByRole('dialog', { name: 'Choisir un média' });
  // TikTok takes vertical videos only: the cleared 16:9 image is not offered.
  await expect(picker.getByText('affiche.png')).toHaveCount(0);
  await picker.getByRole('radio', { name: /lecture-du-soir\.mp4/ }).check();
  await picker.getByRole('button', { name: 'Joindre ce média' }).click();
  await expect(tt.getByText('lecture-du-soir.mp4')).toBeVisible();
  await tt.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(tt.getByText(/Un post TikTok est une vidéo/)).toHaveCount(0);
  await tt.getByRole('button', { name: 'Valider', exact: true }).click();
  await expect(tt.getByText('Validé', { exact: true })).toBeVisible();

  const draft = await prisma.contentDraft.findUniqueOrThrow({ where: { id: tiktokDraftId } });
  expect([draft.mediaAssetId, draft.status]).toEqual([assetId, 'approved']);
});

test('journal shows a failed job with its error', async ({ page }) => {
  const { error } = await seedFailedJournal();
  await page.goto('/admin/communication/journal');
  await expect(page.getByRole('heading', { name: 'Journal', level: 1 })).toBeVisible();

  const jobs = page.getByRole('region', { name: 'Tâches planifiées' });
  const failed = jobs.getByRole('listitem').filter({ hasText: 'Rédaction des posts du jour' });
  await expect(failed.getByText('Abandonné', { exact: true })).toBeVisible();
  await expect(failed.getByText('4 essais')).toBeVisible();
  await expect(failed).toHaveClass(/is-failed/);
  await failed.getByText('Voir l’erreur complète').click();
  await expect(failed.getByText(error)).toBeVisible();
  await expect(jobs.getByRole('listitem').filter({ hasText: 'Email des propositions' }).getByText('Réussi', { exact: true })).toBeVisible();

  const agents = page.getByRole('region', { name: 'Appels aux agents' });
  const run = agents.getByRole('listitem').filter({ hasText: 'Rédacteur LinkedIn' });
  await expect(run.getByText('Réponse inutilisable', { exact: true })).toBeVisible();
  await expect(run.getByText('0,0312 $')).toBeVisible();

  // "Échecs seulement" hides what went fine.
  await page.getByRole('button', { name: 'Échecs seulement' }).click();
  await expect(jobs.getByRole('listitem').filter({ hasText: 'Email des propositions' })).toHaveCount(0);
  await expect(failed).toBeVisible();
});

test('audience shows visits and sign-ups by source and by post', async ({ page }) => {
  const { linkedinDraftId } = await seedTodayBoard();
  await seedAudience(linkedinDraftId);
  await page.goto('/admin/communication/audience');
  await expect(page.getByRole('heading', { name: 'Audience', level: 1 })).toBeVisible();

  await expect(page.getByRole('group', { name: 'Visites' })).toContainText('8');
  await expect(page.getByRole('group', { name: 'Inscriptions' })).toContainText('1');
  await expect(page.getByRole('group', { name: 'Première source' })).toContainText('LinkedIn');

  const bySource = page.getByRole('table', { name: 'Par source' });
  await expect(bySource.getByRole('row', { name: /LinkedIn 5 1/ })).toBeVisible();
  await expect(bySource.getByRole('row', { name: /Accès direct 1 0/ })).toBeVisible();
  const byPost = page.getByRole('table', { name: 'Par publication' });
  await expect(byPost.getByRole('row').filter({ hasText: 'Lire 10 minutes avant le dîner' })).toContainText('LinkedIn');
  await expect(byPost.getByRole('row').filter({ hasText: 'Lien de la bio TikTok' })).toContainText('2');
});

test.describe('as a super-admin', () => {
  test('owner sets the paid offer and publishes a new editorial line version', async ({ page }) => {
    // This month's Communication spend (question authoring and other months do not count).
    await prisma.aiUsage.createMany({
      data: [
        { provider: 'anthropic', model: 'claude-opus-5-5', purpose: 'post_linkedin', task: 'post_linkedin', costUsd: 1.5 },
        { provider: 'anthropic', model: 'claude-opus-5-5', purpose: 'post_tiktok', task: 'post_tiktok', costUsd: 7, createdAt: new Date(Date.now() - 45 * 86_400_000) },
      ],
    });
    await page.goto('/admin/communication/reglages');
    await expect(page.getByRole('region', { name: 'Budget IA' })).toContainText(/Ce mois-ci : 1,50\s\$ dépensés sur 50,00\s\$/);
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
    const line = page.getByRole('region', { name: 'Ligne éditoriale' });
    await expect(line.getByText(/Version 1 · publiée le/)).toBeVisible();

    await line.getByLabel('Une offre payante existe').check();
    await line.getByLabel('Nom de l’offre').fill('Gabee Famille');
    await line.getByLabel('Prix', { exact: true }).fill('2 000 FCFA / mois');
    await line.getByLabel('Ce qu’elle comprend (une ligne par point)').fill('Enfants illimités\nRapports détaillés');
    await line.getByRole('button', { name: 'Publier la version 2' }).click();
    await expect(line.getByText(/Version 2 · publiée le/)).toBeVisible();

    const v2 = await prisma.editorialLineVersion.findUniqueOrThrow({ where: { version: 2 } });
    const facts = v2.productFacts as Record<string, unknown>;
    expect(facts.paid_offer).toEqual({ name: 'Gabee Famille', price: '2 000 FCFA / mois', includes: ['Enfants illimités', 'Rapports détaillés'] });
    expect(Array.isArray(facts.modules)).toBe(true); // facts the form does not edit are kept

    // Budget: dollars per month and a percentage threshold.
    const budget = page.getByRole('region', { name: 'Budget IA' });
    await budget.getByLabel('Budget mensuel').fill('80');
    await budget.getByLabel('Alerte à').fill('75');
    await budget.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(budget.getByText('Enregistré')).toBeVisible();
    const settings = await prisma.studioSettings.findUniqueOrThrow({ where: { id: 'default' } });
    expect([settings.monthlyBudgetUsd, settings.budgetAlertRatio]).toEqual([80, 0.75]);

    // Unsaved edits: leaving through the menu asks first.
    await line.getByLabel('Texte (Markdown)').fill('Brouillon non publié');
    const journalLink = page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: 'Journal' });
    await journalLink.click();
    const leave = page.getByRole('dialog', { name: 'Quitter sans enregistrer ?' });
    await leave.getByRole('button', { name: 'Annuler' }).click();
    await expect(page).toHaveURL(/\/reglages$/);
    await journalLink.click();
    await leave.getByRole('button', { name: 'Quitter sans enregistrer' }).click();
    await expect(page).toHaveURL(/\/journal$/);

    // Ops › Usage IA shows the same month figure against the (new) budget; all-time figures say so.
    await page.goto('/admin/ops/ai-usage');
    const month = page.getByRole('group', { name: 'Ce mois-ci' });
    await expect(month).toContainText('1,50');
    await expect(month).toContainText(/sur 80,00\s\$ \(budget du studio\)/);
    await expect(page.getByText('Coût total · depuis le début')).toBeVisible();
  });
});

test.describe('as a plain admin', () => {
  const ADMIN_IP = '10.20.0.8'; // its own login bucket
  test.use({ storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { 'x-forwarded-for': ADMIN_IP } });

  test('admin (not super) sees settings read-only', async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('#ae').fill(FIXTURES.adminOnlyEmail);
    await page.locator('#ap').fill(FIXTURES.adminOnlyPassword);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto('/admin/communication/reglages');
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
    await expect(page.getByText('Lecture seule : seul un super-admin peut modifier ces réglages.')).toBeVisible();
    await expect(page.getByText(/Version 1 · publiée le/)).toBeVisible();
    // Choices are disabled; text stays readable and selectable (read-only, not disabled).
    await expect(page.getByLabel('Fuseau horaire')).toBeDisabled();
    const budget = page.getByLabel('Budget mensuel');
    await expect(budget).not.toBeEditable();
    await expect(budget).toBeEnabled();
    await expect(page.getByLabel('Texte (Markdown)')).not.toBeEditable();
    await expect(page.getByRole('button', { name: /Enregistrer|Publier|Ajouter une cible/ })).toHaveCount(0);
    // The month switch only reads, so it stays usable.
    const nextMonth = page.getByRole('group', { name: 'Mois' }).getByRole('button').nth(1);
    await nextMonth.click();
    await expect(nextMonth).toHaveAttribute('aria-pressed', 'true');
  });
});

test('picking a file with the keyboard attaches it without saving the post behind', async ({ page }) => {
  const { linkedinDraftId } = await seedTodayBoard();
  await seedMediaAsset({ kind: 'image', fileName: 'premiere-image.png', aspect: '16:9', cleared: true });
  await seedMediaAsset({ kind: 'image', fileName: 'seconde-image.png', aspect: '4:5', cleared: true });
  await seedMediaAsset({ kind: 'image', fileName: 'verticale.png', aspect: '9:16', cleared: true }); // LinkedIn: never vertical
  await page.goto('/admin/communication');
  const li = card(page, 'LinkedIn');
  await li.getByRole('button', { name: 'Modifier' }).click();
  await li.getByRole('button', { name: 'Choisir un média' }).click();

  const picker = page.getByRole('dialog', { name: 'Choisir un média' });
  const radios = picker.getByRole('radio');
  await expect(radios).toHaveCount(2);
  await expect(picker.getByText('verticale.png')).toHaveCount(0);
  const second = ((await picker.locator('.studio-pick').nth(1).locator('.studio-pick-name').textContent()) ?? '').trim();
  await radios.first().focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  // Enter attached the file to the editor (the dialog's own action), and saved nothing yet.
  await expect(picker).toHaveCount(0);
  await expect(li.getByText(second)).toBeVisible();
  const draft = await prisma.contentDraft.findUniqueOrThrow({ where: { id: linkedinDraftId } });
  expect([draft.mediaAssetId, draft.status]).toEqual([null, 'ready']);
  expect(await prisma.contentDraftVersion.count({ where: { draftId: linkedinDraftId } })).toBe(1);

  await li.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(li.getByRole('button', { name: 'Modifier' })).toBeVisible();
  const saved = await prisma.contentDraft.findUniqueOrThrow({ where: { id: linkedinDraftId }, include: { mediaAsset: true } });
  expect([saved.mediaAsset?.fileName, saved.status]).toEqual([second, 'ready']);
  expect(await prisma.contentDraftVersion.count({ where: { draftId: linkedinDraftId } })).toBe(2);
});

test('an upload can be cancelled, and a failed transfer says what to do', async ({ page }) => {
  await page.route('**/api/admin/communication/media', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ json: { assetId: randomUUID(), uploadUrl: 'https://e2e-media.r2.cloudflarestorage.com/media/x.png?X-Amz-Signature=e2e' } })
      : route.continue(),
  );
  let puts = 0;
  await page.route('https://e2e-media.r2.cloudflarestorage.com/**', async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'PUT', 'access-control-allow-headers': 'content-type' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    puts++;
    // First transfer: never answers (the owner cancels it). Second: the connection drops.
    if (puts === 1) return new Promise<void>(() => undefined);
    return route.abort('failed');
  });

  await page.goto('/admin/communication/medias');
  await page.getByRole('button', { name: 'Téléverser un fichier' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Téléverser un fichier' });
  await dialog.getByLabel('Fichier', { exact: true }).setInputFiles({ name: 'affiche.png', mimeType: 'image/png', buffer: Buffer.alloc(4096, 1) });
  await dialog.getByRole('button', { name: 'Envoyer le fichier' }).click();

  await dialog.getByRole('button', { name: 'Annuler l’envoi' }).click();
  await expect(dialog.getByText('Envoi annulé. Le fichier n’a pas été ajouté.')).toBeVisible();
  const send = dialog.getByRole('button', { name: 'Envoyer le fichier' });
  await expect(send).toBeEnabled();

  await send.click();
  await expect(
    dialog.getByText('Le transfert a échoué. Réessayez ; si cela se répète, vérifiez la configuration du stockage (voir le runbook).'),
  ).toBeVisible();
  await expect(send).toBeEnabled();
  expect(puts).toBe(2);
});
