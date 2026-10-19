// Lane E (RT-010): computed colour and background of the results grade badge for S, A, B, C, D, F in the default theme.
// Contrast is computed offline against the sampled results-card background (rgb 19,21,32): see the lane report. Env: DATA. Port 3794.
import { withServer } from './harness.mjs';
await withServer(process.env.DATA, async ({ ctx, base }) => {
  const p = await ctx.newPage(); await p.goto(base + '/', { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => {
    const out = {}; const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none'; document.body.appendChild(host);
    for (const g of 'SABCDF') { const d = document.createElement('div'); d.className = `grade-badge grade-${g}`; d.style.animation = 'none'; d.textContent = g; host.appendChild(d); const s = getComputedStyle(d); out[g] = [s.color, s.backgroundColor]; }
    out.theme = document.documentElement.dataset.theme; out.panel = getComputedStyle(document.body).backgroundColor; return out; });
  console.log(JSON.stringify(r));
}, { port: 3794 });
