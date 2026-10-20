// Sitting 1 (visual) shared helpers for the packaged desktop app and real google-chrome on a
// throwaway Xvfb display: genuine X input through sitting1-visual-xtest.py, x11grab screen
// grabs, and in-page probes. Copy next to the Playwright install ($TMPDIR/pw) with the drivers.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DISPLAY = process.env.DISPLAY ?? '';
if (!/^:9\d$/.test(DISPLAY)) throw new Error(`DISPLAY must be a throwaway Xvfb display (:90-:99), got ${DISPLAY}`);
export const XT = process.env.XTEST ?? path.join(path.dirname(new URL(import.meta.url).pathname), 'sitting1-visual-xtest.py');
export const j = JSON.stringify;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Real X input (XTEST) and real window-manager requests.
export const xt = (...args) => execFileSync('python3', ['-I', XT, ...args.map(String)], { env: { ...process.env, DISPLAY }, encoding: 'utf8' }).trim();
export const xkey = (...combos) => xt('key', ...combos);
export const xclick = (x, y) => xt('click', Math.round(x), Math.round(y));
export const xmove = (x, y) => xt('move', Math.round(x), Math.round(y));
// Hold a key down for ms (real XTEST press, release after ms) without blocking: returns a promise.
export const xholdAsync = (combo, ms) => new Promise((r) => { const c = spawn('python3', ['-I', XT, 'keyhold', combo, String(ms)], { env: { ...process.env, DISPLAY }, stdio: 'ignore' }); c.on('exit', r); });
// Press a key while sampling the page every ~30 ms: distinct canvas hashes and lit piano keys.
export async function sampleWhileHeld(page, keys, holdMs = 600) {
  const seen = new Set(); let litMax = 0;
  for (const k of keys) {
    const done = xholdAsync(k, holdMs); let finished = false; done.then(() => { finished = true; });
    while (!finished) { const s = await page.evaluate(() => ({ h: window.__s1vHash(), lit: document.querySelectorAll('.white-key.active, .black-key.active').length })); seen.add(s.h); litMax = Math.max(litMax, s.lit); await sleep(30); }
    await sleep(150);
  }
  return { distinctHashes: seen.size, litMax };
}
export const wmState = (xid) => {
  try { return execFileSync('xprop', ['-id', String(xid), 'WM_STATE', '_NET_WM_STATE'], { env: { ...process.env, DISPLAY }, encoding: 'utf8' }).replace(/\s+/g, ' ').trim(); } catch (e) { return `xprop error ${e.message.slice(0, 80)}`; }
};

