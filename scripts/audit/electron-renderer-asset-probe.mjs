// Phase 11 lane D probe: does the main-menu background video (and its webp/png still)
// load in a real Electron renderer from file://, both from the unpacked out/ tree and
// from an asar archive laid out like the packaged app (out/renderer inside app.asar)?
//
// The real out/main bundle needs better-sqlite3 built for the Electron ABI, and the only
// copy in node_modules is built for Node, so this probe does not run out/main. It runs a
// throwaway main process that loads the real out/renderer/index.html with
// contextIsolation and a preload that exposes window.appBridge. Each bridge call is
// forwarded over IPC to the web server (dist/server/index.cjs, spawned with system node
// on an isolated data dir), so the renderer sees real data; only the transport differs
// from the desktop app. Three desktop-only methods the renderer calls at startup are
// answered with empty values (see STUBS below).
//
// Every Electron run gets its own HOME and XDG_* under PROBE_ROOT; ~/.config is never
// read or written. Requires a headless-capable Electron (uses --ozone-platform=headless).
// The window is an offscreen (OSR) BrowserWindow: in this sandbox a normal window under
// the headless ozone platform crashes the main process (SIGSEGV) right after creation.
// Read-only for the repository: it copies out/renderer into PROBE_ROOT for the asar case.
//
// A third case (arch001) imports one MIDI fixture, makes one startup prerequisite of
// GameScreen reject over real Electron IPC (getUserStats, getCustomFingerings, getSetting
// in turn), and records the PH-ARCH-001 load-error panel, Main Menu and Retry.
//
// Run: node scripts/audit/electron-renderer-asset-probe.mjs [fixture.mid]
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(REPO, 'package.json'));
const ROOT = resolve(process.env.PROBE_ROOT ?? join(tmpdir(), 'p11', 'D', 'electron-renderer'));
if (!ROOT.startsWith(resolve(tmpdir()))) throw new Error(`PROBE_ROOT must be under ${tmpdir()}`);
const ELECTRON = join(REPO, 'node_modules', 'electron', 'dist', 'electron');
const FLAGS = ['--no-sandbox', '--disable-gpu', '--ozone-platform=headless'];
const PORT = Number(process.env.PROBE_PORT ?? 3797);
const FIXTURE = resolve(process.argv[2] ?? join(tmpdir(), 'p11', 'D', 'fixtures', 'Lane D Title Probe.mid'));

const bridgeSource = readFileSync(join(REPO, 'src', 'shared', 'bridgeMethods.ts'), 'utf8');
const methodBlock = bridgeSource.match(/export const APP_BRIDGE_METHODS = \[([\s\S]*?)\]/);
if (!methodBlock) throw new Error('APP_BRIDGE_METHODS not found');
const METHODS = [...methodBlock[1].matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);

