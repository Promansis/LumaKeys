// WF-015 support: the Free Play WAV export is hidden in the web build, so no download can be produced
// there. This probe runs the product's own renderer, AudioEngine.renderRecordingToWav (Tone.Offline plus
// audioBufferToWav), in headless Chromium and validates the bytes it returns: RIFF header, PCM format,
// sample rate, length, and where the energy is (RMS per 100 ms window against the note onsets).
//
// A control build is made in memory with the repo's esbuild: the same file with three tokens changed inside
// renderRecordingToWav only (the Offline callback takes its context and schedules on `context.transport`
// instead of the global `tone.Transport`). Nothing in the repository is written; bundles go to $OUT.
//
// Why: tone's own Offline docs say events must be scheduled on the transport passed to the callback; the
// global `Transport` export is bound to the live context at import time.
//
// Run: DATA=$TMPDIR/p11/FB/data-wav OUT=$TMPDIR/p11/FB/wav PORT=3788 node wav-render-probe.mjs
import { withServer } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/media/storage/LumaKeys/package.json');
const esbuild = require('esbuild');

const data = process.env.DATA;
const out = process.env.OUT;
const port = Number(process.env.PORT || 3788);
fs.rmSync(data, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };

async function bundle(name, patched) {
  const plugins = patched ? [{ name: 'control', setup(b) { b.onLoad({ filter: /audioEngine\.ts$/ }, (a) => {
    let s = fs.readFileSync(a.path, 'utf8');
    const i = s.indexOf('async renderRecordingToWav'); const j = s.indexOf('private releaseNote');
    const seg = s.slice(i, j);
    const next = seg.replace('tone.Offline(async () => {', 'tone.Offline(async (offlineCtx) => {').replace('tone.Transport.schedule(', 'offlineCtx.transport.schedule(').replace('tone.Transport.start();', 'offlineCtx.transport.start();');
    if (next === seg || i < 0) throw new Error('control patch did not apply');
    return { contents: s.slice(0, i) + next + s.slice(j), loader: 'ts' };
  }); } }] : [];
  const file = path.join(out, `audio-engine.${name}.bundle.js`);
  await esbuild.build({
    stdin: { contents: "import { AudioEngine } from './src/lib/audio/audioEngine'; window.__AudioEngine = AudioEngine;", resolveDir: '/media/storage/LumaKeys', loader: 'ts' },
    bundle: true, format: 'iife', platform: 'browser', outfile: file, logLevel: 'error', define: { 'import.meta.env': '{}' }, plugins,
  });
  return file;
}
const bundles = { product: await bundle('product', false), control: await bundle('control', true) };

// C4 at 0.5 s, E4 at 1.0 s, G4 at 1.5 s; each 0.3 s long. Render duration 2 s (+3 s tail added by the product).
const NOTES = [60, 64, 67].map((midi, i) => ({ midi, velocity: 0.8, startTimeSec: 0.5 + i * 0.5, durationSec: 0.3 }));
const ONSET_WINDOWS = [5, 10, 15]; // 100 ms windows

function analyse(buf) {
  const str = (o, n) => buf.toString('ascii', o, o + n);
  const h = { riff: str(0, 4), wave: str(8, 4), fmt: str(12, 4), pcm: buf.readUInt16LE(20), channels: buf.readUInt16LE(22), rate: buf.readUInt32LE(24), byteRate: buf.readUInt32LE(28), blockAlign: buf.readUInt16LE(32), bits: buf.readUInt16LE(34), data: str(36, 4), dataLen: buf.readUInt32LE(40), riffLen: buf.readUInt32LE(4) };
  const frames = h.dataLen / h.blockAlign;
  const win = Math.round(h.rate / 10);
  let peak = 0; const rms = [];
  for (let w = 0; w * win < frames; w++) {
    let s = 0, n = 0;
    for (let f = w * win; f < Math.min(frames, (w + 1) * win); f++) { const v = buf.readInt16LE(44 + f * h.blockAlign) / 32768; s += v * v; n += 1; if (Math.abs(v) > peak) peak = Math.abs(v); }
    rms.push(Math.sqrt(s / n));
  }
  return { h, frames, seconds: frames / h.rate, peak, rms };
}

await withServer(data, async ({ page, base }) => {
  for (const which of ['product', 'control']) {
    for (let run = 1; run <= 3; run++) {
      await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
      await page.addScriptTag({ path: bundles[which] });
      await page.mouse.click(300, 300); // user gesture so the live AudioContext can run, as in the app
      const b64 = await page.evaluate(async (notes) => {
        const engine = new window.__AudioEngine();
        await engine.init();
        const bytes = await engine.renderRecordingToWav(notes, 2);
        let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        return btoa(s);
      }, NOTES);
      const buf = Buffer.from(b64, 'base64');
      if (run === 1) fs.writeFileSync(path.join(out, `${which}.wav`), buf);
      const a = analyse(buf);
      const profile = a.rms.map((r) => (r > 0.002 ? '#' : '.')).join('');
      if (run === 1) {
        console.log(`[${which}] header`, JSON.stringify(a.h), 'bytes', buf.length);
        check(`[${which}] header is a valid 16-bit PCM RIFF/WAVE with consistent sizes`, a.h.riff === 'RIFF' && a.h.wave === 'WAVE' && a.h.fmt === 'fmt ' && a.h.data === 'data' && a.h.pcm === 1 && a.h.bits === 16 && a.h.riffLen === buf.length - 8 && a.h.dataLen === buf.length - 44 && a.h.byteRate === a.h.rate * a.h.blockAlign, `${a.h.rate} Hz, ${a.h.channels} ch, ${a.seconds.toFixed(2)} s`);
        check(`[${which}] length is the recording plus the 3 s tail`, Math.abs(a.seconds - 5) < 0.1, `${a.seconds.toFixed(3)} s`);
      }
      const audible = ONSET_WINDOWS.map((w) => a.rms[w + 1] > 0.002 || a.rms[w + 2] > 0.002);
      console.log(`[${which}] run ${run} peak=${a.peak.toFixed(4)} 100ms windows: ${profile}  (onsets at windows ${ONSET_WINDOWS.join(', ')})`);
      check(`[${which}] run ${run}: energy after every note onset`, audible.every(Boolean), `onsets audible=${JSON.stringify(audible)}`);
    }
  }
}, { port, timeout: 60000 });
console.log(fails === 0 ? 'ALL CHECKS PASSED' : `${fails} CHECK(S) FAILED`);
