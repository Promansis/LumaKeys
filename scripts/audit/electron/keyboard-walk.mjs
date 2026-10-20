// Desktop half of lane E's keyboard walk (A4: RT-008, PH-UI-010, PH-UI-011, PH-UI-013,
// PH-UI-014, PH-UI-017), keyboard only after each screen is opened:
// (a) Progress: Tab through the top bar; is there a visible focus indicator?
// (b) Settings, Audio, Calibrate (Enter), Escape: does only the dialog close?
// (c) Soundboard: Escape three times; where does each press land?
// (d) Free Play: Tab through the page; how many stops are invisible (aria-hidden or
//     transparent)?
// (e) Settings, Practice, Clear Learning Progress (Enter), Escape, Tab: where does focus go?
// Each part starts from a renderer reload, which opens the main menu, like the web
// drivers' fresh page. Env: PROFILE (empty, under $TMPDIR), LK_SQLITE_MODULE. Run from $TMPDIR/pw.
import { withElectron, text } from './electron-harness.mjs';
import path from 'node:path';
const profile = process.env.PROFILE;
const j = JSON.stringify;

// focus indicator of document.activeElement, compared with its blurred state (keyboard-focus-matrix.mjs)
const indicator = () => {
  const a = document.activeElement; if (!a || a === document.body) return null;
  const snap = (el) => { const s = getComputedStyle(el); return { os: s.outlineStyle, ow: parseFloat(s.outlineWidth), oc: s.outlineColor, bs: s.boxShadow, bc: s.borderTopColor + s.borderBottomColor, bg: s.backgroundColor, t: s.transform, c: s.color }; };
  const f = snap(a); a.blur(); const u = snap(a); a.focus({ focusVisible: true });
  const kinds = [];
  if (f.os !== 'none' && f.ow > 0 && (f.os !== u.os || f.ow !== u.ow || f.oc !== u.oc)) kinds.push(`outline ${f.ow}px ${f.os}`);
  if (f.bs !== 'none' && f.bs !== u.bs) kinds.push('box-shadow');
  if (f.bc !== u.bc) kinds.push('border');
  for (const [k, n] of [['bg', 'background'], ['t', 'transform'], ['c', 'text-color']]) if (f[k] !== u[k]) kinds.push(`weak:${n}`);
  return { label: `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`, inNav: !!a.closest('.immersive-hud-nav'), focusVisible: a.matches(':focus-visible'), kinds };
};
// invisible stops (hidden-focus-stops.mjs)
const ghost = () => {
  const a = document.activeElement; if (!a || a === document.body) return null;
  let op = 1, ariaHidden = null, vis = 'visible'; let n = a;
  while (n && n !== document.documentElement) {
    const s = getComputedStyle(n); op *= parseFloat(s.opacity); if (s.visibility === 'hidden') vis = 'hidden';
    if (!ariaHidden && n.getAttribute?.('aria-hidden') === 'true') ariaHidden = (n.id || n.className || n.tagName).toString().split(' ')[0];
    n = n.parentElement;
  }
  const r = a.getBoundingClientRect();
  return { label: `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22)}"`, op: +op.toFixed(2), ariaHidden, vis, key: `${a.className}|${Math.round(r.left)},${Math.round(r.top)}` };
};
const active = () => { const a = document.activeElement; return a && a !== document.body ? `${a.tagName} "${(a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}" inDialog=${!!a.closest('[role=dialog]')}` : 'body'; };
const where = () => {
  if (document.querySelector('.main-menu-screen')) return 'MAIN MENU';
  if (document.querySelector('[role="dialog"]')) return 'dialog open';
  if (document.querySelector('.settings-screen')) return 'Settings';
  return 'screen, no dialog';
};

