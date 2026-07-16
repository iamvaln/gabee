// e2e/tests/kid-ambient-music.spec.ts
// Ambient music (audio phase E): instrument AudioContext before the app loads,
// then assert music sources against real navigation. Music = looping
// AudioBufferSource; cues = OscillatorNodes (the discriminator).
import { test, expect, type Page } from '@playwright/test';
import { FIXTURES } from '../helpers/db';

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

async function loginToHub(page: Page) {
  await page.goto('/');
  await page.getByPlaceholder('Adresse e-mail').fill(FIXTURES.parentEmail);
  await page.getByPlaceholder('Mot de passe').fill(FIXTURES.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByRole('button', { name: /Plus tard/ }).click();
  await page.getByRole('button', { name: FIXTURES.childName }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(INSTRUMENT);
});

test('ambient music starts on hub, stops in a session, resumes after', async ({ page }) => {
  await loginToHub(page);
  // Autoplay policy: the AudioContext may still be suspended when the hub
  // evaluates its zone; the engine arms a one-shot gesture retry (pointerdown
  // on document — music.ts). This tap is that gesture. Coordinates matter: a
  // bare body.click() hits the viewport CENTER, which on the hub is a module
  // tile and navigates away — tap the top-left chrome padding instead.
  await page.mouse.click(1, 1);
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBeGreaterThan(0);

  // Enter a translation session. Translation has no sub-mode picker — Hub's
  // module tile auto-starts the next lesson directly for a profile with no
  // prior translation progress (App.tsx enterModule → startOrBrowse: tab is
  // 'apprendre' and a next-lesson exists, so it goes straight to
  // translation_session, never surfacing the level/lesson maps at all).
  await page.locator('button.module-tile[data-module="translation"]').click();
  await expect(page.locator('.session-answers .answer-btn').first()).toBeVisible();
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBe(0);

  // Back out to ambient territory — music must return. The SPA pushes real
  // history entries per route (App.tsx routeToPath/popstate), so browser back
  // pops straight back to the hub.
  await page.goBack();
  await expect.poll(() => liveMusic(page), { timeout: 15_000 }).toBeGreaterThan(0);
});

test('music switch silences ambience but keeps cues; master kills both', async ({ page }) => {
  await loginToHub(page);
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
