// Lane E (RT-008, PH-UI-001, PH-UI-004): keyboard-only walk with a computed-style focus-indicator check.
// Env: DATA, SHOTS, FIX (dir with .mid fixtures), PART (optional: comma list of parts). Port 3793.
import { withServer, text } from './harness.mjs';
import fs from 'node:fs';
const j = JSON.stringify;
const shots = process.env.SHOTS;
const PART = (process.env.PART || 'menu,destinations,settings,library,dialogs,hud,immersive').split(',');
const ANIM = process.env.ANIM === '1';
const NOANIM = ANIM ? '.__none{}' : '*,*::before,*::after{transition:none!important;animation:none!important}';
const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className?.baseVal ?? el.className).trim().split(/\s+/).slice(0, 2).join('.')} "${(el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"`;

// Runs in the page: classify the focus indicator of document.activeElement by comparing with its blurred state.
const probe = () => {
  const a = document.activeElement; if (!a || a === document.body) return null;
  const snap = (el) => { const s = getComputedStyle(el); return { os: s.outlineStyle, ow: parseFloat(s.outlineWidth), oc: s.outlineColor, oo: s.outlineOffset, bs: s.boxShadow, bc: s.borderTopColor + s.borderRightColor + s.borderBottomColor + s.borderLeftColor, bw: s.borderTopWidth, bg: s.backgroundColor, bi: s.backgroundImage.slice(0, 60), f: s.filter, t: s.transform, td: s.textDecorationLine, c: s.color }; };
  const alpha = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return 1; const p = m[1].split(/[ ,\/]+/); return p.length > 3 ? parseFloat(p[3]) : 1; };
  const f = snap(a);
  a.blur(); const u = snap(a); a.focus({ focusVisible: true });
  const kinds = [];
  if (f.os !== 'none' && f.ow > 0 && alpha(f.oc) > 0 && (f.os !== u.os || f.ow !== u.ow || f.oc !== u.oc)) kinds.push(`outline ${f.ow}px ${f.os === 'auto' ? 'AUTO(browser default ring)' : f.os} ${f.oc}`);
  if (f.bs !== 'none' && f.bs !== u.bs) kinds.push('box-shadow');
  if (f.bc !== u.bc || f.bw !== u.bw) kinds.push('border');
  const weak = [];
  if (f.bg !== u.bg || f.bi !== u.bi) weak.push('background');
  if (f.f !== u.f) weak.push('filter');
  if (f.t !== u.t) weak.push('transform');
  if (f.td !== u.td) weak.push('underline');
  if (f.c !== u.c) weak.push('text-color');
  const r = a.getBoundingClientRect();
  const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
  const top = document.elementFromPoint(cx, cy);
  const inView = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  const reach = !!top && (top === a || a.contains(top) || top.contains(a));
  const dlg = a.closest('[role="dialog"]');
  return { kinds, weak, inView, reach, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], inDialog: dlg ? (dlg.getAttribute('aria-labelledby') || 'dialog') : null, tag: a.tagName };
};

async function walk(page, label, { max = 40, key = 'Tab', stopOnWrap = true, shotNone = true, fullShots = false } = {}) {
  const rows = []; const seen = new Set();
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(key); await page.waitForTimeout(60);
    const info = await page.evaluate(probe);
    const d = await page.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? `${a.tagName.toLowerCase()}${a.id ? '#' + a.id : ''}.${String(a.className?.baseVal ?? a.className).trim().split(/\s+/).slice(0, 2).join('.')} "${(a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)}"` : 'body'; });
    if (!info) { rows.push({ d, none: 'focus on body' }); if (stopOnWrap && rows.length > 2 && rows.slice(-2).every((r) => r.d === 'body')) break; continue; }
    const k = d + j(info.rect);
    if (stopOnWrap && seen.has(k)) { rows.push({ d, wrap: true }); break; }
    seen.add(k); rows.push({ d, ...info });
    if (fullShots) await page.screenshot({ path: `${shots}/E-full-${label}-${String(i).padStart(2, '0')}.png` });
    if (shotNone && (!info.kinds.length || info.kinds.some((k) => /AUTO/.test(k))) && info.inView) {
      const [x, y, w, h] = info.rect; const pad = 12;
      const clip = { x: Math.max(0, x - pad), y: Math.max(0, y - pad), width: Math.min(1180, w + pad * 2), height: Math.min(700, h + pad * 2) };
      const base = `${shots}/E-focus-${label}-${String(i).padStart(2, '0')}`;
      await page.screenshot({ path: base + '-on.png', clip }).catch(() => {});
      await page.evaluate(() => { window.__f = document.activeElement; document.activeElement?.blur(); }); await page.waitForTimeout(ANIM ? 450 : 120);
      await page.screenshot({ path: base + '-off.png', clip }).catch(() => {});
      await page.evaluate(() => window.__f?.focus({ focusVisible: true }));
      await page.waitForTimeout(ANIM ? 450 : 60);
    }
  }
  const real = rows.filter((r) => !r.wrap);
  const noInd = real.filter((r) => r.kinds && !r.kinds.length);
  const unreach = real.filter((r) => r.kinds && (!r.inView || !r.reach));
  console.log(`## ${label}: ${real.length} stops; strong indicator (outline/shadow/border) on ${real.filter((r) => r.kinds?.length).length}; none on ${noInd.length}; not in view or occluded at centre on ${unreach.length}`);
  for (const r of real) console.log(`   ${r.d} | ${r.kinds ? (r.kinds.join(' + ') || ('NONE' + (r.weak.length ? ' (weak: ' + r.weak.join(',') + ')' : ''))) : r.none}${r.kinds && (!r.inView || !r.reach) ? ' | inView=' + r.inView + ' reach=' + r.reach : ''}${r.inDialog ? ' | dialog:' + r.inDialog : ''}`);
  return rows;
}

