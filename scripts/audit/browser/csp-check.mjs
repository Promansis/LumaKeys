// PH-SEC-002 and PH-SEC-003 (web): sign in through /login, then walk each source the
// Content-Security-Policy must allow (main-menu video, audio engine start with the reverb
// AudioWorklet and the Tone.js clock worker, a built-in sampler, a blob: fetch as a web
// sample pack makes, the Soundboard) and report every CSP violation. Last, check that the
// policy is enforced: string eval, an injected inline script, a cross-origin fetch and
// framing are all refused.
//
// The web "Install Better Sounds" pack requests `undefinedblob:` URLs and fails with or
// without a policy (PH-PAR-006); those requests are listed apart and not counted.
//
// Starts the built server itself with a throwaway LUMAKEYS_DATA_DIR and a test token.
// Run from $TMPDIR/pw (next to the Playwright install):
//   ROOT=<checkout with dist/> DATA=$TMPDIR/csp/data PORT=3222 \
//     PLAYWRIGHT_BROWSERS_PATH=$TMPDIR/pw/browsers node csp-check.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.env.ROOT ?? '/media/storage/LumaKeys';
const data = process.env.DATA;
const port = Number(process.env.PORT || 3222);
const token = 'csp-check-token-0123456789';
if (!data) throw new Error('set DATA to a throwaway directory under $TMPDIR');
fs.rmSync(data, { recursive: true, force: true });
fs.mkdirSync(data, { recursive: true });

