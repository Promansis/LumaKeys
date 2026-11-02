// Lane E (RT-010) / PH-UI-016: contrast of the results grade letter (S, A, B, C, D, F) in every theme the app ships.
// Each badge is mounted inside a real `.results-screen > .panel.results-hero` in the running app, then measured two ways:
//   computed: the badge colour and background from getComputedStyle (the background is translucent, so it is not final);
//   rendered: pixels of a screenshot of the badge, background sampled beside the glyph, glyph taken as the pixel furthest
//   from that background. The rendered ratio is the one that counts. Large bold text needs 3:1 (WCAG 1.4.3).
// Env: DATA (throwaway data dir), LUMAKEYS_REPO (checkout whose dist/ is served). Port 3794.
import { withServer } from './harness.mjs';

const THEMES = ['warm', 'light', 'dark', 'neon'];
const GRADES = 'SABCDF';
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

const failures = [];
await withServer(process.env.DATA, async ({ ctx, base }) => {
  const p = await ctx.newPage();
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  for (const theme of THEMES) {
    await p.evaluate((t) => {
      document.documentElement.dataset.theme = t;
      document.getElementById('grade-probe')?.remove();
      const anchor = document.querySelector('.main-menu-screen') ?? document.querySelector('main') ?? document.body;
      const host = document.createElement('div');
      host.id = 'grade-probe';
      host.className = 'results-screen';
      host.style.cssText = 'position:fixed;left:0;top:0;width:1280px;z-index:99999;display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:12px;background:var(--page-bg-start)';
      for (const g of 'SABCDF') {
        const hero = document.createElement('section');
        hero.className = 'panel results-hero';
        hero.innerHTML = `<div><p class="eyebrow">Results</p></div><div class="grade-badge grade-${g}" id="gb-${g}" style="animation:none">${g}</div>`;
        host.appendChild(hero);
      }
      (anchor.parentElement ?? document.body).appendChild(host);
    }, theme);
    await p.waitForTimeout(300);
    const row = {};
    for (const g of GRADES) {
      const el = p.locator(`#gb-${g}`);
      const computed = await el.evaluate((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor]; });
      const shot = (await el.screenshot({ animations: 'disabled' })).toString('base64');
      // Decode in the page (no image library needed): returns RGB for the background beside the glyph and for the pixel furthest from it.
      const { bg, fg } = await p.evaluate(async (b64) => {
        const bmp = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))], { type: 'image/png' }));
        const c = new OffscreenCanvas(bmp.width, bmp.height); const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
        const d = x.getImageData(0, 0, bmp.width, bmp.height).data;
        const at = (px, py) => { const i = (bmp.width * py + px) * 4; return [d[i], d[i + 1], d[i + 2]]; };
        const l = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        const L = (q) => 0.2126 * l(q[0]) + 0.7152 * l(q[1]) + 0.0722 * l(q[2]);
        const back = at(8, Math.floor(bmp.height / 2)); let front = back; let far = -1;
        for (let py = 0; py < bmp.height; py++) for (let px = 0; px < bmp.width; px++) { const q = at(px, py); const dd = Math.abs(L(q) - L(back)); if (dd > far) { far = dd; front = q; } }
        return { bg: back, fg: front };
      }, shot);
      const r = ratio(fg, bg);
      row[g] = { ratio: Number(r.toFixed(2)), glyph: fg.join(','), bg: bg.join(','), computed };
      if (r < 3) failures.push(`${theme} ${g} ${r.toFixed(2)}`);
    }
    console.log(theme, JSON.stringify(Object.fromEntries(Object.entries(row).map(([g, v]) => [g, v.ratio]))));
    console.log('  detail', JSON.stringify(row));
  }
}, { port: 3794 });
if (failures.length) { console.log('BELOW 3:1:', failures.join('; ')); process.exitCode = 1; } else console.log('all grades >= 3:1 in all themes');
