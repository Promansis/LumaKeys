// PH-ARCH-001 forced-failure recovery proof (web build, real browsers). No source is edited: Playwright page.route
// injects the failure into one prerequisite of the practice-session load, then the Retry and Main Menu paths are driven
// with the keyboard.
//
// Env (all required unless noted):
//   REPO          repo root (default: three levels above this file); only dist/ is read
//   WORK          evidence dir for this browser (shots, result.json, server data dir)
//   PORT          free port for the throwaway server
//   FIX_MIDI      path to a small .mid fixture to upload
//   BROWSER       chromium | firefox (default chromium)
//   BROWSER_PATH  optional executable of that engine (for example an unpacked Edge)
//   BROWSER_HOME  isolated HOME for the browser process (default WORK/home)
//   NO_SANDBOX=1  pass --no-sandbox (needed for the unpacked Edge)
//   HEADED=1      run headed (needs DISPLAY)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as playwright from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.REPO ?? path.resolve(here, '../../..');
const WORK = process.env.WORK;
const PORT = Number(process.env.PORT);
const FIX_MIDI = process.env.FIX_MIDI;
if (!WORK || !PORT || !FIX_MIDI) throw new Error('WORK, PORT and FIX_MIDI are required');
const browserName = process.env.BROWSER ?? 'chromium';
const HOME = process.env.BROWSER_HOME ?? path.join(WORK, 'home');
const DATA = path.join(WORK, 'data');
const SHOTS = path.join(WORK, 'shots');
for (const d of [WORK, HOME, DATA, SHOTS, path.join(WORK, 'profile'), path.join(HOME, '.config'), path.join(HOME, '.cache')]) fs.mkdirSync(d, { recursive: true });