// Screen grabs of the whole Xvfb screen (or a region) through ffmpeg x11grab.
export const grabPng = (file, region) => {
  const args = ['-loglevel', 'error', '-f', 'x11grab'];
  if (region) args.push('-video_size', `${region.width}x${region.height}`, '-i', `${DISPLAY}+${region.x},${region.y}`);
  else args.push('-i', DISPLAY);
  execFileSync('ffmpeg', [...args, '-frames:v', '1', '-y', file]);
  return file;
};
export const grabGray = (region) => {
  const args = ['-loglevel', 'error', '-f', 'x11grab', '-video_size', `${region.width}x${region.height}`, '-i', `${DISPLAY}+${region.x},${region.y}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'];
  return execFileSync('ffmpeg', args, { maxBuffer: 64 * 1024 * 1024 });
};
// Fraction of pixels whose grey level changed by more than 8 between two grabs.
export const diffFrac = (a, b) => { let n = 0; for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 8) n++; return +(n / a.length).toFixed(4); };

// In-page probes (pass to page.evaluate).
export const geometry = () => ({ dpr: devicePixelRatio, innerWidth, innerHeight, outerWidth, outerHeight, screenX, screenY, visibility: document.visibilityState, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
export const videoState = () => {
  const v = document.querySelector('[data-testid="main-menu-background-video"]');
  return v ? { paused: v.paused, currentTime: +v.currentTime.toFixed(2), readyState: v.readyState, src: v.currentSrc.split('/').pop(), err: v.error?.code ?? null, autoplay: v.autoplay, visibility: document.visibilityState } : { video: false, visibility: document.visibilityState, screen: !!document.querySelector('.main-menu-screen') };
};
export const installRecorder = () => {
  if (window.__s1v) return;
  window.__s1v = { downs: [], raf: 0, keys: [] };
  // Registered after the app's own window keydown listener, so defaultPrevented shows what the app did.
  window.addEventListener('keydown', (e) => window.__s1v.keys.push({ code: e.code, ctrl: e.ctrlKey, shift: e.shiftKey, trusted: e.isTrusted, prevented: e.defaultPrevented }));
  const d = (t) => (t ? `${t.tagName.toLowerCase()}${t.className && typeof t.className === 'string' ? '.' + t.className.trim().split(/\s+/)[0] : ''} "${(t.getAttribute?.('aria-label') || t.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"` : 'null');
  document.addEventListener('pointerdown', (e) => window.__s1v.downs.push({ x: Math.round(e.clientX), y: Math.round(e.clientY), trusted: e.isTrusted, target: d(e.target) }), true);
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { window.__s1v.raf++; return orig(cb); };
  window.__s1vHash = () => {
    const out = [];
    for (const c of document.querySelectorAll('canvas')) {
      try { const t = document.createElement('canvas'); t.width = 64; t.height = 40; const tc = t.getContext('2d'); tc.drawImage(c, 0, 0, 64, 40); const px = tc.getImageData(0, 0, 64, 40).data; let h = 0; for (let i = 0; i < px.length; i++) h = (h * 31 + px[i]) | 0; out.push(h); } catch { out.push('err'); }
    }
    return out.join(',');
  };
};
export const lastDown = () => window.__s1v?.downs.at(-1) ?? null;
// Centre of an element (CSS px) and what a hit test finds there.
export const centreOf = ([sel, text]) => {
  const els = [...document.querySelectorAll(sel)].filter((e) => !text || (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ') === text);
  const el = els.find((e) => e.getBoundingClientRect().width > 0) ?? null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  return { x, y, w: Math.round(r.width), h: Math.round(r.height), inView: x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight, hit: !!top && (top === el || el.contains(top)), top: top ? `${top.tagName.toLowerCase()}.${String(top.className).split(' ')[0]} "${(top.getAttribute('aria-label') || top.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 20)}"` : null };
};
// The expanded HUD: which nav buttons are covered at their centre, and what overlaps the nav strip
// (same measure as zoom-hud-overlap.mjs).
export const hudProbe = () => {
  const navBtns = [...document.querySelectorAll('.immersive-hud-nav-btn')];
  const covered = []; const overlaps = [];
  for (const b of navBtns) { const r = b.getBoundingClientRect(); const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!(t === b || b.contains(t))) covered.push(`${b.textContent.trim()} <- ${(t?.getAttribute?.('aria-label') || t?.textContent || t?.className || '').toString().trim().replace(/\s+/g, ' ').slice(0, 22)}`); }
  const nav = document.querySelector('.immersive-hud-nav'); const nr = nav?.getBoundingClientRect();
  const others = [...document.querySelectorAll('.immersive-hud button, .immersive-hud [class*=status], .immersive-hud-status, .immersive-hud > div > div')].filter((e) => nav && !nav.contains(e) && !e.contains(nav));
  for (const e of others) { const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue; const ix = Math.min(r.right, nr.right) - Math.max(r.left, nr.left), iy = Math.min(r.bottom, nr.bottom) - Math.max(r.top, nr.top); if (ix > 4 && iy > 4) overlaps.push(`${(e.getAttribute('aria-label') || e.textContent || e.className).toString().trim().replace(/\s+/g, ' ').slice(0, 24)} overlaps nav by ${Math.round(ix)}x${Math.round(iy)}px`); }
  const tab = document.querySelector('.immersive-hud-tab');
  return { expanded: tab?.getAttribute('aria-expanded'), active: document.activeElement?.getAttribute('aria-label') || document.activeElement?.textContent?.trim().slice(0, 20), navCount: navBtns.length, covered, overlaps: [...new Set(overlaps)].slice(0, 6) };
};
export const screenName = () => {
  const m = [...document.querySelectorAll('[class*="-screen"]')].map((e) => String(e.className).split(' ').find((c) => c.endsWith('-screen'))).filter(Boolean);
  const cur = document.querySelector('.immersive-hud-nav-btn[aria-current=page]');
  return [...new Set(m)].slice(0, 3).join(',') || (cur ? `hud:${cur.textContent.trim()}` : document.querySelector('[role=tablist]') ? 'tablist' : 'unknown');
};

// Settings: click every tab with a real X click at its centre; origin maps CSS px to screen px.
export async function clickEveryTab(page, origin, zoom, log) {
  const names = await page.$$eval('[role=tab]', (t) => t.map((x) => x.getAttribute('aria-label') || x.textContent.trim()));
  const res = [];
  for (const nm of names) {
    await page.evaluate((n) => { const t = [...document.querySelectorAll('[role=tab]')].find((x) => (x.getAttribute('aria-label') || x.textContent.trim()) === n); t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, nm);
    await sleep(150);
    const c = await page.evaluate(centreOf, ['[role=tab]', nm]);
    if (!c) { res.push(`${nm}: not found`); continue; }
    let sel = null, down = null;
    if (c.inView) {
      xclick(origin.x + c.x * zoom, origin.y + c.y * zoom); await sleep(350);
      sel = await page.evaluate((n) => [...document.querySelectorAll('[role=tab]')].find((x) => (x.getAttribute('aria-label') || x.textContent.trim()) === n)?.getAttribute('aria-selected'), nm);
      down = await page.evaluate(lastDown);
    }
    res.push(`${nm}: hit=${c.hit}${c.hit ? '' : ' (' + c.top + ')'} inView=${c.inView} h=${c.h} selectedAfterRealClick=${sel}${down && !down.trusted ? ' UNTRUSTED' : ''}`);
  }
  const ok = res.length > 0 && res.every((x) => /hit=true/.test(x) && /selectedAfterRealClick=true/.test(x));
  log(`settings tabs (${names.length}) real-click results: ${res.join(' | ')}`);
  log(`settings: every tab opened by a real click = ${ok}`);
  return ok;
}

export const writeGtkSettings = (configHome, animations) => {
  for (const v of ['gtk-3.0', 'gtk-4.0']) {
    fs.mkdirSync(path.join(configHome, v), { recursive: true });
    fs.writeFileSync(path.join(configHome, v, 'settings.ini'), `[Settings]\ngtk-enable-animations=${animations ? 'true' : 'false'}\n`);
  }
};
