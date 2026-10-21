// PH-SEC-003 (desktop): the built renderer runs under the Content-Security-Policy <meta>
// and every source it uses still loads: main-menu video, audio engine start (the reverb
// AudioWorklet and the Tone.js clock worker), the bundled Salamander sampler, a Soundboard
// clip and a backing track picked from outside the app. Reports Electron's insecure-CSP
// warning, every CSP violation, and whether string eval is refused.
// Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE (under $TMPDIR) set.
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const profile = process.env.PROFILE;
fs.rmSync(profile, { recursive: true, force: true });
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };

await withElectron(profile, async (h) => {
  const { page } = h;
  const engine = [];
  page.on('console', (m) => { if (/AudioEngine/.test(m.text())) engine.push(m.text().replace(/\n[\s\S]*/, '').slice(0, 110)); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ directive: e.violatedDirective, blocked: e.blockedURI }));
  });
  await page.waitForTimeout(2000);
  await page.reload();
  await page.waitForTimeout(2500);
  const violations = async () => page.evaluate(() => window.__csp);

  const meta = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? null);
  check('renderer carries the CSP <meta>', Boolean(meta), meta ?? 'absent');
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForTimeout(1500);
  const video = await page.evaluate(() => {
    const v = document.querySelector('[data-testid="main-menu-background-video"]');
    return v ? { readyState: v.readyState, error: v.error?.code ?? null, src: v.currentSrc.replace(/^.*\/out\//, '<out>/') } : null;
  });
  check('main-menu video loads', Boolean(video && video.error === null && video.readyState >= 2), JSON.stringify(video));

  // Free Play: the first key starts the engine and loads the default Salamander sampler.
  await page.getByRole('button', { name: 'Free Play', exact: true }).click();
  await page.waitForTimeout(1500);
  await page.locator('canvas').first().click({ position: { x: 640, y: 300 } }).catch(() => {});
  await page.keyboard.down('Comma'); await page.waitForTimeout(150); await page.keyboard.up('Comma');
  await page.waitForTimeout(6000);
  check('audio engine starts and the bundled sampler loads', engine.some((l) => /Initialization complete/.test(l)) && engine.some((l) => /Sampler loaded successfully/.test(l)) && !engine.some((l) => /Failed|synth fallback/.test(l)),
    JSON.stringify(engine.filter((l) => /Initializ|ampler from|loaded successfully|Failed|fallback/.test(l))));

  // Backing track from a folder outside the app, loaded as a file:// URL.
  const track = path.join(profile, 'music', 'backing.mp3');
  fs.mkdirSync(path.dirname(track), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'public/soundboard/animals/alligator.mp3'), track);
  await h.stubOpen([track]);
  if (!(await page.locator('#free-play-overlay-panel').count())) { await page.keyboard.press('Escape'); await page.waitForSelector('#free-play-overlay-panel'); await page.waitForTimeout(250); }
  await page.getByRole('button', { name: 'Load Track' }).click();
  await page.waitForTimeout(3000);
  const status = await page.locator('.immersive-overlay-panel .status-card').filter({ hasText: 'Status' }).locator('strong').first().textContent().catch(() => '?');
  check('backing track picked from outside the app loads', /Backing track loaded: backing\.mp3/.test(status ?? ''), JSON.stringify(status));
  await page.getByRole('button', { name: /Main Menu/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);

  // Soundboard clips (Tone.js Player over file://).
  const clips = [];
  page.on('requestfinished', (r) => { if (r.url().includes('/soundboard/')) clips.push(`ok ${r.url().replace(/^.*\/soundboard\//, '')}`); });
  page.on('requestfailed', (r) => { if (r.url().includes('/soundboard/')) clips.push(`failed ${r.url().replace(/^.*\/soundboard\//, '')} ${r.failure()?.errorText}`); });
  await page.getByRole('button', { name: 'Soundboard', exact: true }).first().click();
  await page.waitForTimeout(1200);
  for (const k of ['Comma', 'Period']) { await page.keyboard.press(k); await page.waitForTimeout(900); }
  check('Soundboard clips load', clips.some((c) => /^ok .*\.(mp3|ogg)$/.test(c)) && !clips.some((c) => c.startsWith('failed')), JSON.stringify(clips.slice(0, 4)));

  const seen = await violations();
  const consoleCsp = h.errors.filter((e) => /Content Security Policy|Refused to/i.test(e));
  check('no CSP violation while using the app', seen.length === 0 && consoleCsp.length === 0, JSON.stringify({ seen, consoleCsp }));
  check('no Electron insecure-CSP warning', !h.errors.some((e) => /Insecure Content-Security-Policy/.test(e)));

  const evalRan = await page.evaluate(async () => {
    window.__evalRan = false;
    setTimeout('window.__evalRan = true', 0);
    await new Promise((r) => setTimeout(r, 300));
    return window.__evalRan;
  });
  check('string eval is refused', evalRan === false && (await violations()).some((v) => v.blocked === 'eval'), String(evalRan));
  console.log('ERRORS', JSON.stringify(h.errors.slice(0, 12)));
});
console.log(fails === 0 ? 'DONE: all checks passed' : `DONE: ${fails} check(s) failed`);
process.exitCode = fails === 0 ? 0 : 1;
