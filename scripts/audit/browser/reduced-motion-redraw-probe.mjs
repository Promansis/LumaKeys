// Lane E (RT-009): under prefers-reduced-motion, when do the Free Play and Soundboard canvases redraw after two key taps?
// Counts clearRect bursts on canvases wider than 600 px. Env: DATA. Port 3792.
import { withServer, text } from './harness.mjs';
await withServer(process.env.DATA, async ({ ctx, base }) => {
  for (const screen of ['Free Play', 'Soundboard']) {
    const p = await ctx.newPage();
    await p.addInitScript(() => {
      window.__draw = [];
      const o = CanvasRenderingContext2D.prototype.clearRect;
      let last = 0;
      CanvasRenderingContext2D.prototype.clearRect = function (...a) { if (this.canvas.width > 600) { const t = Math.round(performance.now()); if (t - last > 30) { window.__draw.push(t); last = t; } } return o.apply(this, a); };
      window.__timers = 0; const si = window.setInterval; window.setInterval = function (f, ms, ...r) { window.__timers++; return si.call(window, f, ms, ...r); };
    });
    await p.emulateMedia({ reducedMotion: 'reduce' }); await p.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(p)).includes('FIRST PRACTICE SETUP')) { await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForTimeout(500); }
    await p.getByRole('button', { name: screen, exact: true }).first().click(); await p.waitForTimeout(1500);
    const t0 = await p.evaluate(() => Math.round(performance.now()));
    for (const k of ['Comma', 'Period']) { await p.keyboard.down(k); await p.waitForTimeout(100); await p.keyboard.up(k); await p.waitForTimeout(100); }
    const tRel = await p.evaluate(() => Math.round(performance.now()));
    await p.waitForTimeout(8000);
    const d = await p.evaluate(() => window.__draw);
    console.log(screen, 'reduce: taps ended at', tRel - t0, 'ms; redraw bursts (ms after t0) =', JSON.stringify(d.map((x) => x - t0).filter((x) => x > 0)));
    await p.close();
  }
}, { port: 3792, timeout: 15000 });