const results = [];
const check = (scenario, name, pass, detail) => {
  results.push({ scenario, name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${scenario}] ${name}${detail !== undefined ? ' :: ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- server (throwaway data dir) ----
const srvLog = fs.createWriteStream(path.join(WORK, 'server.log'), { flags: 'a' });
const srv = spawn('node', [path.join(REPO, 'dist/server/index.cjs')], {
  env: { ...process.env, PORT: String(PORT), LUMAKEYS_DATA_DIR: DATA, LUMAKEYS_TRUST_UPSTREAM_AUTH: '1' },
  stdio: ['ignore', 'pipe', 'pipe'], cwd: REPO,
});
srv.stdout.pipe(srvLog); srv.stderr.pipe(srvLog);
const base = `http://127.0.0.1:${PORT}`;
for (let i = 0; i < 80; i++) { try { const r = await fetch(base + '/'); if (r.ok) break; } catch {} await sleep(100); }

// ---- browser (isolated HOME, XDG and profile under WORK) ----
const env = {
  ...process.env, HOME, XDG_CONFIG_HOME: path.join(HOME, '.config'), XDG_CACHE_HOME: path.join(HOME, '.cache'),
  XDG_DATA_HOME: path.join(HOME, '.local/share'), XDG_RUNTIME_DIR: path.join(HOME, 'run'),
};
fs.mkdirSync(env.XDG_DATA_HOME, { recursive: true }); fs.mkdirSync(env.XDG_RUNTIME_DIR, { recursive: true, mode: 0o700 });
const exe = process.env.BROWSER_PATH;
const ctx = await playwright[browserName].launchPersistentContext(path.join(WORK, 'profile'), {
  ...(exe ? { executablePath: exe } : {}),
  headless: process.env.HEADED !== '1',
  env,
  args: browserName === 'chromium' && process.env.NO_SANDBOX === '1' ? ['--no-sandbox'] : [],
  viewport: { width: 1280, height: 800 },
  acceptDownloads: true,
});
const page = ctx.pages()[0] ?? await ctx.newPage();
page.setDefaultTimeout(30000);
const version = ctx.browser()?.version() ?? 'unknown';
const ua = await page.evaluate(() => navigator.userAgent);
console.log('BROWSER', browserName, version, exe ? '(custom executable)' : '', '\nUA', ua);

const pageErrors = []; const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

// ---- failure injection ----
// fail.mode: null | { kind: 'bridge', method, status } | { kind: 'midi', status } | { kind: 'midi-abort' }
const fail = { mode: null };
const calls = []; // { t, method }
await page.route('**/api/bridge/*', async (route) => {
  const method = new URL(route.request().url()).pathname.split('/').pop();
  const m = fail.mode;
  calls.push({ method, failed: !!(m && m.kind === 'bridge' && m.method === method) });
  if (m && m.kind === 'bridge' && m.method === method) {
    return route.fulfill({ status: m.status, contentType: 'application/json', body: JSON.stringify({ error: `injected ${method} failure` }) });
  }
  return route.continue();
});
await page.route('**/api/midi/*', async (route) => {
  const m = fail.mode;
  calls.push({ method: 'GET /api/midi', failed: !!(m && (m.kind === 'midi' || m.kind === 'midi-abort')) });
  if (m && m.kind === 'midi') return route.fulfill({ status: m.status, contentType: 'application/json', body: JSON.stringify({ error: 'injected midi failure' }) });
  if (m && m.kind === 'midi-abort') return route.abort('connectionfailed');
  return route.continue();
});

const text = () => page.evaluate(() => document.body.innerText);
const focusInfo = () => page.evaluate(() => {
  const a = document.activeElement;
  if (!a) return null;
  const cs = getComputedStyle(a);
  return { tag: a.tagName, text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 40), cls: String(a.className).slice(0, 60), focusVisible: a.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth}`, inDoc: document.body.contains(a) };
});

async function boot() {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Skip for now|^Play Songs$/ }).first().waitFor({ timeout: 60000 });
  const skip = page.getByRole('button', { name: /Skip for now/i });
  if (await skip.count()) { await skip.click(); await sleep(400); }
}
async function openLibrary() {
  await page.getByRole('button', { name: 'Play Songs', exact: true }).click();
  await page.locator('article.song-card').first().waitFor();
}
async function startSong() {
  await page.locator('article.song-card').first().getByRole('button', { name: 'Play', exact: true }).click();
}
const panel = () => page.locator('.game-load-error[role="alert"]');
const retryBtn = () => panel().getByRole('button', { name: 'Retry', exact: true });
const backBtn = () => panel().getByRole('button', { name: 'Main Menu', exact: true });
async function canvasPaints() {
  const sig = () => page.evaluate(() => {
    const c = document.querySelector('canvas'); if (!c) return null;
    const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const x = t.getContext('2d'); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, t.width, t.height).data;
    let nb = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] && (d[i] | d[i + 1] | d[i + 2])) nb++;
    return nb;
  });
  return (await sig());
}
async function leaveSession() {
  await page.evaluate(() => document.activeElement?.blur());
  const ov = page.locator('.immersive-overlay');
  for (let i = 0; i < 3 && (await ov.count()) === 0; i++) { await page.keyboard.press('Escape'); await sleep(500); }
  await ov.getByRole('button', { name: /Main Menu/ }).first().click();
  await page.getByRole('button', { name: /^Play Songs$/ }).first().waitFor();
}
async function tabTo(locator, max = 150) {
  for (let i = 1; i <= max; i++) {
    await page.keyboard.press('Tab');
    const hit = await locator.evaluate((el) => el === document.activeElement).catch(() => false);
    if (hit) return i;
  }
  return -1;
}

try {
  // --- setup: upload a song through the Library UI ---
  await boot();
  await openLibrary().catch(() => {});
  if ((await page.locator('article.song-card').count()) === 0) {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Upload MIDI/ }).click()]);
    await fc.setFiles(FIX_MIDI);
    await page.locator('article.song-card').first().waitFor({ timeout: 20000 });
  }
  console.log('uploaded song cards', await page.locator('article.song-card').count(), await page.locator('h2.song-card-title').allInnerTexts());

  // --- baseline: normal load, no panel ---
  {
    const sc = 'baseline-normal';
    calls.length = 0;
    await startSong();
    await page.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 20000 });
    await sleep(1500);
    check(sc, 'no recovery panel on a normal load', (await panel().count()) === 0);
    const nb = await canvasPaints();
    check(sc, 'game canvas painted', nb > 0, { nonBlankPixels: nb });
    await page.screenshot({ path: path.join(SHOTS, `${sc}.png`) });
    // leave the session via Escape menu -> Main Menu so the next scenario starts from the main menu
    await leaveSession();
    check(sc, 'back to main menu after normal session', true);
  }

  const scenarios = [
    { id: 'getSetting-500', mode: { kind: 'bridge', method: 'getSetting', status: 500 } },
    { id: 'getUserStats-500', mode: { kind: 'bridge', method: 'getUserStats', status: 500 } },
    { id: 'getCustomFingerings-500', mode: { kind: 'bridge', method: 'getCustomFingerings', status: 500 } },
    { id: 'midi-bytes-500', mode: { kind: 'midi', status: 500 } },
    { id: 'midi-bytes-network-abort', mode: { kind: 'midi-abort' } },
  ];

  for (const s of scenarios) {
    const sc = s.id;
    console.log(`\n=== ${sc} ===`);
    const errBefore = pageErrors.length;
    fail.mode = s.mode; calls.length = 0;
    await openLibrary();
    await startSong();

    // 1. error is visible (not only inside the Escape menu), with the injected message and both actions
    let shown = true;
    try { await panel().waitFor({ state: 'visible', timeout: 15000 }); } catch { shown = false; }
    check(sc, 'recovery panel (role=alert) visible without opening the Escape menu', shown);
    if (!shown) { await page.screenshot({ path: path.join(SHOTS, `${sc}-NOPANEL.png`) }); fail.mode = null; await boot(); continue; }
    const body = await panel().innerText();
    check(sc, 'panel says "Unable to load song:" and names the failure', /Unable to load song:/.test(body) && /(injected|Unable to load MIDI|Failed to fetch|NetworkError|Load failed)/i.test(body), body.replace(/\n+/g, ' | '));
    check(sc, 'Retry and Main Menu buttons present and enabled', (await retryBtn().isEnabled()) && (await backBtn().isEnabled()));
    await page.screenshot({ path: path.join(SHOTS, `${sc}-panel.png`) });
    const focus0 = await focusInfo();
    console.log('focus when panel first shown', JSON.stringify(focus0));

    // 2. no mutation call while the preflight failed
    const names = [...new Set(calls.map((c) => c.method))];
    const mutating = names.filter((n) => !/^(get|list|load|has|is|find|search|resolve|read|GET )/i.test(n));
    check(sc, 'no mutating bridge call during failed load', mutating.length === 0, { methods: names, mutating });

    // 3. Retry with keyboard while the failure persists -> panel stays, a new load attempt happened, nothing hangs
    const nBefore = calls.length;
    const tabsRetry = await tabTo(retryBtn());
    check(sc, 'keyboard Tab reaches Retry', tabsRetry > 0, { tabs: tabsRetry, focus: await focusInfo() });
    check(sc, 'Retry shows focus-visible when focused by keyboard', (await focusInfo())?.focusVisible === true, await focusInfo());
    await page.keyboard.press('Enter');
    await sleep(2500);
    const reCalls = calls.length - nBefore;
    check(sc, 'Retry (failure persists) re-runs the load and returns to the panel', (await panel().isVisible()) && reCalls > 0, { newCalls: reCalls });
    check(sc, 'Retry/Back buttons still usable after a repeated failure', (await retryBtn().isEnabled()) && (await backBtn().isEnabled()));
    console.log('focus after failed retry', JSON.stringify(await focusInfo()));

    // 4. recovery: remove the failure, Retry (keyboard) -> panel gone, session mounts
    fail.mode = null;
    const tabs2 = (await focusInfo())?.text === 'Retry' ? 0 : await tabTo(retryBtn());
    await page.keyboard.press('Enter');
    let gone = true;
    try { await panel().waitFor({ state: 'detached', timeout: 15000 }); } catch { gone = false; }
    check(sc, 'Retry after the failure clears removes the panel', gone, { tabsNeeded: tabs2 });
    await sleep(2000);
    const nb = await canvasPaints();
    check(sc, 'session mounted and canvas painted after Retry', nb > 0, { nonBlankPixels: nb });
    await page.screenshot({ path: path.join(SHOTS, `${sc}-recovered.png`) });
    // leave
    await leaveSession();

    // 5. Back path: fail again, leave with the keyboard through Main Menu, confirm nothing is stuck
    fail.mode = s.mode;
    await openLibrary();
    await startSong();
    await panel().waitFor({ state: 'visible', timeout: 15000 });
    const tabsBack = await tabTo(backBtn());
    check(sc, 'keyboard Tab reaches Main Menu on the panel', tabsBack > 0, { tabs: tabsBack });
    await page.keyboard.press('Enter');
    let menu = true;
    try { await page.getByRole('button', { name: /^Play Songs$/ }).first().waitFor({ timeout: 10000 }); } catch { menu = false; }
    check(sc, 'Main Menu leaves the failed session for the main menu', menu && (await panel().count()) === 0);
    const f2 = await focusInfo();
    check(sc, 'focus is on a live element after leaving (not detached)', !!f2 && f2.inDoc, f2);
    console.log('focus after Main Menu', JSON.stringify(f2));
    fail.mode = null;
    // the menu still works: a normal load now succeeds
    await openLibrary();
    await startSong();
    await page.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 20000 });
    await sleep(1500);
    check(sc, 'a normal session loads after backing out of the failure', (await panel().count()) === 0 && (await canvasPaints()) > 0);
    await leaveSession();
    check(sc, 'no uncaught page error during scenario', pageErrors.length === errBefore, pageErrors.slice(errBefore));
  }

} catch (e) {
  check('driver', 'driver completed without exception', false, String(e && e.stack || e).slice(0, 600));
  try { await page.screenshot({ path: path.join(SHOTS, 'driver-exception.png') }); } catch {}
} finally {
  const summary = { browser: browserName, version, ua, executable: exe ? 'custom' : 'playwright', headed: process.env.HEADED === '1', passed: results.filter((r) => r.pass).length, failed: results.filter((r) => !r.pass).length, consoleErrorsSample: [...new Set(consoleErrors)].slice(0, 10), pageErrors, results };
  fs.writeFileSync(path.join(WORK, 'result.json'), JSON.stringify(summary, null, 2));
  console.log(`\nSUMMARY ${browserName} ${version}: ${summary.passed} pass, ${summary.failed} fail, pageErrors ${pageErrors.length}`);
  await ctx.close().catch(() => {});
  srv.kill('SIGTERM');
}
