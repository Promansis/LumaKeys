// Lane E (RT-009): running CSS animations and transitions per screen with and without prefers-reduced-motion.
// Env: DATA, FIX. Port 3792.
import { withServer, text } from './harness.mjs';
import fs from 'node:fs';
await withServer(process.env.DATA, async ({ ctx, base }) => {
  for (const f of fs.readdirSync(process.env.FIX).filter((x) => x.endsWith('.mid'))) { const fd = new FormData(); fd.append('files', new Blob([fs.readFileSync(process.env.FIX + '/' + f)]), f); await fetch(base + '/api/midi/upload', { method: 'POST', body: fd }); }
  const screens = [['main menu', null], ['library', 'Play Songs'], ['learn hub', 'Guided Lessons'], ['theory hub', 'Theory Trainer'], ['progress', 'Progress'], ['settings', 'Settings'], ['keyboard setup', 'Keyboard Setup'], ['free play', 'Free Play'], ['soundboard', 'Soundboard'], ['game', 'GAME']];
  for (const [name, nav] of screens) {
    const row = [];
    for (const rm of ['no-preference', 'reduce']) {
      const p = await ctx.newPage(); await p.setViewportSize({ width: 1480, height: 960 }); await p.emulateMedia({ reducedMotion: rm });
      await p.goto(base + '/', { waitUntil: 'networkidle' });
      if ((await text(p)).includes('FIRST PRACTICE SETUP')) { await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForSelector('.main-menu-screen'); }
      if (nav === 'GAME') { await p.getByRole('button', { name: 'Play Songs', exact: true }).first().click(); await p.waitForTimeout(800); await p.locator('article.song-card').first().getByRole('button', { name: 'Play', exact: true }).click(); await p.waitForTimeout(2500); }
      else if (nav) { await p.getByRole('button', { name: nav, exact: true }).first().click(); await p.waitForTimeout(2500); } else await p.waitForTimeout(2500);
      const r = await p.evaluate(() => { const a = document.getAnimations().filter((x) => x.playState === 'running'); const inf = a.filter((x) => x.effect?.getComputedTiming().iterations === Infinity); return { running: a.length, infinite: inf.length, names: [...new Set(inf.map((x) => x.animationName || x.constructor.name))].slice(0, 4) }; });
      row.push(`${rm}: running=${r.running} infinite=${r.infinite}${r.infinite ? ' ' + JSON.stringify(r.names) : ''}`); await p.close();
    }
    console.log(`${name}: ${row.join(' | ')}`);
  }
}, { port: 3792, timeout: 12000 });