const seed = async (base) => {
  for (const f of fs.readdirSync(process.env.FIX).filter((x) => x.endsWith('.mid'))) {
    const fd = new FormData(); fd.append('files', new Blob([fs.readFileSync(process.env.FIX + '/' + f)]), f);
    await fetch(base + '/api/midi/upload', { method: 'POST', body: fd });
  }
};
const VP = (process.env.VP || '1480x960').split('x').map(Number);
const fresh = async (ctx, base, vp = { width: VP[0], height: VP[1] }) => {
  const p = await ctx.newPage(); await p.setViewportSize(vp); await p.goto(base + '/', { waitUntil: 'networkidle' });
  if ((await text(p)).includes('FIRST PRACTICE SETUP')) await p.getByRole('button', { name: 'Skip for now' }).click();
  await p.waitForSelector('.main-menu-screen'); await p.addStyleTag({ content: NOANIM }); await p.waitForTimeout(600);
  await p.evaluate(() => document.activeElement?.blur()); return p;
};
const goto = async (p, name) => { await p.getByRole('button', { name, exact: true }).first().click(); await p.waitForTimeout(900); await p.addStyleTag({ content: NOANIM }); await p.evaluate(() => document.activeElement?.blur()); };
const home = async (p, base) => { await p.setViewportSize({ width: VP[0], height: VP[1] }); await p.goto(base + '/', { waitUntil: 'networkidle' }); await p.waitForSelector('.main-menu-screen'); await p.addStyleTag({ content: NOANIM }); await p.waitForTimeout(500); await p.evaluate(() => document.activeElement?.blur()); };
const active = (p) => p.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? `${a.tagName.toLowerCase()}.${String(a.className).split(' ')[0]} "${(a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"` : 'body'; });
const screenName = (p) => p.evaluate(() => document.querySelector('main')?.className?.split(' ').filter((c) => /screen|shell/.test(c)).join(' ') || 'unknown');

