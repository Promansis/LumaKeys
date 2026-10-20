// Sitting 3 copy of zoom-hud-overlap.mjs (own port via PORT, DSFS env filters sizes, long boot waits). Original header: Lane E (RT-006): EMULATED zoom. Does the expanded immersive HUD (Free Play, Soundboard, Game) keep its nav buttons
// clickable? Reports the element under the centre of every nav button and any nav button covered by another control.
// Env: DATA, SHOTS. Port 3794.
import { withServer, text } from './harness.mjs';
import fs from 'node:fs';
const j = JSON.stringify;
await withServer(process.env.DATA, async ({ ctx, base }) => {
  for (const f of fs.readdirSync(process.env.FIX).filter((x) => x.endsWith('.mid'))) { const fd = new FormData(); fd.append('files', new Blob([fs.readFileSync(process.env.FIX + '/' + f)]), f); await fetch(base + '/api/midi/upload', { method: 'POST', body: fd }); }
  for (const [w, h, dsf] of [[1180, 780, 1], [1184, 768, 1.25], [987, 640, 1.5], [846, 549, 1.75], [740, 480, 2]].filter(([, , d]) => !process.env.DSFS || process.env.DSFS.split(',').includes(String(d)))) {
    for (const screen of ['Free Play', 'Soundboard', 'Game']) {
      const c = await ctx.browser().newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf }); const p = await c.newPage();
      await p.goto(base + '/', { waitUntil: 'networkidle' }); p.setDefaultTimeout(30000);
      await p.getByRole('button', { name: /Skip for now|^Play Songs$/ }).first().waitFor({ timeout: 60000 });
      if ((await text(p)).includes('FIRST PRACTICE SETUP')) { await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForSelector('.main-menu-screen'); }
      if (screen === 'Game') { await p.getByRole('button', { name: 'Play Songs', exact: true }).first().click(); await p.waitForTimeout(900); await p.locator('article.song-card').first().getByRole('button', { name: 'Play', exact: true }).click(); await p.waitForTimeout(1500); }
      else { await p.getByRole('button', { name: screen, exact: true }).first().click(); await p.waitForTimeout(1200); }
      await p.getByRole('button', { name: 'Show play HUD' }).focus(); await p.waitForTimeout(700);
      const g = await p.evaluate(() => {
        const navBtns = [...document.querySelectorAll('.immersive-hud-nav-btn')];
        const covered = []; const textOverlap = [];
        for (const b of navBtns) { const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const t = document.elementFromPoint(x, y); if (!(t === b || b.contains(t))) covered.push(`${b.textContent.trim()} <- ${(t?.textContent || t?.className || '').toString().trim().slice(0, 22)}`); }
        // any other HUD child that intersects the nav strip horizontally and vertically
        const nav = document.querySelector('.immersive-hud-nav'); const nr = nav?.getBoundingClientRect();
        const others = [...document.querySelectorAll('.immersive-hud button, .immersive-hud [class*=status], .immersive-hud-status, .immersive-hud > div > div')].filter((e) => nav && !nav.contains(e) && !e.contains(nav));
        for (const e of others) { const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue; const ix = Math.min(r.right, nr.right) - Math.max(r.left, nr.left), iy = Math.min(r.bottom, nr.bottom) - Math.max(r.top, nr.top); if (ix > 4 && iy > 4) textOverlap.push(`${(e.getAttribute('aria-label') || e.textContent || e.className).toString().trim().replace(/\s+/g, ' ').slice(0, 24)} overlaps nav by ${Math.round(ix)}x${Math.round(iy)}px`); }
        return { navCount: navBtns.length, covered, overlaps: [...new Set(textOverlap)].slice(0, 6), navRect: nr && [nr.left, nr.top, nr.right, nr.bottom].map(Math.round) };
      });
      console.log(`${w}x${h}@${dsf} ${screen}: nav buttons ${g.navCount}, covered at centre: ${j(g.covered)}; HUD elements overlapping the nav strip: ${j(g.overlaps)}`);
      if (g.covered.length || g.overlaps.length) await p.screenshot({ path: `${process.env.SHOTS}/E-zoom-hud-${screen.replace(' ', '')}-${w}.png`, clip: { x: 0, y: 0, width: w, height: 120 } });
      await c.close();
    }
  }
}, { port: Number(process.env.PORT), timeout: 60000 });
