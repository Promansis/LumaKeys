// Sitting 3 item 5 (BR-008, MOD-009, PH-PAR-002): Library "Upload MIDI / MSCZ", cancel the file dialog, then try again.
// The app (src/renderer/webBridge.ts pickFiles) detects a cancelled picker ONLY through the file input's `cancel` event.
// MODE=synthetic : Playwright intercepts the chooser (filechooser listener), so the browser never opens a dialog; the
//                  cancel is a hand-dispatched `new Event('cancel')` on the same input (what the browser fires on Cancel).
// MODE=nolistener: headless, NO filechooser listener (nothing intercepts); records whether the browser itself fires cancel.
// MODE=real      : headed on DISPLAY (Xvfb), no listener, so the native file dialog really opens; Cancel is a real X key
//                  event (Escape via XTEST, x/xkey.py) into that dialog; the second try types a path into the GTK dialog.
// Env: DATA, PORT, SHOTS, FIX, MODE, XKEY (path to xkey.py), SAMPLE (lower-case path to a .mid, real mode).
import { withServer, text, browserName } from './sitting3-harness.mjs';
import { spawnSync } from 'node:child_process';
const MODE = process.env.MODE || 'synthetic';
const FILE = process.env.SAMPLE || `${process.env.FIX}/pmus-16.mid`;
const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' }).stdout || '';
const wins = () => sh('xwininfo', ['-display', process.env.DISPLAY, '-root', '-tree']).split('\n').filter((l) => /"/.test(l) && !/has no name/.test(l)).map((l) => l.trim().replace(/\s+/g, ' ').slice(0, 90));
const xkey = (...k) => console.log('   X input:', sh('python3', ['-I', process.env.XKEY, process.env.DISPLAY, ...k]).trim());
const opts = MODE === 'real' ? { launch: { headless: false }, ...(browserName === 'chromium' ? { context: { permissions: ['midi'] } } : {}) } : {};
const xshot = (name) => spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-i', process.env.DISPLAY, '-frames:v', '1', `${process.env.SHOTS}/item5-${browserName}-real-${name}.png`]);
await withServer(process.env.DATA, async ({ page: p, base }) => {
  // Observer only: logs which events the browser itself fires on each file input (does not change app behaviour).
  await p.addInitScript(() => { window.__ev = []; const o = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function (...a) { if (this.type === 'file') { const t0 = performance.now(); for (const n of ['change', 'cancel']) this.addEventListener(n, (e) => window.__ev.push(`${n}(trusted=${e.isTrusted}, files=${this.files.length}) +${Math.round(performance.now() - t0)}ms`)); window.__ev.push('click()'); } return o.apply(this, a); }; });
  const uploads = []; p.on('request', (r) => { if (/\/api\/midi\/upload/.test(r.url())) uploads.push(r.method()); });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  if (await p.getByRole('button', { name: 'Skip for now' }).count()) { await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForTimeout(500); }
  await p.getByRole('button', { name: 'Play Songs', exact: true }).first().click(); await p.waitForTimeout(800);
  const btn = p.getByRole('button', { name: /^(Importing\.\.\.|Upload MIDI)/ }).last();
  const state = async () => p.evaluate(() => { const b = [...document.querySelectorAll('button.primary-button')].find((x) => /Importing|Upload MIDI/.test(x.textContent)); return b ? { text: b.textContent.trim(), disabled: b.disabled } : null; });
  const waitReturn = async (label, maxMs = 5000) => {
    const t0 = Date.now(); let s = await state();
    while ((s.text.startsWith('Importing') || s.disabled) && Date.now() - t0 < maxMs) { await p.waitForTimeout(25); s = await state(); }
    const ms = Date.now() - t0; console.log(`   ${label}: after ${ms}ms button = ${JSON.stringify(s)}${ms >= maxMs ? '  (STILL stuck after ' + maxMs + 'ms)' : ''}`);
    return { ms, s };
  };
  console.log(`=== ${browserName} MODE=${MODE} ${MODE === 'real' ? 'DISPLAY=' + process.env.DISPLAY : ''}`);
  console.log('initial button', JSON.stringify(await state()));
  const before = new Set(wins());
  if (MODE === 'synthetic') {
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Upload MIDI / MSCZ' }).click()]);
    await p.waitForTimeout(300);
    console.log('   chooser intercepted by Playwright; button during pick:', JSON.stringify(await state()), '(multiple=' + fc.isMultiple() + ')');
    const n = await p.evaluate(() => { const i = document.querySelector('body > input[type=file]'); if (!i) return 0; i.dispatchEvent(new Event('cancel', { bubbles: true })); return 1; });
    console.log('   dispatched cancel on hidden input:', n === 1);
    const r = await waitReturn('after cancel');
    console.log('   status text:', JSON.stringify((await text(p)).match(/(Import canceled|No files imported)[^\n]*/)?.[0] ?? null));
    // second try
    const [fc2] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: 'Upload MIDI / MSCZ' }).click()]);
    await fc2.setFiles(FILE); await waitReturn('second try, after setFiles');
  } else if (MODE === 'nolistener') {
    await p.getByRole('button', { name: 'Upload MIDI / MSCZ' }).click();
    const r = await waitReturn('click with no chooser listener (does the browser itself cancel?)', 6000);
    console.log('   x-windows new:', JSON.stringify(wins().filter((w) => !before.has(w))));
  } else {
    await p.getByRole('button', { name: 'Upload MIDI / MSCZ' }).click(); await p.waitForTimeout(2500);
    console.log('   button while dialog open:', JSON.stringify(await state()));
    const nw = wins().filter((w) => !before.has(w)); console.log('   new X windows after click:', JSON.stringify(nw));
    xshot('dialog-open'); xkey('Escape'); await p.waitForTimeout(100);
    const r = await waitReturn('after real Escape in the native dialog', 6000);
    console.log('   status text:', JSON.stringify((await text(p)).match(/(Import canceled|No files imported)[^\n]*/)?.[0] ?? null));
    console.log('   X windows left after cancel:', JSON.stringify(wins().filter((w) => !before.has(w))));
    await p.getByRole('button', { name: 'Upload MIDI / MSCZ' }).click(); await p.waitForTimeout(2500);
    console.log('   second try, dialog windows:', JSON.stringify(wins().filter((w) => !before.has(w))));
    xkey('ctrl+l'); await p.waitForTimeout(500); xkey('text:' + FILE); await p.waitForTimeout(500); xshot('second-typed'); xkey(...(process.env.SUBMIT || 'Return').split(',')); await p.waitForTimeout(300); xshot('second-after'); console.log('   X windows 300ms after Return:', JSON.stringify(wins().filter((w) => !before.has(w))), '| state', JSON.stringify(await state()), '| status', JSON.stringify((await text(p)).match(/(Import canceled|No files imported|Imported)[^\n]*/)?.[0] ?? null));
    await waitReturn('second try after typing the path + Enter', 8000);
  }
  await p.waitForTimeout(1500);
  console.log('   browser-level input events seen by the page:', JSON.stringify(await p.evaluate(() => window.__ev)), '| POST /api/midi/upload requests:', uploads.length);
  const cards = await p.locator('h2.song-card-title').allInnerTexts();
  console.log('   songs in Library after second try:', JSON.stringify(cards), '| status:', JSON.stringify((await text(p)).match(/(Imported|import|added)[^\n]*/i)?.[0] ?? null));
  await p.screenshot({ path: `${process.env.SHOTS}/item5-${browserName}-${MODE}.png` });
}, { ...opts, port: Number(process.env.PORT) });