await withServer(process.env.DATA, async ({ ctx, base, errors }) => {
  await seed(base);
  let p = await fresh(ctx, base);

  if (PART.includes('menu')) {
    await walk(p, 'main-menu', { max: 30 });
  }

  if (PART.includes('destinations')) {
    for (const nav of ['Guided Lessons', 'Theory Trainer', 'Progress', 'Keyboard Setup']) {
      await home(p, base); await goto(p, nav); await walk(p, 'dest-' + nav.replace(/ /g, '-'), { max: 30 });
    }
  }

  if (PART.includes('settings')) {
    await home(p, base); await goto(p, 'Settings');
    // Tab to the tablist, then ArrowRight through every tab
    const names = [];
    for (let i = 0; i < 12; i++) { await p.keyboard.press('Tab'); const r = await p.evaluate(() => document.activeElement?.getAttribute('role')); if (r === 'tab') break; }
    console.log('## settings tablist: focus reached tab via Tab:', await active(p));
    for (let i = 0; i < 8; i++) {
      await p.waitForTimeout(80);
      const info = await p.evaluate(probe); const d = await active(p);
      console.log(`   tab[${i}] ${d} | ${info?.kinds.join(' + ') || 'NONE'} | inView=${info?.inView} reach=${info?.reach}`);
      if (info && !info.kinds.length) await p.screenshot({ path: `${shots}/E-focus-settings-tab-${i}.png` });
      await p.keyboard.press('ArrowRight');
    }
    await p.keyboard.press('Home'); await p.waitForTimeout(100);
    console.log('   Home key ->', await active(p));
    await walk(p, 'settings-after-tablist', { max: 45, shotNone: true });
  }

  if (PART.includes('library')) {
    await home(p, base); await goto(p, 'Play Songs');
    await p.screenshot({ path: `${shots}/E-library-overview.png` });
    await walk(p, 'library', { max: 70 });
    // Card actions: open the detail panel with the keyboard, walk it, then try the delete action
    const songs = async () => (await (await fetch(base + '/api/bridge/getLibrarySnapshot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"args":[]}' })).json()).result.songs.length;
    const more = p.locator('article.song-card').first().getByRole('button', { name: 'More', exact: true });
    await more.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(600);
    await p.screenshot({ path: `${shots}/E-library-detail-panel.png` });
    console.log('## library card "More" opened with Enter; visible buttons now:', j(await p.$$eval('button', (b) => b.filter((x) => x.offsetParent).map((x) => x.textContent.trim().replace(/\s+/g, ' ').slice(0, 24)).filter(Boolean).slice(-22))));
    const edit = p.locator('article.song-card').first().getByRole('button', { name: /^Edit/ }); if (await edit.count()) { await edit.first().focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }
    const del = p.getByRole('button', { name: 'Delete Song', exact: true });
    if (await del.count()) {
      const n0 = await songs(); await del.first().focus();
      const info = await p.evaluate(probe); console.log(`   Delete Song focused: indicator ${info?.kinds.join(' + ') || 'NONE'}`);
      p.once('dialog', (d) => console.log('   native dialog appeared:', d.type(), d.message()));
      await p.keyboard.press('Enter'); await p.waitForTimeout(800);
      console.log(`   Enter on Delete Song: songs ${n0} -> ${await songs()}; status text: ${j((await text(p)).match(/Deleted[^\n]*/)?.[0] ?? null)}; any dialog role present: ${await p.evaluate(() => !!document.querySelector('[role=dialog]'))}`);
    } else console.log('   Delete Song button not found');
  }

  const contain = async (page, label, n = 14) => {
    const trail = []; let outside = 0;
    for (let i = 0; i < n; i++) { await page.keyboard.press('Tab'); await page.waitForTimeout(40); const r = await page.evaluate(() => { const a = document.activeElement; const d = a?.closest?.('[role="dialog"]'); return { in: !!d, t: a && a !== document.body ? `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18)}"` : 'body' }; }); if (!r.in) outside++; trail.push(r.t + (r.in ? '' : ' [OUTSIDE]')); }
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(40); const r = await page.evaluate(() => { const a = document.activeElement; return { in: !!a?.closest?.('[role="dialog"]'), t: a && a !== document.body ? `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 18)}"` : 'body' }; }); if (!r.in) outside++; trail.push('S-' + r.t + (r.in ? '' : ' [OUTSIDE]')); }
    console.log(`   ${label}: ${n} Tab + 4 Shift+Tab presses, stops outside the dialog = ${outside}; trail: ${trail.slice(0, 8).join(' > ')}`);
    return outside;
  };
  const dlgState = (page) => page.evaluate(() => ({ dialogs: [...document.querySelectorAll('[role="dialog"]')].map((d) => d.getAttribute('aria-labelledby') || d.getAttribute('aria-label') || 'dialog'), screen: (document.querySelector('main')?.className || '').split(' ').filter((c) => /screen/.test(c)).join(' '), focus: (() => { const a = document.activeElement; return a && a !== document.body ? `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"` : 'body'; })() }));

  if (PART.includes('dialogs')) {
    await home(p, base); await goto(p, 'Settings');
    await p.getByRole('tab', { name: 'Practice' }).click(); await p.waitForTimeout(300);
    for (const label of ['Clear Learning Progress', 'Delete User Data']) {
      const trigger = p.getByRole('button', { name: new RegExp('^' + label) }).first();
      await trigger.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
      const st = await dlgState(p);
      console.log(`## Settings confirmation "${label}": after Enter -> dialogs=${j(st.dialogs)} focus=${st.focus} screen=${st.screen}`);
      await walk(p, 'confirm-' + label.replace(/ /g, '-'), { max: 4, stopOnWrap: false, shotNone: true });
      await contain(p, 'containment', 10);
      await p.screenshot({ path: `${shots}/E-dialog-${label.replace(/ /g, '-')}.png` });
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
      const st2 = await dlgState(p);
      console.log(`   Escape -> dialogs=${j(st2.dialogs)} screen=${st2.screen} focus=${st2.focus}  (PH-UI-004 oracle: dialog closed, still on settings-screen; PH-UI-001/focus restore: focus back on the trigger)`);
    }
    // Latency wizard
    await p.getByRole('tab', { name: 'Audio' }).click(); await p.waitForTimeout(300);
    const cal = p.getByRole('button', { name: /Calibrate/ }).first();
    if (await cal.count()) {
      await cal.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
      const st = await dlgState(p); console.log(`## Latency wizard: after Enter -> dialogs=${j(st.dialogs)} focus=${st.focus} screen=${st.screen}`);
      await walk(p, 'latency-wizard', { max: 8, stopOnWrap: false });
      await contain(p, 'containment', 10);
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
      const st2 = await dlgState(p); console.log(`   Escape -> dialogs=${j(st2.dialogs)} screen=${st2.screen} focus=${st2.focus}`);
    }
    // Escape with no modal on Settings: intended global back to main menu
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    console.log('## Escape with no modal on Settings ->', (await dlgState(p)).screen);
  }

  if (PART.includes('hud')) {
    for (const [name, label] of [['Free Play', 'free-play-hud'], ['Soundboard', 'soundboard-hud']]) {
      await home(p, base); await goto(p, name); await p.waitForTimeout(400);
      await walk(p, label, { max: 14, stopOnWrap: true, shotNone: true, fullShots: true });
    }
    await home(p, base); await goto(p, 'Play Songs');
    await p.locator('article.song-card').first().getByRole('button', { name: 'Play', exact: true }).click(); await p.waitForTimeout(1500); await p.evaluate(() => document.activeElement?.blur());
    await walk(p, 'game-hud', { max: 14, stopOnWrap: true, shotNone: true, fullShots: true });
  }

  if (PART.includes('immersive')) {
    for (const [name, label] of [['Free Play', 'free-play'], ['Soundboard', 'soundboard']]) {
      await home(p, base); await goto(p, name); await p.waitForTimeout(500);
      await p.keyboard.press('Escape'); await p.waitForTimeout(500);
      let st = await dlgState(p);
      console.log(`## ${name}: Escape opens overlay -> dialogs=${j(st.dialogs)} focus=${st.focus} screen=${st.screen}`);
      await walk(p, label + '-overlay', { max: 60, stopOnWrap: true, shotNone: true });
      await contain(p, label + ' overlay', 50);
      await p.screenshot({ path: `${shots}/E-overlay-${label}.png` });
      await p.keyboard.press('Escape'); await p.waitForTimeout(500);
      st = await dlgState(p);
      console.log(`   Escape (top modal) -> dialogs=${j(st.dialogs)} screen=${st.screen} focus after close=${st.focus}`);
      await p.keyboard.press('Escape'); await p.waitForTimeout(400);
      st = await dlgState(p); console.log(`   second Escape -> dialogs=${j(st.dialogs)} screen=${st.screen} (expected: overlay reopens, screen unchanged)`);
    }
    // Game session overlay
    await home(p, base); await goto(p, 'Play Songs');
    const card = p.locator('article.song-card').first();
    await card.getByRole('button', { name: 'Play', exact: true }).click(); await p.waitForTimeout(1500);
    await p.evaluate(() => document.activeElement?.blur());
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    let st = await dlgState(p);
    console.log(`## Game: Escape -> dialogs=${j(st.dialogs)} focus=${st.focus} screen=${st.screen}`);
    await walk(p, 'game-overlay', { max: 60, stopOnWrap: true, shotNone: true });
    await contain(p, 'game overlay', 50);
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    st = await dlgState(p); console.log(`   Escape -> dialogs=${j(st.dialogs)} screen=${st.screen} focus after close=${st.focus}`);
  }
}, { port: 3793, timeout: 15000, context: { bypassCSP: true } });
