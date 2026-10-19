// Phase 11 lane D: runtime-parity evidence that can be gathered without Electron.
//
// 1. Web RPC/HTTP re-run for bridge methods whose implementation changed in the delta
//    (upload incl. .mscz, reattach, saveGameResult mode alias, export filename,
//    curriculum MIDI and pack manifests through the new static server, video ranges).
// 2. Web main-menu video playback state.
// 3. PH-ARCH-001 runtime proof on web: a rejected prerequisite RPC renders the
//    "Practice unavailable" panel with Retry and Main Menu, and Retry recovers.
// 4. Electron renderer approximation: the built `out/renderer/index.html` (IS_WEB=false)
//    loaded from file:// in Chromium with an injected appBridge that forwards RPC calls
//    to the isolated server. Proves where the video URL resolves under a file:// base.
//    It is not Electron: no preload/contextBridge, no asar, Chromium 141 not 124.
//
// Env: DATA (isolated data dir), FIX (fixture dir with "Lane D Title Probe.mid" and
// "score.mscz"), OUT (output dir for screenshots), PORT (default 3796).
import { withServer, text } from './harness.mjs';
import { chromium } from 'playwright';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = '/media/storage/LumaKeys';
const DATA = process.env.DATA;
const FIX = process.env.FIX;
const OUT = process.env.OUT;
const PORT = Number(process.env.PORT ?? 3796);
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
const rpc = async (base, method, args = []) => {
  const r = await fetch(`${base}/api/bridge/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) });
  return { status: r.status, body: await r.json() };
};
const upload = async (url, files) => {
  const form = new FormData();
  for (const [name, bytes] of files) form.append('files', new File([bytes], name));
  const r = await fetch(url, { method: 'POST', body: form });
  return { status: r.status, body: await r.json() };
};
const videoState = (page) => page.evaluate(async () => {
  const v = document.querySelector('[data-testid="main-menu-background-video"]');
  if (!v) return { present: false };
  const t0 = v.currentTime;
  await new Promise((r) => setTimeout(r, 1200));
  let frame = null;
  try {
    const c = document.createElement('canvas'); c.width = 32; c.height = 18;
    const g = c.getContext('2d'); g.drawImage(v, 0, 0, 32, 18);
    const d = g.getImageData(0, 0, 32, 18).data; let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) lit++;
    frame = `${lit}/576 sampled pixels non-dark`;
  } catch (e) { frame = `canvas read blocked: ${e.name}`; }
  return {
    present: true, src: v.getAttribute('src'), currentSrc: v.currentSrc, readyState: v.readyState,
    networkState: v.networkState, paused: v.paused, muted: v.muted, loop: v.loop,
    error: v.error ? v.error.code : null, videoWidth: v.videoWidth, videoHeight: v.videoHeight,
    duration: Number.isFinite(v.duration) ? Number(v.duration.toFixed(2)) : v.duration,
    advancedSec: Number((v.currentTime - t0).toFixed(2)),
    decodedFrames: v.getVideoPlaybackQuality?.().totalVideoFrames ?? null, frame,
  };
});

const midBytes = fs.readFileSync(path.join(FIX, 'Lane D Title Probe.mid'));
const msczBytes = fs.readFileSync(path.join(FIX, 'score.mscz'));

const errors = await withServer(DATA, async ({ page, ctx, base, errors }) => {
  // ---- 1. HTTP/RPC re-run -------------------------------------------------------
  const up = await upload(`${base}/api/midi/upload`, [['Lane D Title Probe.mid', midBytes], ['score.mscz', msczBytes], ['notes.txt', Buffer.from('hello')]]);
  console.log('BR-008 upload', up.status, JSON.stringify({ songs: up.body.songs?.map((s) => s.title), errors: up.body.errors, skipped: up.body.skipped }));
  const song = up.body.songs?.[0]; song.id = song.songId;
  const re = await upload(`${base}/api/midi/${song.id}/reattach`, [['score.mscz', msczBytes]]);
  console.log('BR-010 reattach .mscz', re.status, JSON.stringify(re.body));
  const reOk = await upload(`${base}/api/midi/${song.id}/reattach`, [['Renamed Probe.mid', midBytes]]);
  console.log('BR-010 reattach same bytes', reOk.status, JSON.stringify({ reattached: reOk.body.reattached?.map((s) => s.title), errors: reOk.body.errors }));

  const result = { songId: song.id, score: 1, accuracy: 50, maxCombo: 1, perfectHits: 1, goodHits: 0, okHits: 0, misses: 1, tempo: 1, durationSec: 2, measureAccuracy: [] };
  for (const mode of ['luma-keys', 'piano-hero', 'normal']) {
    const r = await rpc(base, 'saveGameResult', [{ ...result, mode }]);
    console.log('BR-013 saveGameResult mode', mode, r.status, JSON.stringify(r.body).slice(0, 160));
  }
  console.log('BR-014 getGameResults modes', JSON.stringify((await rpc(base, 'getGameResults', [song.id])).body.result.map((r) => r.mode)));

  const exp = await fetch(`${base}/api/library/export`);
  const expBody = await exp.json();
  console.log('BR-057 export', exp.status, JSON.stringify({ filename: expBody.result.filename, target: expBody.result.target, songs: expBody.backup.songs.length, midiFiles: Object.keys(expBody.backup.midiFiles ?? {}).length }));

  const cur = await fetch(`${base}/curriculum-midis/ode-to-joy.mid`);
  const curBytes = Buffer.from(await cur.arrayBuffer());
  const outCur = fs.readFileSync(path.join(REPO, 'out/renderer/curriculum-midis/ode-to-joy.mid'));
  console.log('BR-060 curriculum web', cur.status, cur.headers.get('content-type'), curBytes.length, 'sha', sha(curBytes), 'electron out/renderer copy sha', sha(outCur), 'equal', curBytes.equals(outCur));
  const pubCur = fs.readdirSync(path.join(REPO, 'public/curriculum-midis')).sort();
  const outCurList = fs.readdirSync(path.join(REPO, 'out/renderer/curriculum-midis')).sort();
  console.log('BR-060 curriculum inventory public', pubCur.length, 'out/renderer', outCurList.length, 'same', JSON.stringify(pubCur) === JSON.stringify(outCurList));

  const man = await fetch(`${base}/instrument-packs/flute/manifest.json`);
  const manJson = await man.json();
  const asset = await fetch(`${base}${manJson.assets[0].url}`);
  console.log('BR-067 manifest', man.status, man.headers.get('content-type'), man.headers.get('cache-control'), 'asset', manJson.assets[0].url, asset.status, asset.headers.get('content-type'));

  const vurl = `${base}/assets/main-menu/mainmenu-neonbackground.webm`;
  const pubVideo = fs.readFileSync(path.join(REPO, 'public/assets/main-menu/mainmenu-neonbackground.webm'));
  const full = await fetch(vurl);
  const fullBytes = Buffer.from(await full.arrayBuffer());
  console.log('VIDEO full', full.status, full.headers.get('content-type'), full.headers.get('accept-ranges'), full.headers.get('cache-control'), fullBytes.length, 'equalsPublic', fullBytes.equals(pubVideo));
  for (const range of ['bytes=0-1023', 'bytes=-16', `bytes=${pubVideo.length - 10}-`, `bytes=${pubVideo.length}-`, 'bytes=0-1,4-5']) {
    const r = await fetch(vurl, { headers: { Range: range } });
    const b = Buffer.from(await r.arrayBuffer());
    let match = null;
    const m = r.headers.get('content-range')?.match(/bytes (\d+)-(\d+)\//);
    if (m) match = b.equals(pubVideo.subarray(Number(m[1]), Number(m[2]) + 1));
    console.log('VIDEO range', range, r.status, r.headers.get('content-range'), b.length, 'sliceMatches', match);
  }
  const deep = await fetch(`${base}/assets/main-menu/does-not-exist.webm`);
  console.log('VIDEO missing asset', deep.status, deep.headers.get('content-type'));

  // ---- 2. Web main-menu video ------------------------------------------------
  await rpc(base, 'setSetting', ['onboarding', 'setupComplete', 'true']);
  const videoResponses = [];
  page.on('response', (r) => { if (r.url().endsWith('.webm')) videoResponses.push(`${r.status()} ${r.headers()['content-range'] ?? '-'} ${r.headers()['content-type']}`); });
  await page.setViewportSize({ width: 1480, height: 960 });
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="main-menu-background-video"]');
  console.log('WEB video', JSON.stringify(await videoState(page)));
  console.log('WEB video responses', JSON.stringify(videoResponses));
  await page.screenshot({ path: path.join(OUT, 'shots', 'web-main-menu.png') });

  // ---- 3. PH-ARCH-001 rejected prerequisite on web ---------------------------
  const openSong = async () => {
    await page.getByRole('button', { name: 'Play Songs', exact: true }).click();
    await page.waitForTimeout(800);
    const card = page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: /^Lane D Title Probe$/ }) });
    await card.getByRole('button', { name: 'Learn', exact: true }).click();
    await page.waitForTimeout(1500);
  };
  const panel = async () => page.evaluate(() => {
    const p = document.querySelector('.game-load-error');
    return p ? { text: p.innerText.replace(/\n+/g, ' | '), buttons: [...p.querySelectorAll('button')].map((b) => b.textContent.trim()), role: p.getAttribute('role') } : null;
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 160)));
  for (const method of ['getUserStats', 'getCustomFingerings', 'getSetting']) {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    const pattern = `**/api/bridge/${method}`;
    await page.route(pattern, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'storage unavailable' }) }));
    await openSong();
    const before = await panel();
    console.log('PH-ARCH-001', method, 'rejected ->', JSON.stringify(before));
    await page.screenshot({ path: path.join(OUT, 'shots', `arch001-${method}.png`) });
    if (method === 'getUserStats') {
      await page.getByRole('button', { name: 'Main Menu', exact: true }).click();
      await page.waitForTimeout(800);
      console.log('PH-ARCH-001', method, 'Main Menu ->', (await text(page)).includes('Play Songs') ? 'main menu shown' : 'not main menu');
      await openSong();
      console.log('PH-ARCH-001', method, 'reopen still rejected ->', JSON.stringify(await panel()));
    }
    await page.unroute(pattern);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.waitForTimeout(1500);
    const after = await panel();
    const canvas = await page.$$eval('canvas', (c) => c.length);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    const status = await page.evaluate(() => document.querySelector('.immersive-overlay')?.innerText.match(/Loaded [^\n]{0,100}|Unable to load[^\n]{0,100}/)?.[0] ?? null);
    await page.keyboard.press('Escape');
    console.log('PH-ARCH-001', method, 'after unroute + Retry ->', JSON.stringify({ panel: after, canvases: canvas, status }));
  }
  console.log('PH-ARCH-001 pageerrors (unhandled)', JSON.stringify(pageErrors));

  // ---- 4. Electron renderer approximation over file:// -----------------------
  const browser2 = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  try {
    const ctx2 = await browser2.newContext({ viewport: { width: 1480, height: 960 } });
    const page2 = await ctx2.newPage();
    const fileErrors = [];
    const fileRequests = [];
    page2.on('pageerror', (e) => fileErrors.push(`[pageerror] ${e.message.slice(0, 200)}`));
    page2.on('console', (m) => { if (m.type() === 'error') fileErrors.push(`[console] ${m.text().slice(0, 200)}`); });
    page2.on('requestfailed', (r) => fileErrors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
    page2.on('request', (r) => { if (r.url().includes('main-menu')) fileRequests.push(r.url()); });
    await page2.exposeFunction('__laneDRpc', async (method, args) => {
      const r = await rpc(base, method, args);
      if (r.status !== 200) throw new Error(r.body.error ?? `status ${r.status}`);
      return r.body.result;
    });
    await page2.addInitScript(() => {
      const local = {
        getInstrumentSamplePackStatuses: async () => [],
        resolveInstrumentSampleSource: async () => null,
        listAudioFiles: async () => [],
        onImportProgress: () => () => {},
      };
      window.appBridge = new Proxy({}, {
        get(_t, p) {
          if (typeof p !== 'string') return undefined;
          if (p in local) return local[p];
          return (...args) => window.__laneDRpc(p, args);
        },
      });
    });
    const fileUrl = pathToFileURL(path.join(REPO, 'out/renderer/index.html')).toString();
    await page2.goto(fileUrl, { waitUntil: 'load' });
    await page2.waitForSelector('[data-testid="main-menu-background-video"]', { timeout: 10000 });
    console.log('FILE baseURI', await page2.evaluate(() => document.baseURI));
    console.log('FILE video', JSON.stringify(await videoState(page2)));
    console.log('FILE css --main-menu-background-image', await page2.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--main-menu-background-image').slice(0, 260)));
    console.log('FILE poster webp/png load', JSON.stringify(await page2.evaluate(async () => {
      const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(`ok ${i.naturalWidth}x${i.naturalHeight}`); i.onerror = () => r('error'); i.src = u; });
      return {
        webp: await load(new URL('assets/main-menu/mainmenu-neonbackground.webp', document.baseURI).href),
        png: await load(new URL('assets/main-menu/mainmenu-neonbackground.png', document.baseURI).href),
      };
    })));
    console.log('FILE negative control absolute path', JSON.stringify(await page2.evaluate(async () => {
      const v = document.createElement('video'); v.muted = true; v.src = '/assets/main-menu/mainmenu-neonbackground.webm';
      document.body.append(v);
      await new Promise((r) => { v.onerror = r; v.onloadeddata = r; setTimeout(r, 3000); });
      const out = { currentSrc: v.currentSrc, error: v.error ? v.error.code : null, readyState: v.readyState };
      v.remove();
      return out;
    })));
    console.log('FILE main-menu requests', JSON.stringify(fileRequests));
    console.log('FILE menu text sample', JSON.stringify((await text(page2)).split('\n').slice(0, 6)));
    await page2.screenshot({ path: path.join(OUT, 'shots', 'file-main-menu.png') });
    console.log('FILE errors', JSON.stringify(fileErrors));
  } finally {
    await browser2.close();
  }
}, { port: PORT, timeout: 10000 });

console.log('WEB harness errors', JSON.stringify(errors.filter((e) => !e.includes('500 (Internal Server Error)'))));