let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
const base = `http://127.0.0.1:${port}`;
const log = fs.createWriteStream(path.join(data, 'server.log'));
const srv = spawn('node', [path.join(root, 'dist/server/index.cjs')], {
  cwd: root,
  env: { ...process.env, PORT: String(port), LUMAKEYS_DATA_DIR: data, LUMAKEYS_WEB_ACCESS_TOKEN: token },
  stdio: ['ignore', 'pipe', 'pipe'],
});
srv.stdout.pipe(log); srv.stderr.pipe(log);
for (let i = 0; i < 50; i++) { try { if ((await fetch(base + '/')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const violations = [];
  const consoleCsp = [];
  const engine = [];
  const urls = [];
  await page.exposeFunction('__cspReport', (v) => violations.push(v));
  await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => {
    window.__cspReport({ directive: e.violatedDirective, blocked: e.blockedURI, source: e.sourceFile });
  }));
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to/i.test(t)) consoleCsp.push(t.slice(0, 200));
    if (/AudioEngine/.test(t)) engine.push(t.replace(/\n[\s\S]*/, '').slice(0, 110));
  });
  page.on('request', (r) => urls.push(r.url()));
  page.on('framenavigated', (f) => urls.push(f.url()));
  const step = (label) => {
    const own = violations.filter((v) => v.blocked !== 'undefinedblob');
    console.log(`${label}: violations so far ${JSON.stringify(own)} (+${violations.length - own.length} PH-PAR-006 undefinedblob:)`);
  };

  // ---- sign in through the form; the token travels only in the POST body ----
  const before = await fetch(base + '/api/access');
  check('API refuses an unsigned browser', before.status === 401, String(before.status));
  await page.goto(base + '/login');
  await page.getByLabel('Access token').fill(token);
  await Promise.all([page.waitForURL(base + '/'), page.getByRole('button', { name: 'Sign in' }).click()]);
  check('sign-in form lands on the app', page.url() === base + '/', page.url());
  check('no request or navigation URL carries the token', !urls.some((u) => u.includes(token)), `${urls.length} URLs`);
  check('access cookie is HttpOnly (not visible to script)', !(await page.evaluate(() => document.cookie)).includes('lumakeys_web_access'));
  const access = await page.evaluate(() => fetch('/api/access').then((r) => r.status));
  check('signed-in browser reaches /api', access === 200, String(access));
  const meta = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? null);
  check('index.html carries the CSP <meta>', Boolean(meta), meta ?? 'absent');
  await page.waitForTimeout(1000);
  const skip = page.getByRole('button', { name: /Skip for now/i });
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(500); }

  // ---- main-menu video ----
  await page.waitForTimeout(2500);
  const video = await page.evaluate(() => {
    const v = document.querySelector('[data-testid="main-menu-background-video"]');
    return v ? { readyState: v.readyState, error: v.error?.code ?? null, currentTime: Number(v.currentTime.toFixed(2)), src: v.currentSrc.replace(location.origin, '') } : null;
  });
  check('main-menu video loads and plays', Boolean(video && video.error === null && video.readyState >= 2 && video.currentTime > 0), JSON.stringify(video));
  step('main menu');

  // ---- audio engine start: Freeverb's AudioWorklet and the clock worker (Free Play) ----
  await page.getByRole('button', { name: 'Free Play', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.locator('canvas').first().click({ position: { x: 640, y: 300 } }).catch(() => {});
  for (const k of ['Comma', 'Slash', 'KeyW']) { await page.keyboard.down(k); await page.waitForTimeout(150); await page.keyboard.up(k); }
  await page.waitForTimeout(3000);
  check('audio engine starts', engine.some((l) => /Initialization complete/.test(l)), JSON.stringify(engine.filter((l) => /Initializ|Failed/.test(l))));
  step('free play');
  await page.goto(base + '/');
  await page.waitForTimeout(1500);

  // ---- built-in sampler, then the web pack install (Settings > Audio) ----
  engine.length = 0;
  await page.mouse.click(400, 300); await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700);
  await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(250);
  const adv = page.getByRole('button', { name: /show advanced options/i });
  if (await adv.count()) { await adv.first().click(); await page.waitForTimeout(250); }
  await page.locator('#settings-panel-audio label').filter({ hasText: /^Instrument/i }).locator('select, input').first().selectOption('flute');
  await page.waitForTimeout(3000);
  check('built-in sampler loads', engine.some((l) => /Sampler loaded successfully/.test(l)) && !engine.some((l) => /Failed to load sampler|synth fallback/.test(l)), JSON.stringify(engine.filter((l) => /ampler|Failed|fallback/.test(l))));
  engine.length = 0;
  await page.getByRole('button', { name: /Install Better Sounds/ }).click();
  await page.waitForTimeout(5000);
  const packStatus = await page.locator('.settings-status-message').innerText().catch(() => '?');
  console.log(`INFO web pack install (PH-PAR-006): status ${JSON.stringify(packStatus)} engine ${JSON.stringify(engine.filter((l) => /custom|Failed|fallback|Loading sampler|loaded successfully/.test(l)))}`);
  const blobFetch = await page.evaluate(async () => { const url = URL.createObjectURL(new Blob(['pack-bytes'])); try { return await (await fetch(url)).text(); } catch (e) { return `refused: ${e.message}`; } });
  check('a blob: fetch, as a web sample pack makes, is allowed', blobFetch === 'pack-bytes', blobFetch);
  step('sampler and pack');
  await page.goto(base + '/');
  await page.waitForTimeout(1500);

  // ---- Soundboard clips ----
  const clipResponses = [];
  page.on('response', (r) => { if (r.url().includes('/soundboard/')) clipResponses.push(`${r.status()} ${r.url().replace(base, '')}`); });
  await page.getByRole('button', { name: 'Soundboard', exact: true }).first().click();
  await page.waitForTimeout(1200);
  for (const k of ['Comma', 'Period', 'Slash']) { await page.keyboard.press(k); await page.waitForTimeout(900); }
  check('Soundboard clips load', clipResponses.some((c) => /^20[06] .*\.(mp3|ogg)$/.test(c)), JSON.stringify(clipResponses.slice(0, 4)));
  step('soundboard');

  const isPar006 = (v) => v.blocked === 'undefinedblob';
  const isPar006Console = (t) => /undefinedblob:/.test(t);
  console.log(`INFO PH-PAR-006 undefinedblob: requests refused: ${violations.filter(isPar006).length}`);
  const appViolations = violations.filter((v) => !isPar006(v));
  const appConsole = consoleCsp.filter((t) => !isPar006Console(t));
  check('no CSP violation while using the app', appViolations.length === 0 && appConsole.length === 0, JSON.stringify({ appViolations, appConsole }));

  // ---- the policy is enforced (page.evaluate itself is exempt, so each probe runs later from the page) ----
  violations.length = 0;
  const probes = await page.evaluate(async (other) => {
    window.__evalRan = false;
    setTimeout('window.__evalRan = true', 0);
    window.__inlineRan = false;
    const script = document.createElement('script');
    script.textContent = 'window.__inlineRan = true';
    document.head.append(script);
    const crossOrigin = await fetch(other).then(() => 'fetched', (e) => `refused: ${e.message}`);
    await new Promise((r) => setTimeout(r, 300));
    return { evalRan: window.__evalRan, inlineRan: window.__inlineRan, crossOrigin };
  }, 'http://127.0.0.1:3229/');
  await page.waitForTimeout(300);
  const refused = (directive, blocked) => violations.some((v) => v.directive.startsWith(directive) && v.blocked.startsWith(blocked));
  check('string eval is refused', probes.evalRan === false && refused('script-src', 'eval'), JSON.stringify(violations.filter((v) => v.blocked === 'eval')));
  check('an injected inline script does not run', probes.inlineRan === false && refused('script-src', 'inline'), String(probes.inlineRan));
  check('a cross-origin fetch is refused by connect-src', refused('connect-src', 'http://127.0.0.1:3229'), probes.crossOrigin);
  const framer = await ctx.newPage();
  await framer.setContent(`<iframe src="${base}/" width="300" height="200"></iframe>`);
  await framer.waitForTimeout(1500);
  const framed = await framer.frames()[1]?.evaluate(() => `${location.href} title=${JSON.stringify(document.title)}`).catch((e) => `blocked (${e.message.slice(0, 60)})`);
  check('another page cannot frame the app', !String(framed).includes('LumaKeys'), String(framed));
} finally {
  await browser.close();
  srv.kill('SIGTERM');
}
console.log(fails === 0 ? 'DONE: all checks passed' : `DONE: ${fails} check(s) failed`);
process.exitCode = fails === 0 ? 0 : 1;
