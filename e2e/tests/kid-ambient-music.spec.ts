// e2e/tests/kid-ambient-music.spec.ts
// Ambient music (audio phase E): instrument AudioContext before the app loads,
// then assert music sources against real navigation. Music = looping
// AudioBufferSource; cues = OscillatorNodes (the discriminator).
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES, prisma } from '../helpers/db';
import { seedKidAuthAndPickAva } from '../helpers/kid-session';

// Ambient music is admin-flag-gated (design 2026-07-16) and ships OFF by
// default. These engine tests predate the flag, so enable it for the fixture
// parent via a per-account override before each test, and clean up after.
async function setAmbientMusicFlag(enabled: boolean) {
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

// Nav/tap cues are SFX gated by kid_game_sounds, which now ships dark (OFF) by
// default (PR #45 — audio dark by product decision). These engine tests assert
// cues fire, so enable it for the fixture parent via a per-account override,
// exactly like ambient music above.
async function setGameSoundsFlag(enabled: boolean) {
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

async function clearAmbientMusicFlag() {
  const parent = await prisma.parentAccount.findUnique({ where: { email: FIXTURES.parentEmail }, select: { id: true } });
  if (parent)
    await prisma.featureFlagOverride.deleteMany({
      where: { flagKey: { in: ['kid_ambient_music', 'kid_game_sounds'] }, parentId: parent.id },
    });
}

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
    Ctor.prototype.createOscillator = function () {
      window.__audioLog.oscillators++;
      return origOsc.call(this);
    };
  };
  wrap(window.AudioContext); wrap(window.webkitAudioContext);
`;

const musicLog = (page: Page) => page.evaluate(() => window.__audioLog.music);
const liveMusic = async (page: Page) =>
  (await musicLog(page)).filter((m) => m.started && m.loop && !m.stopped).length;
const oscCount = (page: Page) => page.evaluate(() => window.__audioLog.oscillators);

test.beforeEach(async ({ page }) => {
  // This spec's test 2 turns the master switch OFF, which persists
  // audio_enabled=false to Ava's row; reset to a known-on baseline so a rerun
  // (or the feature-flags spec) doesn't inherit that.
  await prisma.childProfile.updateMany({
    where: { name: FIXTURES.childName },
    data: { audioEnabled: true, musicEnabled: true },
  });
  await setAmbientMusicFlag(true);
  await setGameSoundsFlag(true); // cues are dark by default now — enable so they fire
  await page.addInitScript(INSTRUMENT);
});

test.afterEach(async () => {
  await clearAmbientMusicFlag();
});

test('ambient music starts on hub, stops in a session, resumes after', async ({ page }) => {
  await seedKidAuthAndPickAva(page);
  // Autoplay policy: the AudioContext may still be suspended when the hub
  // evaluates its zone; the engine arms a one-shot gesture retry (pointerdown
  // on document — music.ts). This tap is that gesture. Coordinates matter: a
  // bare body.click() hits the viewport CENTER, which on the hub is a module
  // tile and navigates away — tap the top-left chrome padding instead.
  await page.mouse.click(1, 1);
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBeGreaterThan(0);

  // Enter a translation session. Post-rework, translation is two independently
  // tracked directions: the Hub tile opens the sub-hub (FR→EN / EN→FR), picking
  // a direction opens its lesson map, and the first unlocked lesson starts the
  // session (App.tsx: translation → translation_subhub → *_lessonmap → *_session).
  await page.locator('button.module-tile[data-module="translation"]').click();
  await page.getByRole('button', { name: /FR\s*→\s*EN/ }).click();
  await page.locator('.level-grid .level-tile.unlocked').first().click();
  await expect(page.locator('.session-answers .answer-btn').first()).toBeVisible();
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBe(0);

  // Back out to ambient territory — music must return. The SPA pushes real
  // history entries per route (App.tsx routeToPath/popstate), so browser back
  // pops straight back to the hub.
  await page.goBack();
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBeGreaterThan(0);
});

test('music switch silences ambience but keeps cues; master kills both', async ({ page }) => {
  await seedKidAuthAndPickAva(page);
  await page.mouse.click(1, 1); // autoplay-unlock gesture at a neutral spot (see first test)
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBeGreaterThan(0);

  // Settings entry point: Chrome's profile chip (Chrome.tsx) — accessible name
  // is the literal, untranslated `${profile.name} settings` aria-label.
  const settingsEntry = page.getByRole('button', { name: `${FIXTURES.childName} settings` });
  await settingsEntry.click();

  // Settings → music OFF (settings.musicOn/musicOff = 'Activée'/'Coupée', the
  // subordinate "Musique d'ambiance" switch): loop stops, but a nav cue
  // (oscillator) still fires — the master "Sons et voix" switch is untouched.
  await page.getByRole('button', { name: /Activée|Coupée/ }).click();
  await expect.poll(() => liveMusic(page), { timeout: 10_000 }).toBe(0);

  // Settings is a "focus route" (App.tsx isFocusRoute) so BottomNav is hidden
  // here — go back to the hub (a browse route) first to reach it.
  await page.getByRole('button', { name: 'Retour' }).click();
  const oscBefore = await oscCount(page);
  await page.getByRole('button', { name: 'Apprendre' }).click(); // BottomNav blip (BottomNav.tsx)
  await expect.poll(() => oscCount(page), { timeout: 10_000 }).toBeGreaterThan(oscBefore);
  await expect.poll(() => liveMusic(page)).toBe(0);

  // Master "Sons et voix" OFF (settings.audioOn/audioOff = 'Activés'/'Coupés'):
  // sfx() short-circuits on !isEnabled() (lib/audio/index.ts), so nav cues stop
  // firing too — both channels are silenced together.
  await settingsEntry.click();
  await page.getByRole('button', { name: /Activés|Coupés/ }).click();
  await page.getByRole('button', { name: 'Retour' }).click();
  const oscBeforeMaster = await oscCount(page);
  await page.getByRole('button', { name: 'Apprendre' }).click();
  await page.waitForTimeout(500); // give a cue a chance to fire, if one were going to
  expect(await oscCount(page)).toBe(oscBeforeMaster);
  expect(await liveMusic(page)).toBe(0);
});