const MAIN = String.raw`
const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const { join } = require('node:path');
const { readFileSync, writeFileSync } = require('node:fs');

const methods = JSON.parse(readFileSync(join(__dirname, 'methods.json'), 'utf8'));
const base = 'http://127.0.0.1:' + process.env.PROBE_PORT;
const STUBS = { getInstrumentSamplePackStatuses: [], listAudioFiles: [], resolveInstrumentSampleSource: null };
const calls = [];
const failures = [];
const injected = [];
const failing = new Set();
const consoleErrors = [];
let srv;

function finish(result, code) {
  process.stdout.write('PROBE_RESULT ' + JSON.stringify(result) + '\n');
  try { srv && srv.kill(); } catch {}
  app.exit(code);
}
setTimeout(() => finish({ mode: process.env.PROBE_MODE, timeout: true, calls, failures, consoleErrors }, 2), 60000);

async function rpc(method, args) {
  const r = await fetch(base + '/api/bridge/' + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || body.error) throw new Error(body.error || ('HTTP ' + r.status));
  return body.result;
}

ipcMain.on('probe:methods', (e) => { e.returnValue = methods; });
ipcMain.handle('probe:call', async (_e, method, args) => {
  calls.push(method);
  if (failing.has(method)) { injected.push(method); throw new Error('storage unavailable'); }
  if (Object.prototype.hasOwnProperty.call(STUBS, method)) return STUBS[method];
  if (method === 'loadMidiFileData') {
    // Electron's file:load-midi handler returns new Uint8Array(bytes); mirror that shape.
    const r = await fetch(base + '/api/midi/' + encodeURIComponent(args[0]));
    if (!r.ok) { failures.push(method + ': HTTP ' + r.status); throw new Error('Song not found: ' + args[0]); }
    return new Uint8Array(await r.arrayBuffer());
  }
  try { return await rpc(method, args); } catch (err) { failures.push(method + ': ' + err.message); throw err; }
});

const VIDEO_STATE = '(' + (async () => {
  const v = document.querySelector('[data-testid="main-menu-background-video"]');
  if (!v) return { present: false };
  const t0 = v.currentTime;
  await new Promise((r) => setTimeout(r, 1500));
  let frames = null;
  try { frames = v.getVideoPlaybackQuality().totalVideoFrames; } catch {}
  let nonDark = null; let sampleError = null;
  try {
    const c = document.createElement('canvas'); c.width = 32; c.height = 18;
    const g = c.getContext('2d'); g.drawImage(v, 0, 0, 32, 18);
    const d = g.getImageData(0, 0, 32, 18).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 60) n++;
    nonDark = n;
  } catch (err) { sampleError = String((err && err.message) || err); }
  const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r('ok ' + i.naturalWidth + 'x' + i.naturalHeight); i.onerror = () => r('error'); i.src = u; });
  const neg = await new Promise((r) => {
    const n = document.createElement('video'); n.muted = true; n.src = '/assets/main-menu/mainmenu-neonbackground.webm';
    document.body.append(n);
    const done = () => { const o = { currentSrc: n.currentSrc, error: n.error ? n.error.code : null, readyState: n.readyState }; n.remove(); r(o); };
    n.onerror = done; n.onloadeddata = done; setTimeout(done, 3000);
  });
  return {
    present: true, visibilityState: document.visibilityState, baseURI: document.baseURI, currentSrc: v.currentSrc, readyState: v.readyState,
    error: v.error ? v.error.code : null, paused: v.paused, muted: v.muted, loop: v.loop,
    width: v.videoWidth, height: v.videoHeight, duration: v.duration,
    advancedSec: Number((v.currentTime - t0).toFixed(3)), decodedFrames: frames,
    sampledNonDark: nonDark, sampledTotal: 576, sampleError,
    cssBackground: getComputedStyle(document.documentElement).getPropertyValue('--main-menu-background-image').trim().slice(0, 300),
    webp: await load(new URL('assets/main-menu/mainmenu-neonbackground.webp', document.baseURI).href),
    png: await load(new URL('assets/main-menu/mainmenu-neonbackground.png', document.baseURI).href),
    negativeControlAbsoluteSrc: neg,
    menuText: document.body.innerText.split('\n').filter(Boolean).slice(0, 6),
  };
}).toString() + ')()';


const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const CLICK_PLAY_SONGS = "(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.includes('Play Songs')); if (b) b.click(); return !!b; })()";
const CLICK_LEARN = "(() => { const a = [...document.querySelectorAll('article.song-card')].find((x) => (x.querySelector('h2.song-card-title') || {}).textContent === 'Lane D Title Probe'); const b = a && [...a.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Learn'); if (b) b.click(); return !!b; })()";
const PANEL = "(() => { const p = document.querySelector('.game-load-error'); return p ? { text: p.innerText.replace(/\\n+/g, ' | '), buttons: [...p.querySelectorAll('button')].map((b) => b.textContent.trim()), role: p.getAttribute('role') } : null; })()";
const clickPanel = (label) => "(() => { const b = [...document.querySelectorAll('.game-load-error button')].find((x) => x.textContent.trim() === '" + label + "'); if (b) b.click(); return !!b; })()";

async function arch001(html) {
  const fd = new FormData();
  fd.append('files', new Blob([readFileSync(process.env.PROBE_FIXTURE)]), 'Lane D Title Probe.mid');
  const upload = await fetch(base + '/api/midi/upload', { method: 'POST', body: fd }).then((r) => r.json());
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { offscreen: true, preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const pageErrors = [];
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) consoleErrors.push(message.slice(0, 200)); });
  win.webContents.on('render-process-gone', (_e, d) => pageErrors.push('render-process-gone ' + d.reason));
  const js = (code) => win.webContents.executeJavaScript(code);
  const results = [];
  for (const method of ['getUserStats', 'getCustomFingerings', 'getSetting']) {
    await win.loadFile(html);
    for (let i = 0; i < 40 && !(await js("!!document.querySelector('[data-testid=\"main-menu-background-video\"]')")); i++) await delay(250);
    failing.add(method);
    const steps = { playSongs: await js(CLICK_PLAY_SONGS) };
    await delay(900);
    steps.learn = await js(CLICK_LEARN);
    await delay(1500);
    const before = await js(PANEL);
    if (method === 'getUserStats') {
      try { const img = await win.webContents.capturePage(); writeFileSync(process.env.PROBE_SHOT, img.toPNG()); } catch {}
    }
    let mainMenu = null; let reopened = null;
    if (method === 'getUserStats') {
      steps.mainMenu = await js(clickPanel('Main Menu'));
      await delay(900);
      mainMenu = await js("document.body.innerText.includes('Guided Lessons') && !document.querySelector('.game-load-error')");
      await js(CLICK_PLAY_SONGS); await delay(900); await js(CLICK_LEARN); await delay(1500);
      reopened = await js(PANEL);
    }
    failing.delete(method);
    steps.retry = await js(clickPanel('Retry'));
    await delay(1800);
    const after = await js(PANEL);
    const canvases = await js("document.querySelectorAll('canvas').length");
    results.push({ method, steps, before, mainMenu, reopened, after, canvases });
  }
  finish({ mode: 'arch001', electron: process.versions.electron, upload: (upload.songs || []).map((s) => s.title), uploadErrors: upload.errors || [], results, injected, calls: [...new Set(calls)], failures, consoleErrors, pageErrors, shot: process.env.PROBE_SHOT }, 0);
}

app.whenReady().then(async () => {
  srv = spawn('node', [process.env.PROBE_SERVER], { env: { ...process.env, PORT: process.env.PROBE_PORT, LUMAKEYS_DATA_DIR: process.env.PROBE_DATA, LUMAKEYS_TRUST_UPSTREAM_AUTH: '1' }, stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    try { await rpc('getAllSongs', []); up = true; } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  if (!up) return finish({ mode: process.env.PROBE_MODE, serverUp: false }, 3);
  await rpc('setSetting', ['onboarding', 'setupComplete', 'true']);

  const html = process.env.PROBE_MODE === 'asar' ? join(app.getAppPath(), 'out', 'renderer', 'index.html') : process.env.PROBE_HTML;
  if (process.env.PROBE_MODE === 'arch001') return arch001(html);
  // Packaged main reads bundled assets from app.getAppPath()/out/renderer (getDesktopAssetRoot)
  // with fs/promises readFile (curriculum) and existsSync/readFileSync/copyFileSync
  // (instrumentSamplePackStore managed install). Repeat those calls against this app path.
  const assetFs = {};
  if (process.env.PROBE_MODE === 'asar') {
    const fs = require('node:fs');
    const root = join(app.getAppPath(), 'out', 'renderer');
    try { const b = await require('node:fs/promises').readFile(join(root, 'curriculum-midis', 'ode-to-joy.mid')); assetFs.curriculum = { bytes: b.length, header: b.subarray(0, 4).toString('latin1') }; } catch (err) { assetFs.curriculum = 'ERR ' + err.message; }
    try {
      const manifestFile = join(root, 'instrument-packs', 'flute', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      const src = join(root, String(manifest.assets[0].url).replace(/^\//, ''));
      const dest = join(process.env.PROBE_DATA, manifest.assets[0].fileName);
      fs.copyFileSync(src, dest);
      assetFs.managedPack = { manifestExists: fs.existsSync(manifestFile), assets: manifest.assets.length, copied: manifest.assets[0].fileName, srcBytes: fs.statSync(src).size, destBytes: fs.statSync(dest).size };
    } catch (err) { assetFs.managedPack = 'ERR ' + err.message; }
  }
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { offscreen: true, preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 3) consoleErrors.push(message.slice(0, 200)); });
  let failLoad = null;
  win.webContents.on('did-fail-load', (_e, code, desc, url) => { failLoad = { code, desc, url }; });
  await win.loadFile(html).catch((err) => { failLoad = failLoad || { error: String(err) }; });
  let state = { present: false };
  for (let i = 0; i < 40 && !state.present; i++) {
    state = await win.webContents.executeJavaScript('!!document.querySelector(\'[data-testid="main-menu-background-video"]\')').then((p) => (p ? { present: true } : { present: false }));
    if (!state.present) await new Promise((r) => setTimeout(r, 250));
  }
  if (state.present) state = await win.webContents.executeJavaScript(VIDEO_STATE);
  let shot = null;
  try { const img = await win.webContents.capturePage(); writeFileSync(process.env.PROBE_SHOT, img.toPNG()); shot = process.env.PROBE_SHOT; } catch (err) { shot = 'capture failed: ' + err.message; }
  finish({ mode: process.env.PROBE_MODE, electron: process.versions.electron, chrome: process.versions.chrome, appPath: app.getAppPath(), html, failLoad, assetFs, state, shot, calls: [...new Set(calls)], failures, consoleErrors }, 0);
});
`;

