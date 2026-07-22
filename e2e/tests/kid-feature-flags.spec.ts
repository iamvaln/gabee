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

// Cues (SFX) are gated by kid_game_sounds, which now ships dark (OFF) by default
// (PR #45 — audio dark by product decision). The "cues still fire" assertion
// below needs it enabled for the fixture parent, so the test exercises the
// music/cue separation rather than the new dark default.
async function setGameSoundsOverride(enabled: boolean) {
  await prisma.featureFlag.upsert({
    where: { key: 'kid_game_sounds' },
    update: {},
    create: { key: 'kid_game_sounds', enabledDefault: false, description: '' },
  });
  const parent = await prisma.parentAccount.findUnique({ where: { email: FIXTURES.parentEmail }, select: { id: true } });
  if (!parent) throw new Error('fixture parent missing');
  await prisma.featureFlagOverride.upsert({
    where: { flagKey_parentId: { flagKey: 'kid_game_sounds', parentId: parent.id } },
    update: { enabled },
    create: { flagKey: 'kid_game_sounds', parentId: parent.id, enabled },
  });
}

async function clearAmbientMusicOverride() {
  const parent = await prisma.parentAccount.findUnique({ where: { email: FIXTURES.parentEmail }, select: { id: true } });
  if (parent) {
    await prisma.featureFlagOverride.deleteMany({
      where: { flagKey: { in: ['kid_ambient_music', 'kid_game_sounds'] }, parentId: parent.id },
    });
  }
}

test.beforeEach(async ({ page }) => {
  // Ava's master audio/music prefs are device-persisted AND written back to her
  // DB row on toggle (Settings → updateProfile). The ambient-music spec turns the
  // master switch OFF, which persists audio_enabled=false to Ava — and setProfile
  // re-seeds the store from that on pick. Reset to a known-on baseline so these
  // specs don't inherit that cross-spec pollution.
  await prisma.childProfile.updateMany({
    where: { name: FIXTURES.childName },
    data: { audioEnabled: true, musicEnabled: true },
  });
  await page.addInitScript(INSTRUMENT);
});

test.afterEach(async () => {
  await clearAmbientMusicOverride();
});

test('kid_ambient_music override ON → music plays and the Settings row is shown', async ({ page }) => {
  await setAmbientMusicOverride(true);
  await seedKidAuthAndPickAva(page);
  await page.mouse.click(1, 1); // autoplay-unlock gesture (see ambient-music spec)
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBeGreaterThan(0);

  // The Settings "Musique d'ambiance" sub-switch is present (flag ON).
  await page.getByRole('button', { name: `${FIXTURES.childName} settings` }).click();
  await expect(page.getByRole('button', { name: /Activée|Coupée/ })).toBeVisible();
});

test('kid_ambient_music override OFF → no music, Settings row hidden, cues still fire', async ({ page }) => {
  await setAmbientMusicOverride(false);
  await setGameSoundsOverride(true); // cues are dark by default now — enable so they fire
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
  await page.getByRole('button', { name: 'Retour' }).click();
  const before = await page.evaluate(() => window.__audioLog.oscillators);
  await page.getByRole('button', { name: 'Apprendre' }).click();
  await expect.poll(() => page.evaluate(() => window.__audioLog.oscillators), { timeout: 10_000 }).toBeGreaterThan(before);
});
