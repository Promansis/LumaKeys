// PH-MUS-018 web proof: the measurement of ../electron/leadin.mjs through the built web server and
// Chromium. It starts its own server on port 3991 (loopback, LUMAKEYS_TRUST_UPSTREAM_AUTH=1) from APPDIR,
// a built checkout (`npm run build:web`), so it never uses the main checkout's dist/.
// Env: APPDIR, DATA (empty dir under $TMPDIR), LABEL, PLAYWRIGHT_BROWSERS_PATH. Run from $TMPDIR/pw.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const APPDIR = process.env.APPDIR; const DATA = process.env.DATA; const label = process.env.LABEL ?? 'web';
fs.mkdirSync(DATA, { recursive: true });
const { Midi } = createRequire(path.join(APPDIR, 'package.json'))('@tonejs/midi');
const m = new Midi(); m.header.setTempo(120);
const tr = m.addTrack();
[60, 62, 64, 65].forEach((n, i) => tr.addNote({ midi: n, time: 1 + i * 0.6, duration: 0.4, velocity: 0.8 }));
const song = path.join(DATA, 'lead-in-song.mid'); fs.writeFileSync(song, Buffer.from(m.toArray()));
const port = 3991; const base = `http://127.0.0.1:${port}`;
const log = fs.createWriteStream(path.join(DATA, 'server.log'));
const start = () => { const s = spawn('node', [path.join(APPDIR, 'dist/server/index.cjs')], { cwd: APPDIR, env: { ...process.env, PORT: String(port), LUMAKEYS_DATA_DIR: DATA, LUMAKEYS_TRUST_UPSTREAM_AUTH: '1' }, stdio: ['ignore', 'pipe', 'pipe'] }); s.stdout.pipe(log); s.stderr.pipe(log); return s; };
const srv = start();
for (let i = 0; i < 80; i++) { try { if ((await fetch(base + '/')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
const browser = await chromium.launch();
const errors = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message.slice(0, 200)}`));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[error] ${msg.text().slice(0, 200)}`); });
  const text = () => page.evaluate(() => document.body.innerText);
  const bridge = (fn, args = []) => page.evaluate(([f, a]) => window.appBridge[f](...a), [fn, args]);
  const skipGuide = async () => { if (/FIRST PRACTICE SETUP/i.test(await text())) await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForTimeout(500); };
  const measure = async (tag) => {
    console.log(`${label} | ${tag} | stored gameplay.leadInBeats =`, JSON.stringify(await bridge('getSetting', ['gameplay', 'leadInBeats'])));
    await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(900);
    if (!(await page.locator('h2.song-card-title', { hasText: /^lead-in-song$/ }).count())) {
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: /^Upload MIDI/ }).first().click();
      await (await chooser).setFiles(song); await page.waitForTimeout(2000);
    }
    const card = page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: /^lead-in-song$/ }) }).first();
    await card.getByRole('button', { name: 'Play', exact: true }).click(); await page.waitForTimeout(1500);
    await page.evaluate(() => document.activeElement?.blur());
    await page.evaluate(() => {
      window.__cd = { on: null, off: null };
      const iv = setInterval(() => { const el = document.querySelector('.countdown-overlay'); const t = performance.now();
        if (el && window.__cd.on === null) window.__cd.on = t;
        if (!el && window.__cd.on !== null && window.__cd.off === null) { window.__cd.off = t; clearInterval(iv); } }, 15);
    });
    await page.keyboard.press('Space');
    for (let i = 0; i < 40; i++) { await page.waitForTimeout(250); if ((await page.evaluate(() => window.__cd.off)) !== null) break; }
    const cd = await page.evaluate(() => window.__cd);
    const ms = cd.on !== null && cd.off !== null ? Math.round(cd.off - cd.on) : null;
    console.log(`${label} | ${tag} | count-in overlay ${ms} ms => lead-in beats ~ ${ms === null ? null : Math.round((ms - 3000) / 500)}`);
  };
  await page.goto(base + '/'); await page.waitForTimeout(2500); await skipGuide();
  await measure('fresh data dir and browser profile, setting never saved');
  await page.goto(base + '/'); await page.waitForTimeout(2500); await skipGuide();
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700);
  await page.locator('#settings-tab-gameplay').click(); await page.waitForTimeout(300);
  const sel = page.locator('#settings-panel-gameplay label').filter({ hasText: 'Count-in Before Start' }).locator('select');
  await sel.selectOption('0'); await page.waitForTimeout(800);
  console.log(`${label} | after choosing None, stored =`, JSON.stringify(await bridge('getSetting', ['gameplay', 'leadInBeats'])));
  await page.goto(base + '/'); await page.waitForTimeout(2500); await skipGuide();
  await measure('after saving 0 and reload');
} finally {
  await browser.close(); srv.kill('SIGTERM');
}
console.log('ERRORS', JSON.stringify(errors.slice(0, 8)));
console.log('DONE');
