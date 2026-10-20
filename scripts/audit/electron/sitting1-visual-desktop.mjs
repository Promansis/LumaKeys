// Sitting 1 (visual), desktop half: the PACKAGED app (electron-builder linux-unpacked, built in a
// throwaway copy) as a real, visible window on a throwaway Xvfb display managed by xfwm4.
// Real X key presses, clicks and window-manager minimise go through sitting1-visual-xtest.py.
// Env: LK_EXE (packaged executable), PROFILE (fresh empty dir under $TMPDIR; becomes HOME and
// XDG_CONFIG_HOME), OUT (evidence dir), DISPLAY (:90-:99), PHASES (comma list of
// item1,zoom,ctrl0,motion,cpu,missing), GTK_ANIMATIONS (unset: no GTK settings file; 'false' or 'true': write
// $XDG_CONFIG_HOME/gtk-{3,4}.0/settings.ini with gtk-enable-animations=<value>). Optional: EXTRA_ARGS
// (space-separated Chromium switches), XSETTINGS_PID (sitting1-visual-xsettings.py, flipped live twice
// in the motion phase), XVFB_PID_FILE (cpu phase: Xvfb's CPU is reported alongside).
// Run from $TMPDIR/pw next to sitting1-visual-probes.mjs and sitting1-visual-xtest.py.
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { xkey, xt, xclick, wmState, grabPng, grabGray, diffFrac, geometry, videoState, installRecorder, lastDown, centreOf, hudProbe, screenName, clickEveryTab, writeGtkSettings, sampleWhileHeld, j, sleep } from './sitting1-visual-probes.mjs';

const TMP = path.resolve(process.env.TMPDIR ?? '/nonexistent');
const PROFILE = path.resolve(process.env.PROFILE ?? '');
const OUT = process.env.OUT; const EXE = process.env.LK_EXE;
const PHASES = (process.env.PHASES ?? 'item1').split(',');
if (!PROFILE.startsWith(TMP + path.sep)) throw new Error(`PROFILE must be under $TMPDIR (${TMP}), got ${PROFILE}`);
if (fs.existsSync(PROFILE) && fs.readdirSync(PROFILE).length) throw new Error('PROFILE must be a fresh empty directory');
const CONFIG = path.join(PROFILE, '.config');
fs.mkdirSync(CONFIG, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
if (process.env.GTK_ANIMATIONS) writeGtkSettings(CONFIG, process.env.GTK_ANIMATIONS === 'true');
const env = { ...process.env, HOME: PROFILE, XDG_CONFIG_HOME: CONFIG, XDG_CACHE_HOME: path.join(PROFILE, '.cache'), XDG_DATA_HOME: path.join(PROFILE, '.local/share'),
  // No session bus: GTK must read the throwaway settings.ini, not the owner's live settings through a portal.
  DBUS_SESSION_BUS_ADDRESS: `unix:path=${path.join(PROFILE, 'no-session-bus')}` };
for (const k of ['HOME', 'XDG_CONFIG_HOME']) if (!path.resolve(env[k]).startsWith(TMP + path.sep)) throw new Error(`${k} escaped $TMPDIR`);
const tag = path.basename(PROFILE);
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const T0 = Date.now();

log('launch', j({ exe: EXE, extraArgs: process.env.EXTRA_ARGS ?? '', HOME: env.HOME, XDG_CONFIG_HOME: env.XDG_CONFIG_HOME, DISPLAY: env.DISPLAY, gtkAnimations: process.env.GTK_ANIMATIONS ?? '(no settings.ini)' }));
const app = await electron.launch({ executablePath: EXE, args: ['--no-sandbox', ...(process.env.EXTRA_ARGS ? process.env.EXTRA_ARGS.split(' ') : [])], env, timeout: 45000 });
const mainLog = fs.createWriteStream(path.join(OUT, `${tag}-main.log`));
app.process().stdout?.pipe(mainLog); app.process().stderr?.pipe(mainLog);
const page = await app.firstWindow();
page.setDefaultTimeout(15000);
// Playwright emulates prefers-reduced-motion: no-preference (and a light colour scheme) by default,
// which would hide the OS value: switch that emulation off.
await page.emulateMedia({ reducedMotion: null, colorScheme: null });
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Insecure Content-Security-Policy/.test(m.text())) errors.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message.slice(0, 200)}`));
page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url().split('/').slice(-2).join('/')} ${r.failure()?.errorText}`));
await page.waitForLoadState('domcontentloaded');
await page.evaluate(installRecorder);

