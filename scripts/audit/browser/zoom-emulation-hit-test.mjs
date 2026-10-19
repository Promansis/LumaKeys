// Lane E (RT-006, PH-UI-002 re-verification): EMULATED zoom. Headless Chromium has no browser zoom, so the CSS
// viewport is shrunk by the zoom factor and deviceScaleFactor is raised to match. Real zoom stays with user sittings.
// For each size: Settings tab hit tests, horizontal overflow and control reachability on every main screen.
// Env: DATA, SHOTS, FIX. Port 3794.
import { withServer, text } from './harness.mjs';
import fs from 'node:fs';
const j = JSON.stringify;
const SIZES = [['100% min window', 1180, 780, 1], ['125%', 1184, 768, 1.25], ['150%', 987, 640, 1.5], ['175%', 846, 549, 1.75], ['200%', 740, 480, 2], ['100% default', 1480, 960, 1]];
const only = process.env.SIZES ? process.env.SIZES.split(',') : null;
const probe = () => {
  const out = { overflowX: document.documentElement.scrollWidth - innerWidth, bodyOverflowX: document.body.scrollWidth - innerWidth, btns: 0, failed: [] };
  const els = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=tab]')];
  for (const el of els) {
    if (el.disabled) continue;
    let ghost = false, n = el;
    while (n && n !== document.documentElement) { const s = getComputedStyle(n); if (n.getAttribute('aria-hidden') === 'true' || parseFloat(s.opacity) < 0.05 || s.visibility === 'hidden' || s.display === 'none') { ghost = true; break; } n = n.parentElement; }
    if (ghost) continue;
    const r0 = el.getBoundingClientRect(); if (r0.width === 0 || r0.height === 0) continue;
    out.btns++;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const inView = cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight;
    const top = inView ? document.elementFromPoint(cx, cy) : null;
    const hit = !!top && (top === el || el.contains(top) || top.contains(el) || (el.labels && [...el.labels].some((l) => l.contains(top))));
    if (!inView || !hit) out.failed.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}" ${inView ? 'covered by ' + (top ? top.tagName.toLowerCase() + '.' + String(top.className).split(' ')[0] : 'nothing') : 'outside viewport'} h=${Math.round(r.height)}`);
  }
  window.scrollTo(0, 0);
  return out;
};
await withServer(process.env.DATA, async ({ ctx, base }) => {
  for (const f of fs.readdirSync(process.env.FIX).filter((x) => x.endsWith('.mid'))) { const fd = new FormData(); fd.append('files', new Blob([fs.readFileSync(process.env.FIX + '/' + f)]), f); await fetch(base + '/api/midi/upload', { method: 'POST', body: fd }); }
  for (const [label, w, h, dsf] of SIZES) {
    if (only && !only.includes(label.split(' ')[0])) continue;
    const c = await ctx.browser().newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
    const p = await c.newPage(); p.setDefaultTimeout(10000);
    console.log(`\n=== ${label}: viewport ${w}x${h} @ DSF ${dsf} (actual innerWidth ${await (async () => { await p.goto(base + '/', { waitUntil: 'networkidle' }); return p.evaluate(() => `${innerWidth}x${innerHeight} dpr=${devicePixelRatio}`); })()})`);
    if ((await text(p)).includes('FIRST PRACTICE SETUP')) await p.getByRole('button', { name: 'Skip for now' }).click();
    await p.waitForSelector('.main-menu-screen'); await p.waitForTimeout(1200);
    const report = async (name) => { await p.waitForTimeout(500); const r = await p.evaluate(probe); console.log(`${name}: horizontal overflow documentElement=${r.overflowX}px body=${r.bodyOverflowX}px; ${r.btns} visible controls; not reachable by hit test=${r.failed.length}${r.failed.length ? ' -> ' + j(r.failed.slice(0, 6)) : ''}`); return r; };
    await report('main menu');
    await p.screenshot({ path: `${process.env.SHOTS}/E-zoom-${label.split(' ')[0].replace('%', '')}-main.png` });
    // Settings tabs
    const goto = async (n) => { await p.goto(base + '/', { waitUntil: 'networkidle' }); await p.waitForSelector('.main-menu-screen'); await p.getByRole('button', { name: n, exact: true }).first().click(); await p.waitForTimeout(900); };
    await goto('Settings');
    const tl = await p.evaluate(() => { const row = document.querySelector('.settings-tab-row'); const tabs = [...document.querySelectorAll('[role=tab]')]; return { rowClientH: row.clientHeight, rowScrollH: row.scrollHeight, tabH: tabs.map((t) => Math.round(t.getBoundingClientRect().height)), n: tabs.length }; });
    console.log(`settings tablist: client height ${tl.rowClientH}px (scroll ${tl.rowScrollH}px), tab heights ${j(tl.tabH)}  [PH-UI-002 failing state was client 4px vs tab 46px]`);
    const names = await p.$$eval('[role=tab]', (t) => t.map((x) => x.getAttribute('aria-label')));
    const results = [];
    for (const nme of names) {
      const r = await p.evaluate((nm) => { const t = [...document.querySelectorAll('[role=tab]')].find((x) => x.getAttribute('aria-label') === nm); t.scrollIntoView({ block: 'center', inline: 'center' }); const b = t.getBoundingClientRect(); const cx = b.left + b.width / 2, cy = b.top + b.height / 2; const top = document.elementFromPoint(cx, cy); return { cx, cy, hit: !!top && (top === t || t.contains(top)), top: top ? top.tagName.toLowerCase() + '.' + String(top.className).split(' ')[0] : null, inView: cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight }; }, nme);
      let clicked = null;
      if (r.hit && r.inView) { await p.mouse.click(r.cx, r.cy); await p.waitForTimeout(250); clicked = await p.evaluate((nm) => [...document.querySelectorAll('[role=tab]')].find((x) => x.getAttribute('aria-label') === nm).getAttribute('aria-selected'), nme); }
      results.push(`${nme}: hit=${r.hit}${r.hit ? '' : ' (' + r.top + ')'} inView=${r.inView} selectedAfterClick=${clicked}`);
    }
    console.log('settings tab hit tests:', results.join(' | '));
    const tabsOk = results.every((x) => /hit=true/.test(x) && /selectedAfterClick=true/.test(x));
    console.log(`settings: all ${names.length} tabs hit and selected by pointer = ${tabsOk}`);
    await p.screenshot({ path: `${process.env.SHOTS}/E-zoom-${label.split(' ')[0].replace('%', '')}-settings.png` });
    await report('settings (active tab panel)');
    for (const nm of ['Audio', 'Visual', 'Gameplay', 'Input', 'Practice']) { const t = p.getByRole('tab', { name: nm }); if (await t.count()) { await t.click(); await report(`settings tab ${nm}`); } }
    for (const [n, name] of [['Play Songs', 'library'], ['Guided Lessons', 'learn hub'], ['Theory Trainer', 'theory hub'], ['Progress', 'progress'], ['Free Play', 'free play'], ['Soundboard', 'soundboard']]) { await goto(n); await report(name); if (['free play', 'soundboard'].includes(name)) { await p.getByRole('button', { name: 'Show play HUD' }).focus(); await report(name + ' with HUD expanded (tab focus)'); } }
    // game HUD and overlay
    await goto('Play Songs');
    await p.locator('article.song-card').first().getByRole('button', { name: 'Play', exact: true }).click(); await p.waitForTimeout(1500);
    await report('game HUD'); await p.getByRole('button', { name: 'Show play HUD' }).focus(); await report('game HUD expanded (tab focus)'); await p.screenshot({ path: `${process.env.SHOTS}/E-zoom-${label.split(' ')[0].replace('%', '')}-game.png` });
    await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press('Escape'); await p.waitForTimeout(600);
    await report('game session overlay');
    await c.close();
  }
}, { port: 3794, timeout: 12000 });
