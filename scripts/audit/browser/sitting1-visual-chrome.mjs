// Sitting 1 (visual), web half: REAL google-chrome (not Playwright's launcher or its default flags),
// fresh --user-data-dir, on a throwaway Xvfb display with xfwm4, driven by genuine X key presses
// and clicks (sitting1-visual-xtest.py). Playwright only attaches over CDP to read state.
// Env: BASE (web app URL, server started with a throwaway LUMAKEYS_DATA_DIR), PROFILE (fresh empty
// dir under $TMPDIR: Chrome user data, HOME and XDG_CONFIG_HOME), OUT, DISPLAY (:90-:99), CDP_PORT,
// PHASE (zoom | motion | midi-observe | midi-block), GTK_ANIMATIONS (unset | false | true),
// for midi-block: CLICK_X, CLICK_Y (screen px of the bubble's Block button) and CHROME_PID.
// Optional: EXTRA_ARGS (space-separated Chrome switches, e.g. --force-prefers-reduced-motion),
// XSETTINGS_PID (sitting1-visual-xsettings.py; the motion phase flips it live twice).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { xkey, xt, xclick, grabPng, grabGray, diffFrac, geometry, videoState, installRecorder, lastDown, hudProbe, screenName, clickEveryTab, writeGtkSettings, sampleWhileHeld, j, sleep } from './sitting1-visual-probes.mjs';

const TMP = path.resolve(process.env.TMPDIR ?? '/nonexistent');
const PROFILE = path.resolve(process.env.PROFILE ?? '');
const { BASE, OUT, PHASE } = process.env; const PORT = +process.env.CDP_PORT;
if (!PROFILE.startsWith(TMP + path.sep)) throw new Error(`PROFILE must be under $TMPDIR (${TMP}), got ${PROFILE}`);
if (!/^http:\/\/127\.0\.0\.1:41\d\d$/.test(BASE ?? '')) throw new Error('BASE must be the throwaway server on 127.0.0.1:41xx');
fs.mkdirSync(OUT, { recursive: true });
const tag = path.basename(PROFILE);
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const shot = (name) => grabPng(path.join(OUT, `${tag}-${name}.png`));

