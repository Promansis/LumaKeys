// Desktop half of WF-015: record in Free Play, Export MIDI and Export WAV through the
// save dialog, then read both files back. Gives the PH-MUS-007 file-level proof.
// Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE (under $TMPDIR) set.
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const { Midi } = createRequire(path.join(REPO, 'package.json'))('@tonejs/midi');
const profile = process.env.PROFILE;
const KEYNAME = { Comma: 'C4', Period: 'D4', Slash: 'E4', KeyQ: 'F4', KeyW: 'G4', KeyE: 'A4', KeyR: 'B4', KeyT: 'C5' };
const SCRIPT = [['Comma', 0, 300], ['Slash', 500, 300], ['KeyW', 1000, 300], ['KeyT', 1600, 500]];

function wavStats(buf) {
  const fmt = buf.indexOf('fmt '); const data = buf.indexOf('data');
  const channels = buf.readUInt16LE(fmt + 10); const rate = buf.readUInt32LE(fmt + 12); const bits = buf.readUInt16LE(fmt + 22); const format = buf.readUInt16LE(fmt + 8);
  const size = buf.readUInt32LE(data + 4); const start = data + 8;
  let peak = 0; let nonzero = 0; let sumsq = 0; const n = Math.min(size, buf.length - start) / (bits / 8);
  for (let i = 0; i < n; i++) {
    const v = bits === 16 ? buf.readInt16LE(start + i * 2) / 32768 : bits === 32 && format === 3 ? buf.readFloatLE(start + i * 4) : 0;
    const a = Math.abs(v); if (a > peak) peak = a; if (a > 1e-4) nonzero++; sumsq += v * v;
  }
  return { format, channels, rate, bits, seconds: +(n / channels / rate).toFixed(3), peak: +peak.toFixed(5), rms: +Math.sqrt(sumsq / Math.max(1, n)).toFixed(6), nonzeroSamples: nonzero };
}

await withElectron(profile, async (h) => {
  const { page } = h;
  await page.waitForTimeout(2500);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Free Play', exact: true }).click();
  await page.waitForTimeout(1500);
  const overlayVal = (label) => page.locator('.immersive-overlay-panel .status-card').filter({ hasText: label }).locator('strong').first().textContent();
  const openOverlay = async () => { if (!(await page.locator('#free-play-overlay-panel').count())) { await page.keyboard.press('Escape'); await page.waitForSelector('#free-play-overlay-panel'); await page.waitForTimeout(250); } };
  const closeOverlay = async () => { await page.getByRole('button', { name: 'Resume' }).click(); await page.waitForTimeout(300); await page.locator('canvas').first().click({ position: { x: 640, y: 300 } }).catch(() => {}); await page.waitForTimeout(200); };
  await openOverlay();
  const buttons = (await page.locator('#free-play-overlay-panel button').allTextContents()).map((b) => b.trim()).filter(Boolean);
  console.log('overlay buttons', JSON.stringify(buttons));
  // export before recording
  console.log('before recording: Export MIDI disabled', await page.getByRole('button', { name: 'Export MIDI' }).isDisabled(), 'Export WAV disabled', await page.getByRole('button', { name: 'Export WAV' }).isDisabled());
  await page.getByRole('button', { name: 'Record', exact: true }).click(); await page.waitForTimeout(300);
  await closeOverlay();
  const t0 = Date.now();
  const events = SCRIPT.flatMap(([code, at, hold]) => [{ at, code, dir: 'down' }, { at: at + hold, code, dir: 'up' }]).sort((a, b) => a.at - b.at);
  for (const ev of events) { const w = ev.at - (Date.now() - t0); if (w > 0) await page.waitForTimeout(w); if (ev.dir === 'down') await page.keyboard.down(ev.code); else await page.keyboard.up(ev.code); }
  await page.waitForTimeout(300);
  await openOverlay();
  await page.getByRole('button', { name: 'Stop Recording' }).click(); await page.waitForTimeout(400);
  console.log('captured', JSON.stringify((await overlayVal('Captured'))?.trim()));

  const midPath = path.join(profile, 'take.mid');
  await h.stubSave(midPath);
  await page.getByRole('button', { name: 'Export MIDI' }).click(); await page.waitForTimeout(1000);
  console.log('Export MIDI status', JSON.stringify(await overlayVal('Status')));
  const midi = new Midi(fs.readFileSync(midPath));
  const notes = midi.tracks.flatMap((t) => t.notes.map((n) => ({ name: n.name, t: +n.time.toFixed(3), d: +n.duration.toFixed(3), v: +n.velocity.toFixed(2) })));
  console.log('MIDI file notes', JSON.stringify(notes), 'expected order', JSON.stringify(SCRIPT.map(([c]) => KEYNAME[c])));
  const gaps = notes.slice(1).map((n, i) => Math.round((n.t - notes[i].t) * 1000));
  console.log('MIDI onset gaps ms', JSON.stringify(gaps), 'played gaps ms', JSON.stringify(SCRIPT.slice(1).map((s, i) => s[1] - SCRIPT[i][1])));

  await h.stubSave(null);
  await page.getByRole('button', { name: 'Export MIDI' }).click(); await page.waitForTimeout(600);
  console.log('Export MIDI cancelled status', JSON.stringify(await overlayVal('Status')));

  const wavPath = path.join(profile, 'take.wav');
  await h.stubSave(wavPath);
  await page.getByRole('button', { name: 'Export WAV' }).click();
  const start = Date.now();
  while (Date.now() - start < 30000 && !/WAV saved|failed|cancelled/i.test((await overlayVal('Status')) ?? '')) await page.waitForTimeout(300);
  console.log('Export WAV status', JSON.stringify(await overlayVal('Status')), 'after ms', Date.now() - start);
  if (fs.existsSync(wavPath)) console.log('WAV stats', JSON.stringify(wavStats(fs.readFileSync(wavPath))), 'bytes', fs.statSync(wavPath).size);
  await page.screenshot({ path: path.join(profile, 'freeplay-export.png') });
  // Same-renderer control: the PH-MUS-007 probe bundles (product and the one-change control
  // that schedules on the Offline context's transport), rendered inside this Electron page.
  const bundleDir = process.env.WAV_BUNDLES;
  if (bundleDir) {
    const NOTES = [60, 64, 67].map((m, i) => ({ midi: m, velocity: 0.8, startTimeSec: 0.5 + i * 0.5, durationSec: 0.3 }));
    for (const which of ['product', 'control']) {
      await page.evaluate(() => { delete window.__AudioEngine; });
      await page.addScriptTag({ content: fs.readFileSync(path.join(bundleDir, `audio-engine.${which}.bundle.js`), 'utf8') });
      const b64 = await page.evaluate(async (notes) => {
        const engine = new window.__AudioEngine();
        await engine.init();
        const bytes = await engine.renderRecordingToWav(notes, 2);
        let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(s);
      }, NOTES);
      console.log(`same-renderer ${which} bundle WAV`, JSON.stringify(wavStats(Buffer.from(b64, 'base64'))));
    }
  }
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 12)));
});
console.log('DONE');
