// e2e/tests/kid-feature-flags.spec.ts
// Admin feature flags gating the kid app. Reuses the ambient-music AudioContext
// instrumentation: music = looping AudioBufferSource; cues = OscillatorNodes.
// A per-parent override for kid_ambient_music flips whether music plays AND
// whether the Settings "Musique d'ambiance" row exists — cues stay regardless.
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, prisma } from '../helpers/db';
import { seedKidAuthAndPickAva } from '../helpers/kid-session';

declare global {
  interface Window {
    __audioLog: { music: { started: boolean; stopped: boolean; loop: boolean }[]; oscillators: number };
  }
}

const INSTRUMENT = `
  window.__audioLog = { music: [], oscillators: 0 };
  const wrap = (Ctor) => {
    if (!Ctor) return;
    const origSource = Ctor.prototype.createBufferSource;
    Ctor.prototype.createBufferSource = function () {
      const s = origSource.call(this);
      const entry = { started: false, stopped: false, loop: false };
      window.__audioLog.music.push(entry);
      const oStart = s.start.bind(s), oStop = s.stop.bind(s);
      s.start = (...a) => { entry.started = true; entry.loop = s.loop; return oStart(...a); };
      s.stop = (...a) => { entry.stopped = true; return oStop(...a); };
      return s;
    };
    const origOsc = Ctor.prototype.createOscillator;
    Ctor.prototype.createOscillator = function () { window.__audioLog.oscillators++; return origOsc.call(this); };
  };
  wrap(window.AudioContext); wrap(window.webkitAudioContext);
`;

const liveMusic = async (page: Page) =>
  (await page.evaluate(() => window.__audioLog.music)).filter((m) => m.started && m.loop && !m.stopped).length;

async function setAmbientMusicOverride(enabled: boolean) {
  // FK-safe: the flag row must exist before an override references it.
  await prisma.featureFlag.upsert({
    where: { key: 'kid_ambient_music' },
    update: {},
    create: { key: 'kid_ambient_music', enabledDefault: false, description: '' },
  });
  const parent = await prisma.parentAccount.findUnique({ where: { email: FIXTURES.parentEmail }, select: { id: true } });
  if (!parent) throw new Error('fixture parent missing');
  await prisma.featureFlagOverride.upsert({
    where: { flagKey_parentId: { flagKey: 'kid_ambient_music', parentId: parent.id } },
    update: { enabled },
    create: { flagKey: 'kid_ambient_music', parentId: parent.id, enabled },
  });
}

async function clearAmbientMusicOverride() {
  const parent = await prisma.parentAccount.findUnique({ where: { email: FIXTURES.parentEmail }, select: { id: true } });
  if (parent) {
    await prisma.featureFlagOverride.deleteMany({ where: { flagKey: 'kid_ambient_music', parentId: parent.id } });
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(INSTRUMENT);
});

test.afterEach(async () => {
  await clearAmbientMusicOverride();
});

async function dumpDiag(page: Page, label: string) {
  const diag = await page.evaluate(() => ({
    store: JSON.parse(localStorage.getItem('gabee-kid-store') || '{}').state ?? null,
    audioLog: (window as unknown as { __audioLog?: unknown }).__audioLog,
    acState: (window as unknown as { __gabeeAudio?: { state?: string } }).__gabeeAudio?.state ?? 'no-ctx',
  }));
  // eslint-disable-next-line no-console
  console.log(`DIAG[${label}]`, JSON.stringify(diag));
}

test('kid_ambient_music override ON → music plays and the Settings row is shown', async ({ page }) => {
  await setAmbientMusicOverride(true);
  await seedKidAuthAndPickAva(page);
  await page.mouse.click(1, 1);
  await page.waitForTimeout(3000);
  await dumpDiag(page, 'ON');
  // Seeded auth boots instantly, so the /api/flags/effective fetch can still be
  // in flight when the AudioContext first unlocks — and the unlock gesture is a
  // one-shot (music.ts armUnlockRetry). Re-issue the gesture each poll so that
  // once the flag lands, the next tap starts the loop. (UI login was slow enough
  // to hide this; seeded auth is not.)
  await expect
    .poll(async () => { await page.mouse.click(1, 1); return liveMusic(page); }, { timeout: 20_000 })
    .toBeGreaterThan(0);

  // The Settings "Musique d'ambiance" sub-switch is present (flag ON).
  await page.getByRole('button', { name: `${FIXTURES.childName} settings` }).click();
  await expect(page.getByRole('button', { name: /Activée|Coupée/ })).toBeVisible();
});

test('kid_ambient_music override OFF → no music, Settings row hidden, cues still fire', async ({ page }) => {
  await setAmbientMusicOverride(false);
  await seedKidAuthAndPickAva(page);
  await page.mouse.click(1, 1);
  // Music must never start.
  await page.waitForTimeout(2000);
  expect(await liveMusic(page)).toBe(0);

  // The "Musique d'ambiance" sub-switch is NOT rendered (other sound settings stay).
  await page.getByRole('button', { name: `${FIXTURES.childName} settings` }).click();
  await expect(page.getByRole('button', { name: /Activés|Coupés/ })).toBeVisible(); // master row still there
  await expect(page.getByRole('button', { name: /Activée|Coupée/ })).toHaveCount(0); // music sub-row gone

  // Cues still fire: back to the hub, tap a BottomNav item → an oscillator.
  // Self-healing tap (like the ON test): a BottomNav blip fires a cue on every
  // tap, so re-tapping until the counter moves absorbs any settle/timing races.
  await page.getByRole('button', { name: 'Retour' }).click();
  await dumpDiag(page, 'OFF');
  const before = await page.evaluate(() => window.__audioLog.oscillators);
  await expect
    .poll(async () => {
      await page.getByRole('button', { name: 'Apprendre' }).click();
      return page.evaluate(() => window.__audioLog.oscillators);
    }, { timeout: 15_000 })
    .toBeGreaterThan(before);
});
