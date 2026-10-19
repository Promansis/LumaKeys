// Lane E (WF-026, RT-012, L-11-015): main-menu background video under reduced motion,
// missing asset, hidden tab, and throttled bandwidth. Env: DATA, SHOTS. Port 3791.
import { withServer, text } from './harness.mjs';
const shots = process.env.SHOTS;
const VID = '**/mainmenu-neonbackground.webm';
const state = (page) => page.evaluate(() => {
  const v = document.querySelector('[data-testid="main-menu-background-video"]');
  const screen = document.querySelector('.main-menu-screen');
  const anims = document.getAnimations().filter((a) => a.playState === 'running');
  return {
    video: !!v,
    paused: v?.paused, readyState: v?.readyState, networkState: v?.networkState, currentTime: v ? +v.currentTime.toFixed(2) : null,
    err: v?.error ? { code: v.error.code, msg: v.error.message } : null,
    src: v?.currentSrc?.split('/').pop(),
    muted: v?.muted, loop: v?.loop, autoplay: v?.autoplay,
    screenBg: screen ? getComputedStyle(screen).backgroundImage.slice(0, 90) : null,
    runningCssAnimations: anims.length,
    visibility: document.visibilityState,
  };
});
const j = (o) => JSON.stringify(o);
await withServer(process.env.DATA, async ({ ctx, base }) => {
  const mk = async (label, pre) => {
    const p = await ctx.newPage(); p.setDefaultTimeout(15000);
    const errs = []; p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
    p.on('requestfailed', (r) => errs.push(`[requestfailed] ${r.url().split('/').pop()} ${r.failure()?.errorText}`));
    p.on('response', (r) => { if (r.status() >= 400) errs.push(`[http ${r.status()}] ${r.url().split('/').pop()}`); });
    if (pre) await pre(p);
    return { p, errs, label };
  };
  const open = async (p) => {
    await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await p.locator('.main-menu-screen, button:has-text("Skip for now")').first().waitFor({ timeout: 15000 });
    if ((await text(p)).includes('FIRST PRACTICE SETUP')) { await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForSelector('.main-menu-screen'); }
  };
  // Seed: skip first-run guide once
  { const { p } = await mk('seed'); await open(p); await p.waitForTimeout(500); await p.close(); }

  // A1: reduce set before load
  { const { p, errs } = await mk('A1', (p) => p.emulateMedia({ reducedMotion: 'reduce' }));
    await open(p); await p.waitForTimeout(1500);
    console.log('A1 reduce-before-load', j(await state(p)), 'matchMedia', await p.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), 'errs', j(errs));
    await p.screenshot({ path: `${shots}/E-video-A1-reduce-before-load.png` });
    // A3: toggle to no-preference after load
    await p.emulateMedia({ reducedMotion: 'no-preference' }); await p.waitForTimeout(2500);
    console.log('A3 toggled to no-preference after load', j(await state(p)));
    const t1 = (await state(p)).currentTime; await p.waitForTimeout(1000); console.log('   currentTime advance', t1, '->', (await state(p)).currentTime);
    await p.emulateMedia({ reducedMotion: 'reduce' }); await p.waitForTimeout(1500);
    console.log('A4 toggled back to reduce after load', j(await state(p)));
    await p.screenshot({ path: `${shots}/E-video-A4-reduce-after-toggle.png` });
    await p.close(); }

  // A2: no-preference baseline
  { const { p, errs } = await mk('A2', (p) => p.emulateMedia({ reducedMotion: 'no-preference' }));
    await open(p); await p.waitForTimeout(3000);
    const s1 = await state(p); await p.waitForTimeout(1000); const s2 = await state(p);
    console.log('A2 no-preference baseline', j(s1), 'currentTime after 1s', s2.currentTime, 'errs', j(errs));
    await p.screenshot({ path: `${shots}/E-video-A2-no-preference.png` });
    // compact viewport
    await p.setViewportSize({ width: 760, height: 700 }); await p.waitForTimeout(1200);
    console.log('A5 viewport 760 wide (compact query max-width:780)', j(await state(p)));
    await p.setViewportSize({ width: 1280, height: 800 }); await p.waitForTimeout(1500);
    const s3 = await state(p);
    console.log('A6 viewport back to 1280', j(s3));
    await p.close(); }

  // B: missing asset
  for (const mode of ['abort', '404']) {
    const { p, errs } = await mk('B' + mode, async (p) => {
      await p.route(VID, (r) => (mode === 'abort' ? r.abort('failed') : r.fulfill({ status: 404, body: 'nope' })));
    });
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    await open(p); await p.waitForTimeout(3000);
    const st = await state(p);
    const usable = await p.getByRole('button', { name: 'Free Play', exact: true }).first().isVisible();
    console.log(`B missing asset (${mode})`, j(st), 'menu cards visible', usable, 'errs', j(errs));
    await p.screenshot({ path: `${shots}/E-video-B-missing-${mode}.png` });
    await p.getByRole('button', { name: 'Free Play', exact: true }).first().click(); await p.waitForTimeout(800);
    console.log(`   click Free Play with missing video ->`, (await p.evaluate(() => document.querySelector('canvas') ? 'canvas present' : 'no canvas')));
    await p.close();
  }

  // C: hidden tab
  { const { p } = await mk('C', (p) => p.emulateMedia({ reducedMotion: 'no-preference' }));
    await open(p); await p.waitForTimeout(3000);
    console.log('C0 before hide', j(await state(p)));
    const p2 = await ctx.newPage(); await p2.goto('about:blank'); await p2.bringToFront(); await p2.waitForTimeout(2000);
    console.log('C1 second page in front, first page:', j(await state(p)));
    // CDP lifecycle hidden emulation
    const cdp = await ctx.newCDPSession(p);
    await p.bringToFront();
    // visibility override + event (renderer cannot be hidden headless; this tests app listeners only)
    await p.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await p.waitForTimeout(2000);
    const s1 = await state(p); await p.waitForTimeout(1000); const s2 = await state(p);
    console.log('C2 visibilityState overridden to hidden + visibilitychange:', j(s1), 'currentTime +1s', s2.currentTime, 'paused', s2.paused);
    try { await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }); } catch (e) { console.log('   focus emulation n/a', e.message.slice(0, 80)); }
    try { await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); await p.waitForTimeout(500); console.log('C3 lifecycle frozen sent (not hidden semantic)'); await cdp.send('Page.setWebLifecycleState', { state: 'active' }); } catch (e) { console.log('   lifecycle n/a', e.message.slice(0, 80)); }
    const src = await p.evaluate(() => [...document.scripts].length);
    await p.close(); await p2.close(); }

  // D: throttled bandwidth
  for (const kbit of [400, 1500, 10000]) {
    // Cold HTTP cache: assets are served immutable, so a fresh context is needed for honest first-load timing.
    const c2 = await ctx.browser().newContext({ viewport: { width: 1280, height: 800 } });
    const p = await c2.newPage(); p.setDefaultTimeout(60000);
    const errs = []; p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) errs.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
    await p.emulateMedia({ reducedMotion: 'no-preference' });
    const cdp = await c2.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 100, downloadThroughput: (kbit * 1000) / 8, uploadThroughput: (kbit * 1000) / 8 });
    await p.addInitScript(() => {
      window.__t = {};
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__t[e.name] = Math.round(e.startTime); }).observe({ type: 'paint', buffered: true });
    });
    const t0 = Date.now();
    await p.goto(base + '/', { waitUntil: 'commit' });
    let tMenu = null, tCard = null, tVidReady = null, tVidPlaying = null;
    const sample = [];
    for (let i = 0; i < 400; i++) {
      const s = await p.evaluate(() => {
        const v = document.querySelector('[data-testid="main-menu-background-video"]');
        const card = [...document.querySelectorAll('button')].find((b) => /Free Play/.test(b.textContent));
        return { menu: !!document.querySelector('.main-menu-screen'), card: !!card && card.offsetParent !== null, rs: v?.readyState ?? -1, paused: v?.paused, ct: v?.currentTime ?? 0,
          buffered: v && v.buffered.length ? +v.buffered.end(0).toFixed(1) : 0, dur: v ? v.duration : null };
      }).catch(() => null);
      if (!s) { await p.waitForTimeout(250); continue; }
      const t = Date.now() - t0;
      if (s.menu && tMenu === null) tMenu = t;
      if (s.card && tCard === null) tCard = t;
      if (s.rs >= 3 && tVidReady === null) tVidReady = t;
      if (s.ct > 0 && tVidPlaying === null) tVidPlaying = t;
      if (i % 20 === 0) sample.push(`${(t / 1000).toFixed(0)}s rs=${s.rs} buf=${s.buffered} ct=${s.ct.toFixed(1)} paused=${s.paused} dur=${s.dur}`);
      if (tCard !== null && t > 75000) break;
      if (tVidPlaying !== null) break;
      await p.waitForTimeout(250);
    }
    const paints = await p.evaluate(() => window.__t).catch(() => ({}));
    console.log(`D throttle ${kbit} kbit/s: menu element at ${tMenu}ms, Free Play card visible ${tCard}ms, video readyState>=3 at ${tVidReady}ms, video currentTime>0 at ${tVidPlaying}ms, paint entries ${j(paints)}`);
    console.log('   samples', j(sample));
    if (tCard !== null) {
      await p.screenshot({ path: `${shots}/E-video-D-${kbit}kbit-menu.png` });
      const clickT = Date.now();
      await p.getByRole('button', { name: 'Free Play', exact: true }).first().click({ timeout: 30000 }).catch((e) => console.log('   click fail', e.message.slice(0, 100)));
      await p.waitForSelector('canvas', { timeout: 30000 }).catch(() => {});
      console.log(`   usable before video finished: Free Play opened ${Date.now() - clickT}ms after click; video state at that moment`, j(await state(p).catch(() => null)));
    }
    console.log('   errs', j(errs.slice(0, 5)));
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await c2.close();
  }

  // E: cold-load wire bytes before and after the menu appears (what competes with the video)
  { const c2 = await ctx.browser().newContext({ viewport: { width: 1280, height: 800 } });
    const p = await c2.newPage(); const cdp = await c2.newCDPSession(p); await cdp.send('Network.enable');
    const urls = new Map(); const sizes = [];
    cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url.split('/').slice(3).join('/')));
    cdp.on('Network.loadingFinished', (e) => sizes.push([urls.get(e.requestId), e.encodedDataLength]));
    await p.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.main-menu-screen'); const before = sizes.reduce((a, [, n]) => a + n, 0);
    await p.waitForTimeout(6000);
    const all = sizes.reduce((a, [, n]) => a + n, 0);
    console.log('E cold load unthrottled: bytes finished by menu render', before, 'bytes after 6 s', all);
    console.log('   per resource', j(sizes.filter(([, n]) => n > 20000).sort((a, b) => b[1] - a[1]).map(([u, n]) => `${u} ${n}`)));
    console.log('   content-encoding of main js', await p.evaluate(async () => { const s = [...document.scripts].find((x) => x.src)?.src; const r = await fetch(s, { cache: 'no-store' }); return `${s.split('/').pop()} enc=${r.headers.get('content-encoding')} len=${r.headers.get('content-length')}`; }));
    await c2.close(); }
}, { port: 3791, timeout: 15000 });