await withElectron(profile, async (h) => {
  const { page } = h;
  await page.waitForTimeout(2500);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  const home = async () => { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForSelector('.main-menu-screen'); await page.waitForTimeout(1200); };
  const go = async (name) => { await home(); await page.getByRole('button', { name, exact: true }).first().click(); await page.waitForTimeout(1200); await page.evaluate(() => document.activeElement?.blur()); };
  console.log('document.hasFocus', await page.evaluate(() => document.hasFocus()));

  // (a) Progress top bar
  await go('Progress');
  const nav = page.locator('.immersive-hud-nav').first(); const box = await nav.boundingBox();
  const clip = { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: Math.min(1400, box.width + 20), height: box.height + 20 };
  await page.screenshot({ path: path.join(profile, 'a-nav-unfocused.png'), clip });
  const navStops = [];
  for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(80); const r = await page.evaluate(indicator); if (r?.inNav && !navStops.some((x) => x.label === r.label)) navStops.push(r); if (i === 4) await page.screenshot({ path: path.join(profile, 'a-nav-focused.png'), clip }); }
  const strong = navStops.filter((r) => r.kinds.some((k) => !k.startsWith('weak:')));
  console.log('(a) nav stops', navStops.length, 'with outline/box-shadow/border', strong.length, 'focus-visible', navStops.filter((r) => r.focusVisible).length, j(navStops.slice(0, 4)));
  console.log('(a) current-page marker on Progress button', j(await page.evaluate(() => { const b = [...document.querySelectorAll('.immersive-hud-nav button')].find((x) => /progress/i.test(x.textContent)); return b ? { aria: b.getAttribute('aria-current'), cls: b.className } : null; })));

  // (b) Latency calibration, Escape
  await go('Settings');
  await page.getByRole('tab', { name: 'Audio' }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Calibrate/ }).first().focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
  const bOpen = { where: await page.evaluate(where), focus: await page.evaluate(active) };
  await page.screenshot({ path: path.join(profile, 'b-calibrate-open.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);
  console.log('(b) Calibrate open', j(bOpen), '-> Escape ->', j({ where: await page.evaluate(where), focus: await page.evaluate(active) }), '(oracle: only the dialog closes, Settings stays)');

  // (c) Soundboard, Escape x3
  await go('Soundboard');
  const seq = [];
  for (let i = 1; i <= 4; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); const w = await page.evaluate(where); seq.push(`Esc#${i}: ${w}`); if (w === 'MAIN MENU') break; }
  console.log('(c) Soundboard keyboard only:', seq.join(' | '));

  // (d) Free Play Tab walk
  await go('Free Play');
  const rows = []; const seen = new Set(); let wrapped = false;
  for (let i = 0; i < 200; i++) {
    await page.keyboard.press('Tab'); await page.waitForTimeout(200);
    const r = await page.evaluate(ghost);
    if (!r) { rows.push(null); if (rows.slice(-2).every((x) => x === null)) break; continue; }
    if (seen.has(r.key)) { wrapped = true; break; } seen.add(r.key); rows.push(r);
  }
  const real = rows.filter(Boolean); const ghosts = real.filter((r) => r.ariaHidden || r.op < 0.1 || r.vis === 'hidden');
  console.log(`(d) Free Play: ${real.length} Tab stops before ${wrapped ? 'wrapping' : 'cap/end'}; invisible (aria-hidden, transparent or hidden) ${ghosts.length}; inside aria-hidden ${real.filter((r) => r.ariaHidden).length}`);
  console.log('(d) first invisible stops', j(ghosts.slice(0, 4).map((g) => `${g.label} aria-hidden=${g.ariaHidden} op=${g.op}`)));

  // (e) Clear Learning Progress, Escape, Tab
  await go('Settings');
  await page.getByRole('tab', { name: 'Practice' }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Clear Learning Progress/ }).first().focus();
  await page.evaluate(() => { window.__trig = document.activeElement; });
  await page.keyboard.press('Enter'); await page.waitForTimeout(1000);
  const eOpen = { where: await page.evaluate(where), focus: await page.evaluate(active) };
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  const eClosed = { where: await page.evaluate(where), focus: await page.evaluate(active), triggerConnected: await page.evaluate(() => window.__trig.isConnected), triggerFocused: await page.evaluate(() => document.activeElement === window.__trig) };
  await page.keyboard.press('Tab'); await page.waitForTimeout(200);
  const eTab = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(); return { focus: `${a.tagName} "${(a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`, top: Math.round(r.top), inNav: !!a.closest('.immersive-hud-nav') }; });
  console.log('(e) open', j(eOpen), '| Escape ->', j(eClosed), '| Tab ->', j(eTab));
  console.log('ERRORS', j(h.errors.filter((e) => !/Insecure Content-Security-Policy|polyphony/.test(e)).slice(0, 10)));
});
console.log('DONE');
