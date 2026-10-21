// PH-MUS-018 runtime check: how long does the Play count-in overlay stay up on a fresh profile
// (no saved gameplay.leadInBeats) and after saving "None" (0)? The overlay shows 3-2-1 for 3000 ms
// and then stays until the lead-in beats (60000 / (bpm * tempo) ms each) have run, so
// duration ~ 3000 + leadInBeats * 500 ms for the 120 BPM song used here.
// Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE (empty, under $TMPDIR) set; LABEL names the build.
// Before 8a0a764 a fresh profile shows about 3000 ms (no lead-in beats).
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { Midi } = createRequire(path.join(REPO, 'package.json'))('@tonejs/midi');
const profile = process.env.PROFILE;
const label = process.env.LABEL ?? 'build';
fs.mkdirSync(profile, { recursive: true });
const m = new Midi(); m.header.setTempo(120);
const tr = m.addTrack();
[60, 62, 64, 65].forEach((n, i) => tr.addNote({ midi: n, time: 1 + i * 0.6, duration: 0.4, velocity: 0.8 }));
const song = path.join(profile, 'lead-in-song.mid');
fs.writeFileSync(song, Buffer.from(m.toArray()));
const bridge = (page, fn, args = []) => page.evaluate(([f, a]) => window.appBridge[f](...a).then((r) => r, (e) => ({ error: String(e) })), [fn, args]);

await withElectron(profile, async (h) => {
  let { page } = h;
  await page.waitForTimeout(2500);
  const skipGuide = async () => { if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForTimeout(500); };
  await skipGuide();
  const measure = async (tag) => {
    console.log(`${label} | ${tag} | stored gameplay.leadInBeats =`, JSON.stringify(await bridge(page, 'getSetting', ['gameplay', 'leadInBeats'])));
    await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(900);
    if (!(await page.locator('h2.song-card-title', { hasText: /^lead-in-song$/ }).count())) {
      await h.stubOpen([song]);
      await page.getByRole('button', { name: 'Upload MIDI', exact: true }).click(); await page.waitForTimeout(1800);
    }
    const card = page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: /^lead-in-song$/ }) }).first();
    await card.getByRole('button', { name: 'Play', exact: true }).click(); await page.waitForTimeout(1500);
    await page.evaluate(() => document.activeElement?.blur());
    await page.evaluate(() => {
      window.__cd = { on: null, off: null, first: null };
      const iv = setInterval(() => {
        const el = document.querySelector('.countdown-overlay');
        const t = performance.now();
        if (el && window.__cd.on === null) { window.__cd.on = t; window.__cd.first = el.textContent; }
        if (!el && window.__cd.on !== null && window.__cd.off === null) { window.__cd.off = t; clearInterval(iv); }
      }, 15);
    });
    await page.keyboard.press('Space');
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(250); if ((await page.evaluate(() => window.__cd.off)) !== null) break; }
    const cd = await page.evaluate(() => window.__cd);
    const ms = cd.on !== null && cd.off !== null ? Math.round(cd.off - cd.on) : null;
    const beats = ms === null ? null : Math.round((ms - 3000) / 500);
    console.log(`${label} | ${tag} | count-in overlay ${ms} ms (3-2-1 = 3000 ms + lead-in beats x 500 ms) => lead-in beats ~ ${beats}`);
    return beats;
  };
  await measure('fresh profile, setting never saved');
  // Settings UI readout on the same fresh profile
  await page.reload(); await page.waitForTimeout(2500); await skipGuide();
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700);
  await page.locator('#settings-tab-gameplay').click(); await page.waitForTimeout(300);
  const sel = page.locator('#settings-panel-gameplay label').filter({ hasText: 'Count-in Before Start' }).locator('select');
  console.log(`${label} | Settings > Gameplay > Count-in Before Start shows`, JSON.stringify(await sel.inputValue()));
  await sel.selectOption('0'); await page.waitForTimeout(800);
  console.log(`${label} | after choosing None, stored =`, JSON.stringify(await bridge(page, 'getSetting', ['gameplay', 'leadInBeats'])));
  ({ page } = await h.relaunch());
  await page.waitForTimeout(2500); await skipGuide();
  await measure('after saving 0 and relaunch');
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 8)));
});
console.log('DONE');