const win = () => app.evaluate(({ BrowserWindow, app: a }) => {
  const w = BrowserWindow.getAllWindows()[0];
  return { xid: w.getNativeWindowHandle().readUInt32LE(0), bounds: w.getBounds(), content: w.getContentBounds(), visible: w.isVisible(), minimized: w.isMinimized(), focused: w.isFocused(), zoom: w.webContents.getZoomFactor(), userData: a.getPath('userData'), appData: a.getPath('appData'), isPackaged: a.isPackaged, menuBarVisible: w.isMenuBarVisible() };
});
let W = await win();
log('window', j(W));
if (!W.userData.startsWith(TMP + path.sep)) { await app.close(); throw new Error('userData is outside $TMPDIR: ' + W.userData); }
const content = () => ({ x: W.content.x, y: W.content.y, width: W.content.width, height: W.content.height });
const shot = (name) => grabPng(path.join(OUT, `${tag}-${name}.png`));
const text = () => page.evaluate(() => document.body.innerText);
const focusWin = async () => { xt('activate', W.xid); await sleep(300); };

// First launch: skip the setup guide.
await page.locator('.main-menu-screen, button:has-text("Skip for now")').first().waitFor();
if (/FIRST PRACTICE SETUP/i.test(await text())) { await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForSelector('.main-menu-screen'); }
const menuAt = Date.now();
log('main menu mounted');
if (!PHASES.includes('missing')) await sleep(2500);
log('matchMedia reduce', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'geometry', j(await page.evaluate(geometry)));

const toMainMenu = async () => {
  if (await page.locator('.main-menu-screen').count()) return;
  for (const name of ['Main Menu', 'Back to Main Menu']) { const b = page.getByRole('button', { name, exact: true }); if (await b.count() && await b.first().isVisible()) { await b.first().click(); await sleep(800); if (await page.locator('.main-menu-screen').count()) return; } }
  // collapsed play HUD: its Main button is in the DOM but hidden until the HUD opens
  if (await page.evaluate(() => { const b = [...document.querySelectorAll('.immersive-hud-nav-btn')].find((x) => x.textContent.trim() === 'Main'); b?.click(); return !!b; })) { await sleep(800); if (await page.locator('.main-menu-screen').count()) return; }
  await page.keyboard.press('Escape'); await sleep(600);
};

const videoWatch = async (label, seconds = 5) => {
  const a = await page.evaluate(videoState); const ga = grabGray(content());
  await sleep(seconds * 1000);
  const b = await page.evaluate(videoState); const gb = grabGray(content());
  log(`${label}: video ${j(a)} -> after ${seconds}s ${j(b)}; screen-grab pixels changed ${diffFrac(ga, gb)}`);
  return { a, b, diff: diffFrac(ga, gb) };
};

const rafRate = async (ms) => { const a = await page.evaluate(() => window.__s1v.raf); await sleep(ms); const b = await page.evaluate(() => window.__s1v.raf); return +(((b - a) * 1000) / ms).toFixed(1); };
const distinctHashes = async (n, gap) => { const s = new Set(); for (let i = 0; i < n; i++) { s.add(await page.evaluate(() => window.__s1vHash())); await sleep(gap); } return s.size; };