function launchChrome(url) {
  if (fs.existsSync(PROFILE) && fs.readdirSync(PROFILE).length) throw new Error('PROFILE must be a fresh empty directory');
  const config = path.join(PROFILE, '.config'); fs.mkdirSync(config, { recursive: true });
  if (process.env.GTK_ANIMATIONS) writeGtkSettings(config, process.env.GTK_ANIMATIONS === 'true');
  const env = { ...process.env, HOME: PROFILE, XDG_CONFIG_HOME: config, XDG_CACHE_HOME: path.join(PROFILE, '.cache'), DBUS_SESSION_BUS_ADDRESS: `unix:path=${path.join(PROFILE, 'no-session-bus')}` };
  for (const k of ['HOME', 'XDG_CONFIG_HOME']) if (!env[k].startsWith(TMP + path.sep)) throw new Error(`${k} escaped $TMPDIR`);
  const args = [`--user-data-dir=${path.join(PROFILE, 'chrome')}`, `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', '--password-store=basic', '--window-position=0,0', '--window-size=1480,1050', ...(process.env.EXTRA_ARGS ? process.env.EXTRA_ARGS.split(' ') : []), url];
  const p = spawn('/usr/bin/google-chrome', args, { env, detached: true, stdio: ['ignore', fs.openSync(path.join(OUT, `${tag}-chrome.log`), 'a'), fs.openSync(path.join(OUT, `${tag}-chrome.log`), 'a')] });
  p.unref();
  log('chrome launched', j({ pid: p.pid, args: args.slice(0, -1), HOME: env.HOME, XDG_CONFIG_HOME: config, gtkAnimations: process.env.GTK_ANIMATIONS ?? '(no settings.ini)' }));
  return p.pid;
}
async function waitCdp() { for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return r.json(); } catch {} await sleep(200); } throw new Error('no CDP'); }
// Raw CDP (no Playwright attached) for the permission-prompt check.
async function rawEval(expr) {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const t = list.find((x) => x.type === 'page' && x.url.startsWith(BASE));
  if (!t) return `(no page; targets ${list.map((x) => x.url).join(' ')})`;
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, e) => { ws.onopen = r; ws.onerror = e; });
  const res = await new Promise((r) => { ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id === 1) r(d.result?.result?.value); }; ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } })); });
  ws.close();
  return res;
}
const killTree = (pid) => { try { process.kill(-pid, 'SIGTERM'); } catch {} };

if (PHASE === 'midi-observe') {
  const pid = launchChrome(BASE + '/');
  fs.writeFileSync(path.join(OUT, `${tag}-chrome.pid`), String(pid));
  await waitCdp();
  const t0 = Date.now(); const seen = [];
  for (let s = 0; s <= 30; s += 5) {
    while (Date.now() - t0 < s * 1000) await sleep(50);
    const txt = await rawEval('document.body ? document.body.innerText : "(no body)"').catch((e) => `(err ${e.message})`);
    seen.push(`${s}s ${j(String(txt).replace(/\s+/g, ' ').slice(0, 80))}`);
    if (s === 0 || s === 30) shot(`midi-prompt-${s}s`);
  }
  log('midi prompt unanswered, page text every 5 s:', seen.join(' | '));
  log('perm state', await rawEval("navigator.permissions.query({name:'midi'}).then(p=>p.state)").catch((e) => e.message));
  log('chrome left running for the Block click, pid', pid);
  process.exit(0);
}
if (PHASE === 'midi-block') {
  const x = +process.env.CLICK_X, y = +process.env.CLICK_Y; const pid = +process.env.CHROME_PID;
  log('before click:', j(String(await rawEval('document.body.innerText')).replace(/\s+/g, ' ').slice(0, 80)));
  log('real click on Block', xclick(x, y)); const t0 = Date.now();
  let started = null; const seen = [];
  while (Date.now() - t0 < 20000) {
    const txt = String(await rawEval('document.body.innerText').catch(() => '')).replace(/\s+/g, ' ');
    if (!started && !/Loading services/.test(txt) && txt.length > 20) { started = Date.now() - t0; seen.push(`${started}ms ${j(txt.slice(0, 80))}`); }
    if (started && Date.now() - t0 > started + 1500) break;
    await sleep(100);
  }
  shot('midi-after-block');
  log(`app left "Loading services..." ${started === null ? 'NEVER (20 s)' : started + ' ms after the real Block click'}; ${seen.join(' | ')}`);
  log('perm state', await rawEval("navigator.permissions.query({name:'midi'}).then(p=>p.state)").catch((e) => e.message));
  killTree(pid); await sleep(1000);
  log('chrome stopped', (() => { try { process.kill(pid, 0); return 'STILL RUNNING'; } catch { return 'yes'; } })());
  process.exit(0);
}

// zoom and motion: launch on about:blank, answer the MIDI prompt in advance through CDP (granted;
// this machine has no MIDI device), then open the app.
const pid = launchChrome('about:blank');
const browser = await (async () => { await waitCdp(); return chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); })();
let page;
try {
  const ctx = browser.contexts()[0];
  page = ctx.pages()[0] ?? await ctx.newPage();
  // Playwright emulates prefers-reduced-motion: no-preference (and a light colour scheme) by default,
  // which would hide the browser's own value: switch that emulation off.
  await page.emulateMedia({ reducedMotion: null, colorScheme: null });
  const cdp = await browser.newBrowserCDPSession();
  await cdp.send('Browser.grantPermissions', { origin: BASE, permissions: ['midi'] });
  // viewport 1480x960 at 100 %, like the emulated baseline
  const pcdp = await ctx.newCDPSession(page);
  const { windowId: wid } = await pcdp.send('Browser.getWindowForTarget');
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.locator('.main-menu-screen, button:has-text("Skip for now")').first().waitFor({ timeout: 20000 });
  let g = await page.evaluate(geometry);
  const chromeH = g.outerHeight - g.innerHeight;
  await pcdp.send('Browser.setWindowBounds', { windowId: wid, bounds: { left: 0, top: 0, width: 1480, height: 960 + chromeH } }); await sleep(800);
  const wb = (await pcdp.send('Browser.getWindowBounds', { windowId: wid })).bounds;
  g = await page.evaluate(geometry);
  log('chrome window', j(wb), 'page', j(g), 'version', (await waitCdp()).Browser);
  await page.evaluate(installRecorder);
  const text = () => page.evaluate(() => document.body.innerText);
  // Calibrate CSS px -> screen px with one real click on an inert spot (the main menu's background video).
  const guess = { x: wb.left + (g.outerWidth - g.innerWidth) / 2, y: wb.top + chromeH };
  const cal = { x: guess.x + 900, y: guess.y + 860 };
  xclick(cal.x, cal.y); await sleep(300);
  const d = await page.evaluate(lastDown);
  const origin = d ? { x: cal.x - d.x, y: cal.y - d.y } : guess;
  log('calibration click', j(d), 'content origin on screen', j(origin));
  shot('calibration');
  if ((await text()).includes('FIRST PRACTICE SETUP')) { await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForSelector('.main-menu-screen'); }
  await sleep(1500);
  // Real click on the first element matching sel whose text matches re.
  const realClick = async (sel, re, zoom) => {
    const c = await page.evaluate(([s, r]) => { const el = [...document.querySelectorAll(s)].find((e) => new RegExp(r, 'i').test((e.getAttribute('aria-label') || e.textContent || '').trim()) && e.getBoundingClientRect().width > 0); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; const t = document.elementFromPoint(x, y); return { x, y, hit: !!t && (t === el || el.contains(t)) }; }, [sel, re]);
    if (!c) return { found: false };
    xclick(origin.x + c.x * zoom, origin.y + c.y * zoom); await sleep(900);
    return { ...c, down: await page.evaluate(lastDown), screen: await page.evaluate(screenName) };
  };
  const toMenu = async () => { await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('.main-menu-screen'); await page.evaluate(installRecorder); await sleep(800); };

  if (PHASE === 'zoom') {
    // Which real key combinations zoom Chrome (from 100 %, reset with a real Ctrl+0)?
    for (const combo of ['ctrl+equal', 'ctrl+shift+equal', 'ctrl+KP_Add']) {
      xkey('ctrl+0'); await sleep(500); xkey(combo); await sleep(700);
      const z = await page.evaluate(geometry); log(`real ${combo} from 100%: dpr=${z.dpr} innerWidth=${z.innerWidth}`);
    }
    xkey('ctrl+0'); await sleep(600); log('after real ctrl+0 dpr', (await page.evaluate(geometry)).dpr);
    for (const [target, presses] of [[1.25, 2], [1.5, 3], [1.75, 4], [2, 5]]) {
      await toMenu();
      // Real Ctrl+0 until the page reports 100 % (a key press sent while the reload settles can be lost).
      for (let i = 0; i < 4 && (await page.evaluate(geometry)).dpr !== 1; i++) { xkey('ctrl+0'); await sleep(700); }
      let pressed = 0;
      for (let i = 0; i < presses + 3 && Math.abs((await page.evaluate(geometry)).dpr - target) > 0.01; i++) {
        if ((await page.evaluate(geometry)).dpr > target) { xkey('ctrl+minus'); } else { xkey('ctrl+equal'); pressed++; }
        await sleep(600);
      }
      g = await page.evaluate(geometry); const zoom = g.dpr;
      if (Math.abs(zoom - target) > 0.01) { log(`could not reach ${target * 100}% with real keys (dpr ${zoom}); skipping`); continue; }
      log(`\n=== chrome real Ctrl+= presses from 100%: ${pressed} -> dpr=${g.dpr} viewport ${g.innerWidth}x${g.innerHeight} (target ${target * 100}%)`);
      const pct = Math.round(zoom * 100);
      shot(`zoom-${pct}-main`);
      const s = await realClick('button', '^Settings', zoom); log('real click main-menu Settings', j({ hit: s.hit, down: s.down?.target, screen: s.screen }));
      if (s.screen !== 'settings-screen') { await page.getByRole('button', { name: /^Settings/ }).first().click(); await sleep(900); log('   (fell back to a DOM click to open Settings)'); }
      await clickEveryTab(page, origin, zoom, log);
      shot(`zoom-${pct}-settings`);
      for (const nm of ['Settings', 'Progress']) {
        await toMenu();
        const f = await realClick('button', '^Free Play', zoom); if (f.screen !== 'hud:Free Play') { log('   real click on the Free Play card did not open Free Play', j(f)); await page.locator('.main-menu-screen button', { hasText: /^Free Play/ }).first().click(); await sleep(1200); }
        await page.evaluate(() => document.activeElement?.blur()); await sleep(300);
        xkey('Tab'); await sleep(800);
        const hud = await page.evaluate(hudProbe);
        if (nm === 'Settings') { log(`HUD after one real Tab: ${j(hud)}`); shot(`zoom-${pct}-hud`); }
        const r = await realClick('.immersive-hud-nav-btn', `^${nm}$`, zoom);
        log(`HUD real click on ${nm.toUpperCase()} centre: hit-test at centre=${r.hit ? 'itself' : 'COVERED'}; pointerdown target ${j(r.down?.target)}; screen now ${r.screen}`);
      }
    }
    await toMenu(); xkey('ctrl+0'); await sleep(400);
  }

  if (PHASE === 'ctrl0') {
    // Does a real Ctrl+0 reset Chrome's zoom on each screen while the page has keyboard focus? Which
    // keydown did the page see, and did the app prevent it? (Zoom is per site, so it carries across screens.)
    const dprNow = async () => +(await page.evaluate(geometry)).dpr.toFixed(2);
    for (const where of ['main menu', 'settings', 'free play', 'library']) {
      await toMenu();
      if (where === 'main menu') xclick(origin.x + 900, origin.y + 860); // real click on the background gives the page focus
      if (where === 'settings') await page.getByRole('button', { name: /^Settings/ }).first().click();
      if (where === 'free play') await page.locator('.main-menu-screen button', { hasText: /^Free Play/ }).first().click();
      if (where === 'library') await page.locator('.main-menu-screen button', { hasText: /^Play Songs/ }).first().click();
      await sleep(1200); await page.evaluate(installRecorder);
      for (let i = 0; i < 4 && (await dprNow()) < 1.25; i++) { xkey('ctrl+equal'); await sleep(500); }
      const before = await dprNow();
      await page.evaluate(() => { window.__s1v.keys.length = 0; });
      xkey('ctrl+0'); await sleep(800);
      const after = await dprNow(); const keys = (await page.evaluate(() => window.__s1v.keys)).filter((k) => k.code === 'Digit0');
      log(`${where}: real Ctrl+0 at ${before * 100}% -> ${after * 100}%; page saw ${j(keys)}`);
      for (let i = 0; i < 4 && (await dprNow()) > 1; i++) { xkey('ctrl+minus'); await sleep(500); }
    }
  }

  if (PHASE === 'motion') {
    log('matchMedia(prefers-reduced-motion: reduce)', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
    const region = { x: Math.round(origin.x), y: Math.round(origin.y), width: g.innerWidth, height: g.innerHeight };
    const a = await page.evaluate(videoState); const ga = grabGray(region); await sleep(3000); const b = await page.evaluate(videoState); const gb = grabGray(region);
    log(`main menu: video ${j(a)} -> after 3 s ${j(b)}; screen-grab pixels changed ${diffFrac(ga, gb)}`);
    shot('motion-mainmenu');
    const f = await realClick('button', '^Free Play', 1); if (f.screen !== 'hud:Free Play') { log('   real click on the Free Play card did not open Free Play', j(f)); await page.locator('.main-menu-screen button', { hasText: /^Free Play/ }).first().click(); }
    await sleep(2000); await page.evaluate(() => document.activeElement?.blur());
    const rr = async (ms) => { const x = await page.evaluate(() => window.__s1v.raf); await sleep(ms); return +((((await page.evaluate(() => window.__s1v.raf)) - x) * 1000) / ms).toFixed(1); };
    const dh = async (n, gap) => { const s = new Set(); for (let i = 0; i < n; i++) { s.add(await page.evaluate(() => window.__s1vHash())); await sleep(gap); } return s.size; };
    const idleRaf = await rr(3000); const idleH = await dh(8, 250); const g1 = grabGray(region); await sleep(1500); const g2 = grabGray(region);
    const held = await sampleWhileHeld(page, ['z', 'x', 'c', 'v'], 600);
    await sleep(1500); const afterRaf = await rr(2000); const afterH = await dh(6, 250);
    log(`Free Play: idle RAF/s=${idleRaf}, distinct canvas hashes in 8 idle samples=${idleH}, idle screen-grab change over 1.5 s=${diffFrac(g1, g2)}; while holding real Z X C V (0.6 s each) distinct hashes=${held.distinctHashes}, max lit piano keys=${held.litMax}; after release RAF/s=${afterRaf}, distinct hashes in 6 samples=${afterH}`);
    shot('motion-freeplay');
    if (process.env.XSETTINGS_PID) {
      // Live flip of the OS switch while the page is open (SIGUSR1 toggles Gtk/EnableAnimations).
      for (let i = 0; i < 2; i++) {
        process.kill(+process.env.XSETTINGS_PID, 'SIGUSR1'); await sleep(1500);
        const mmLive = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
        await toMenu(); await sleep(1500); const v1 = await page.evaluate(videoState); await sleep(2000); const v2 = await page.evaluate(videoState);
        await page.locator('.main-menu-screen button', { hasText: /^Free Play/ }).first().click(); await sleep(2000); await page.evaluate(() => document.activeElement?.blur());
        const p2 = await page.context().newPage(); await p2.emulateMedia({ reducedMotion: null, colorScheme: null }); await p2.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
        const mmNewTab = await p2.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches); await p2.close(); await page.bringToFront();
        log(`after live XSETTINGS toggle ${i + 1}: matchMedia reduce in the open page=${mmLive}; after reloading the main menu: matchMedia=${await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)} video ${j(v1)} -> +2 s ${j(v2)}; Free Play idle RAF/s=${await rr(2000)}, distinct idle hashes in 8 samples=${await dh(8, 250)}; in a NEW tab matchMedia reduce=${mmNewTab}`);
      }
    }
  }
} finally {
  try { await browser.close(); } catch {}
  killTree(pid); await sleep(1000);
  log('chrome stopped', (() => { try { process.kill(pid, 0); return 'STILL RUNNING'; } catch { return 'yes'; } })());
}
log('DONE');