const PRELOAD = String.raw`
const { contextBridge, ipcRenderer } = require('electron');
const methods = ipcRenderer.sendSync('probe:methods');
const bridge = {};
for (const m of methods) {
  bridge[m] = m === 'onImportProgress' ? () => () => {} : (...args) => ipcRenderer.invoke('probe:call', m, args);
}
contextBridge.exposeInMainWorld('appBridge', bridge);
`;

function writeApp(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'lumakeys-renderer-probe', main: 'main.cjs' }));
  writeFileSync(join(dir, 'main.cjs'), MAIN);
  writeFileSync(join(dir, 'preload.cjs'), PRELOAD);
  writeFileSync(join(dir, 'methods.json'), JSON.stringify(METHODS));
}

function isolatedEnv(home) {
  const env = { PATH: process.env.PATH, TMPDIR: tmpdir(), HOME: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_CACHE_HOME: join(home, '.cache'), XDG_DATA_HOME: join(home, '.local', 'share') };
  for (const k of ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME']) mkdirSync(env[k], { recursive: true });
  return env;
}

function runElectron(appArg, mode) {
  const caseDir = join(ROOT, mode);
  const env = {
    ...isolatedEnv(join(caseDir, 'home')),
    PROBE_MODE: mode, PROBE_PORT: String(PORT), PROBE_DATA: join(caseDir, 'data'),
    PROBE_SERVER: join(REPO, 'dist', 'server', 'index.cjs'),
    PROBE_HTML: join(REPO, 'out', 'renderer', 'index.html'),
    PROBE_SHOT: join(ROOT, mode === 'arch001' ? 'electron-arch001-getUserStats.png' : `electron-${mode}-main-menu.png`),
    PROBE_FIXTURE: FIXTURE,
  };
  mkdirSync(env.PROBE_DATA, { recursive: true });
  return new Promise((done) => {
    const child = spawn(ELECTRON, [...FLAGS, appArg], { env, cwd: REPO, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const killer = setTimeout(() => child.kill('SIGKILL'), 90000);
    child.on('exit', (code, signal) => {
      clearTimeout(killer);
      const line = out.split('\n').find((l) => l.startsWith('PROBE_RESULT '));
      done({ exit: code ?? signal, result: line ? JSON.parse(line.slice('PROBE_RESULT '.length)) : null, tail: line ? undefined : out.slice(-1500) });
    });
  });
}

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });

// Case 1: unpacked out/ tree, as electron-vite preview and the unpacked dev build load it.
const treeApp = join(ROOT, 'tree-app');
writeApp(treeApp);
console.log('CASE tree', JSON.stringify(await runElectron(treeApp, 'tree')));

// Case 3: PH-ARCH-001 load-error panel over real Electron IPC rejections (unpacked tree).
if (existsSync(FIXTURE)) console.log('CASE arch001', JSON.stringify(await runElectron(treeApp, 'arch001')));
else console.log('CASE arch001 skipped: fixture not found', FIXTURE);

// Case 2: asar archive with out/renderer inside, matching packaging/electron-builder.yml
// (files: out/**/*, asar on, only better-sqlite3 unpacked).
const asarSrc = join(ROOT, 'asar-src');
writeApp(asarSrc);
cpSync(join(REPO, 'out', 'renderer'), join(asarSrc, 'out', 'renderer'), { recursive: true });
const asar = require('@electron/asar');
const asarFile = join(ROOT, 'asar', 'app.asar');
mkdirSync(dirname(asarFile), { recursive: true });
await asar.createPackage(asarSrc, asarFile);
const listed = asar.listPackage(asarFile).filter((p) => p.includes('mainmenu-neonbackground'));
console.log('ASAR entries', JSON.stringify(listed));
rmSync(asarSrc, { recursive: true, force: true });
console.log('CASE asar', JSON.stringify(await runElectron(asarFile, 'asar')));