// Free Play idle vs pressed keys (real X key events held down).
const freePlayMotion = async (label) => {
  await page.getByRole('button', { name: 'Free Play', exact: true }).first().click(); await sleep(2000);
  await page.evaluate(() => document.activeElement?.blur());
  const idleRaf = await rafRate(3000); const idleHashes = await distinctHashes(8, 250);
  const ga = grabGray(content()); await sleep(1500); const gb = grabGray(content());
  await focusWin();
  const held = await sampleWhileHeld(page, ['z', 'x', 'c', 'v'], 600);
  await sleep(1500);
  const afterRaf = await rafRate(2000); const afterHashes = await distinctHashes(6, 250);
  log(`${label} Free Play: idle RAF/s=${idleRaf}, distinct canvas hashes in 8 idle samples=${idleHashes}, idle screen-grab change over 1.5 s=${diffFrac(ga, gb)}; while holding real Z X C V (0.6 s each) distinct hashes=${held.distinctHashes}, max lit piano keys=${held.litMax}; after release RAF/s=${afterRaf}, distinct hashes in 6 samples=${afterHashes}`);
  shot(`${label}-freeplay`);
  await page.getByRole('button', { name: 'Show play HUD' }).focus().catch(() => {});
  await toMainMenu();
};

try {
  if (PHASES.includes('item1')) {
    // (a) main-menu background
    await videoWatch('item1a main menu (5 s watch)', 5);
    shot('item1a-mainmenu');
    // (b) Flute pack
    await page.getByRole('button', { name: /^Settings/ }).first().click(); await sleep(900);
    log('item1b settings opened; selected tab', await page.evaluate(() => document.querySelector('[role=tab][aria-selected=true]')?.getAttribute('aria-label') || document.querySelector('[role=tab][aria-selected=true]')?.textContent));
    const adv = page.getByRole('button', { name: /show advanced options/i }); if (await adv.count()) { await adv.first().click(); await sleep(250); }
    const inst = page.locator('#settings-panel-audio label').filter({ hasText: /^Instrument/i }).locator('select, input').first();
    await inst.selectOption('flute'); await sleep(1200);
    await page.getByRole('button', { name: /Install Better Sounds/ }).click();
    let status = '';
    for (let i = 0; i < 20; i++) { status = await page.locator('.settings-status-message').innerText().catch(() => ''); if (/ready|fail|error|could not/i.test(status)) break; await sleep(500); }
    log('item1b status after Install Better Sounds', j(status));
    const packDir = path.join(W.userData, 'instrument-sample-packs', 'flute');
    log('item1b pack files in userData', fs.existsSync(packDir) ? fs.readdirSync(packDir).length : 'missing');
    shot('item1b-flute-installed');
    await toMainMenu();
    if (!(await page.locator('.main-menu-screen').count())) { const nav = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.getAttribute('aria-label') || b.textContent).trim()).filter(Boolean).slice(0, 25)); log('item1b no way back found; buttons', j(nav)); }
    // (c) Novice capstone. A fresh profile has it locked until the six Novice lessons are complete,
    // so mark them complete through the preload bridge (as lesson-pass.mjs does) before opening the hub.
    await page.getByRole('button', { name: 'Guided Lessons', exact: true }).click(); await sleep(1200);
    let cap = page.locator('.learn-capstone-card').first();
    log('item1c fresh-profile capstone card', j((await cap.innerText()).replace(/\n+/g, ' | ').slice(0, 60)), 'Attempt enabled', await cap.locator('button').first().isEnabled());
    await page.evaluate((ids) => window.appBridge.setSetting('learning', 'completedLessons', JSON.stringify(ids)), ['novice-01-keyboard-map', 'novice-02-finger-numbers', 'novice-03-posture-and-shape', 'novice-04-first-c-pattern', 'novice-05-rhythm-values', 'novice-06-first-song']);
    // the hub keeps progress loaded at startup in memory: reload the renderer so it reads the stored lessons
    await page.reload(); await page.waitForSelector('.main-menu-screen'); await page.evaluate(installRecorder); await sleep(1500);
    await page.getByRole('button', { name: 'Guided Lessons', exact: true }).click(); await sleep(1200);
    cap = page.locator('.learn-capstone-card').first();
    log('item1c capstone card after seeding the six Novice lessons as complete', j((await cap.innerText()).replace(/\n+/g, ' | ').slice(0, 140)), 'Attempt enabled', await cap.locator('button').first().isEnabled());
    await cap.locator('button').first().click(); await sleep(2500);
    log('item1c after open: screen', await page.evaluate(screenName), 'canvas count', await page.locator('canvas').count(), 'text', j((await text()).replace(/\n+/g, ' | ').slice(0, 200)));
    shot('item1c-capstone-loaded');
    const h0 = await distinctHashes(4, 250);
    const hud = () => page.evaluate(() => (document.body.innerText.match(/SCORE\n([^\n]+)/) || [])[1] ?? '?');
    await focusWin(); log('item1c real Space', xkey('space'));
    const seq = []; const tSpace = Date.now(); for (let i = 0; i < 10; i++) { seq.push(await page.evaluate(() => window.__s1vHash())); await sleep(400); }
    log(`item1c canvas: distinct hashes before Space (4 samples)=${h0}; in the 4 s after Space (count-in; Learn mode waits on the first note, E4, which starts on the hit line) distinct=${new Set(seq).size}; score ${await hud()}`);
    // Play the opening of Ode to Joy with real key presses (E4=/ F4=q G4=w, the default computer-keyboard map)
    // and watch the notes fall to the line.
    const seq2 = new Set(); const grabs = [grabGray(content())]; const scores = [];
    for (const k of ['slash', 'slash', 'q', 'w', 'w', 'q', 'slash', 'period']) {
      xkey(k); for (let i = 0; i < 4; i++) { seq2.add(await page.evaluate(() => window.__s1vHash())); await sleep(120); } scores.push(await hud());
    }
    grabs.push(grabGray(content()));
    log(`item1c after 8 real note presses: distinct canvas hashes=${seq2.size}, screen-grab change=${diffFrac(grabs[0], grabs[1])}, score after each press ${j(scores)}; ${(Date.now() - tSpace) / 1000}s since Space`);
    shot('item1c-capstone-playing');
    await focusWin(); log('item1c real Escape', xkey('Escape')); await sleep(800);
    const exits = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /Menu|Back|Resume|Hub/i.test(t)));
    log('item1c pause overlay buttons', j(exits));
    shot('item1c-paused');
    const exit = page.getByRole('button', { name: /^(Main Menu|Back to Learn Hub)$/ }).first();
    if (await exit.count()) { const nm = await exit.innerText(); await exit.click(); await sleep(1000); log(`item1c clicked "${nm}" -> screen`, await page.evaluate(screenName)); }
    await toMainMenu();
    log('item1c final screen', await page.evaluate(screenName));
  }

  if (PHASES.includes('zoom')) {
    await toMainMenu();
    const menu = await app.evaluate(({ Menu }) => { const m = Menu.getApplicationMenu(); if (!m) return null; const out = []; const walk = (items, p) => { for (const it of items) { if (/zoom|reset|actual/i.test(`${it.role ?? ''} ${it.label}`)) out.push(`${p}${it.label} role=${it.role} accel=${it.accelerator ?? '(role default)'}`); if (it.submenu) walk(it.submenu.items, `${p}${it.label} > `); } }; walk(m.items, ''); return { top: m.items.map((i) => i.label), zoom: out }; });
    log('zoom application menu', j(menu));
    W = await win();
    log('zoom window before keys', j({ zoom: W.zoom, menuBarVisible: W.menuBarVisible }), j(await page.evaluate(geometry)));
    // Harness-only reset between probes (main process), so each key is judged from 100 %.
    const hardReset = async () => { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomLevel(0)); await sleep(400); };
    const keyResults = {};
    for (const combo of ['ctrl+equal', 'ctrl+shift+equal', 'ctrl+plus', 'ctrl+KP_Add']) {
      await hardReset(); await focusWin(); xkey(combo); await sleep(600);
      W = await win(); const g = await page.evaluate(geometry);
      keyResults[combo] = W.zoom;
      log(`zoom from 100% after one real ${combo}: zoomFactor=${W.zoom.toFixed(4)} dpr=${g.dpr.toFixed(4)} innerWidth=${g.innerWidth}`);
    }
    for (const combo of ['ctrl+0', 'ctrl+KP_0', 'ctrl+minus']) {
      await hardReset(); await focusWin(); xkey('ctrl+shift+equal', 'ctrl+shift+equal'); await sleep(500); const before = (await win()).zoom;
      xkey(combo); await sleep(600); W = await win();
      log(`zoom real ${combo} from ${before.toFixed(4)} -> ${W.zoom.toFixed(4)}`);
    }
    await hardReset();
    shot('zoom-keys');
    const combo = Object.entries(keyResults).find(([, z]) => z > 1.01)?.[0];
    if (!combo) log('zoom RESULT: no zoom (no Ctrl and + combination changes the zoom factor)');
    else {
      // Walk the real steps: n presses of the working combo from 100 %.
      for (let n = 1; n <= 8; n++) {
        await toMainMenu(); await hardReset(); await focusWin();
        for (let i = 0; i < n; i++) { xkey(combo); await sleep(250); }
        await sleep(500);
        W = await win(); const g = await page.evaluate(geometry); const z = g.dpr;
        const pct = Math.round(W.zoom * 100);
        log(`\n=== desktop: ${n} x real ${combo}: zoomFactor=${W.zoom.toFixed(4)} (${pct}%) dpr=${g.dpr.toFixed(4)} viewport ${g.innerWidth}x${g.innerHeight}`);
        const origin = { x: W.content.x, y: W.content.y };
        await page.getByRole('button', { name: /^Settings/ }).first().click(); await sleep(900);
        await clickEveryTab(page, origin, z, log);
        if ([120, 131, 144, 158, 173, 189, 207].includes(pct)) shot(`zoom-${pct}-settings`);
        if (pct >= 120) {
          for (const nm of ['Settings', 'Progress']) {
            await toMainMenu();
            await page.getByRole('button', { name: 'Free Play', exact: true }).first().click(); await sleep(1500);
            await page.evaluate(() => document.activeElement?.blur());
            await focusWin(); xkey('Tab'); await sleep(700);
            const hud = await page.evaluate(hudProbe);
            if (nm === 'Settings') { log(`HUD after one real Tab: ${j(hud)}`); shot(`zoom-${pct}-hud`); }
            const c = await page.evaluate(centreOf, ['.immersive-hud-nav-btn', nm]);
            if (!c) { log(`HUD ${nm}: button not found`); continue; }
            xclick(origin.x + c.x * z, origin.y + c.y * z); await sleep(900);
            log(`HUD real click on ${nm} centre: hit-test at centre=${c.hit ? 'itself' : c.top}; pointerdown target ${j(await page.evaluate(lastDown))}; screen now ${await page.evaluate(screenName)}`);
          }
        }
      }
      await toMainMenu(); await hardReset();
    }
  }

  if (PHASES.includes('ctrl0')) {
    for (const where of ['main menu', 'settings', 'free play']) {
      await toMainMenu();
      if (where === 'settings') { await page.getByRole('button', { name: /^Settings/ }).first().click(); await sleep(900); }
      if (where === 'free play') { await page.getByRole('button', { name: 'Free Play', exact: true }).first().click(); await sleep(1500); await page.evaluate(() => document.activeElement?.blur()); }
      await page.evaluate(installRecorder); await focusWin();
      xkey('ctrl+shift+equal', 'ctrl+shift+equal'); await sleep(500);
      const before = (await win()).zoom;
      await page.evaluate(() => { window.__s1v.keys.length = 0; });
      xkey('ctrl+0'); await sleep(800);
      log(`${where}: real Ctrl+0 at zoomFactor ${before.toFixed(3)} -> ${(await win()).zoom.toFixed(3)}; page keydowns ${j(await page.evaluate(() => window.__s1v.keys))}`);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomLevel(0));
    }
  }

  if (PHASES.includes('motion')) {
    await toMainMenu();
    log('motion matchMedia(prefers-reduced-motion: reduce)', await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
    await videoWatch('motion main menu', 3);
    shot('motion-mainmenu');
    await freePlayMotion('motion');
    if (process.env.XSETTINGS_PID) {
      for (let i = 0; i < 2; i++) {
        process.kill(+process.env.XSETTINGS_PID, 'SIGUSR1'); await sleep(1500);
        await toMainMenu(); const v1 = await page.evaluate(videoState); await sleep(2000); const v2 = await page.evaluate(videoState);
        await page.getByRole('button', { name: 'Free Play', exact: true }).first().click(); await sleep(2000); await page.evaluate(() => document.activeElement?.blur());
        log(`after live XSETTINGS toggle ${i + 1} (no reload): matchMedia reduce=${await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)}; main menu video ${j(v1)} -> +2 s ${j(v2)}; Free Play idle RAF/s=${await rafRate(2000)}, distinct idle hashes in 8 samples=${await distinctHashes(8, 250)}`);
        await toMainMenu();
      }
    }
  }

  if (PHASES.includes('cpu')) {
    await toMainMenu(); await sleep(2000);
    const root = app.process().pid;
    const tree = () => { const all = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)); const kids = new Map(); for (const p of all) { try { const st = fs.readFileSync(`/proc/${p}/stat`, 'utf8'); const pp = +st.slice(st.lastIndexOf(')') + 2).split(' ')[1]; if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push(+p); } catch {} } const out = []; const walk = (p) => { out.push(p); for (const c of kids.get(p) ?? []) walk(c); }; walk(root); return out; };
    const ticks = (pids) => pids.reduce((s, p) => { try { const st = fs.readFileSync(`/proc/${p}/stat`, 'utf8'); const f = st.slice(st.lastIndexOf(')') + 2).split(' '); return s + +f[11] + +f[12]; } catch { return s; } }, 0);
    const xvfbPid = +fs.readFileSync(process.env.XVFB_PID_FILE, 'utf8');
    const CLK = 100;
    const sample = async (label) => { const p = tree(); const a = ticks(p), xa = ticks([xvfbPid]); const t = Date.now(); await sleep(30000); const b = ticks(tree()), xb = ticks([xvfbPid]); const s = (Date.now() - t) / 1000; const pct = +(((b - a) / CLK / s) * 100).toFixed(1); log(`cpu ${label}: Electron tree (${p.length} processes) ${pct}% of one core over ${s.toFixed(1)} s; Xvfb ${(((xb - xa) / CLK / s) * 100).toFixed(1)}%`); return pct; };
    const v0 = await videoWatch('cpu before (visible)', 2);
    const visible = await sample('visible main menu');
    W = await win(); log('cpu iconify (real WM request)', xt('iconify', W.xid)); await sleep(1500);
    W = await win(); log('cpu after iconify: window', j({ minimized: W.minimized, visible: W.visible, focused: W.focused }), 'WM', wmState(W.xid), 'page', j(await page.evaluate(videoState)));
    shot('cpu-minimised');
    const minimised = await sample('minimised main menu');
    log('cpu during minimise end: page', j(await page.evaluate(videoState)));
    log('cpu restore (EWMH activate)', xt('activate', W.xid)); await sleep(1500);
    W = await win(); log('cpu after restore: window', j({ minimized: W.minimized, visible: W.visible }), 'WM', wmState(W.xid));
    const after = await videoWatch('cpu after restore', 3);
    shot('cpu-restored');
    log(`cpu RESULT visible=${visible}% minimised=${minimised}% videoResumed=${after.b.currentTime > after.a.currentTime && !after.b.paused}`);
  }
  if (PHASES.includes('missing')) {
    // Packaged copy whose app.asar has no mainmenu-neonbackground.webm (WF-026 / RT-012).
    const menuState = () => page.evaluate(() => {
      const v = document.querySelector('[data-testid="main-menu-background-video"]');
      const s = document.querySelector('.main-menu-screen');
      const short = (u) => (u || '').replace(/file:\/\/\S*?\/app\.asar\//g, 'file://…/app.asar/');
      const cards = [...document.querySelectorAll('.main-menu-screen .menu-card')];
      return {
        video: v ? { present: true, paused: v.paused, currentTime: +v.currentTime.toFixed(2), readyState: v.readyState, networkState: v.networkState, error: v.error ? `${v.error.code} ${v.error.message}` : null, src: short(v.currentSrc || v.getAttribute('src')), poster: v.poster || null, videoWH: `${v.videoWidth}x${v.videoHeight}`, display: getComputedStyle(v).display, opacity: getComputedStyle(v).opacity } : { present: false },
        screen: !!s, bgImage: s ? short(getComputedStyle(s).backgroundImage).slice(0, 220) : null,
        resources: performance.getEntriesByType('resource').filter((e) => /neonbackground/.test(e.name)).map((e) => `${e.name.split('/').pop()} ${e.initiatorType} ${Math.round(e.duration)}ms body=${e.decodedBodySize} status=${e.responseStatus ?? '-'}`),
        cards: `${cards.filter((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && +getComputedStyle(c).opacity > 0.9; }).length}/${cards.length} visible`,
        messages: [...document.querySelectorAll('[role=alert],[role=status],.toast,.error-message')].map((e) => e.textContent.trim().slice(0, 80)).filter(Boolean),
      };
    });
    // The still behind the cards: does the webp decode, and how much of the frame does it paint?
    const stillProbe = () => page.evaluate(async () => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--main-menu-background-image');
      const url = (bg.match(/url\("([^"]+)"\)/) || [])[1];
      const img = new Image(); img.src = url;
      const ok = await img.decode().then(() => true, (e) => String(e));
      return { url: url?.replace(/file:\/\/\S*?\/app\.asar\//, 'file://…/app.asar/'), decoded: ok, natural: `${img.naturalWidth}x${img.naturalHeight}` };
    });
    for (const t of [0, 2, 5]) {
      const wait = menuAt + t * 1000 - Date.now(); if (wait > 0) await sleep(wait);
      const st = await menuState(); const g = grabGray(content());
      log(`missing t=${t}s (since menu mount ${((Date.now() - menuAt) / 1000).toFixed(2)}s)`, j(st));
      shot(`missing-t${t}s`);
      if (t === 5) {
        log('missing still image', j(await stillProbe()));
        await page.evaluate(() => { document.querySelector('.main-menu-screen').style.background = '#010819'; }); await sleep(400);
        const plain = grabGray(content()); shot('missing-t5s-still-removed');
        await page.evaluate(() => { document.querySelector('.main-menu-screen').style.background = ''; }); await sleep(400);
        const back = grabGray(content());
        log(`missing still A/B: pixels changed when the still is replaced by plain #010819 = ${diffFrac(g, plain)}; after restoring it = ${diffFrac(g, back)}`);
      }
    }
    // Every menu card with a real X click at its centre, then back to the menu.
    W = await win(); await focusWin();
    const origin = { x: W.content.x, y: W.content.y }; const zoom = W.zoom;
    for (const title of ['Play Songs', 'Guided Lessons', 'Free Play', 'Soundboard', 'Theory Trainer', 'Progress', 'Settings', 'Keyboard Setup']) {
      const c = await page.evaluate(centreOf, ['.main-menu-screen .menu-card', title]);
      if (!c) { log(`missing card ${title}: not found`); continue; }
      const sx = origin.x + c.x * zoom, sy = origin.y + c.y * zoom;
      const n0 = await page.evaluate(() => window.__s1v.downs.length);
      xclick(sx, sy); await sleep(1200);
      const reached = await page.evaluate(screenName); const pd = await page.evaluate((n) => window.__s1v.downs.slice(n)[0] ?? null, n0);
      log(`missing card ${title}: real click at screen (${Math.round(sx)},${Math.round(sy)}) hit=${c.hit} pointerdown=${pd ? `${pd.target} trusted=${pd.trusted}` : 'none'} -> ${reached}`);
      if (title === 'Free Play') shot('missing-freeplay');
      await toMainMenu(); await sleep(300);
      if (!(await page.locator('.main-menu-screen').count())) log(`missing card ${title}: did NOT return to the main menu (screen ${await page.evaluate(screenName)})`);
    }
    await sleep(1500);
    log('missing after the card tour', j(await menuState()));
    shot('missing-after-tour');
  }
  log('ERRORS', errors.length, j(errors.slice(0, 12)));
} finally {
  try { await app.close(); } catch {}
}
log('DONE');
