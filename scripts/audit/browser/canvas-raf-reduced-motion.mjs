// Lane E (RT-009, PH-UI-003 re-verification): requestAnimationFrame calls per second and canvas pixel
// change in Free Play and Soundboard, with and without reduced motion, idle and with keys pressed.
// Env: DATA. Port 3792.
import { withServer, text } from './harness.mjs';
const j = JSON.stringify;
const INIT = () => {
  window.__raf = { n: 0, byStack: {} };
  const orig = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => { window.__raf.n++; return orig(cb); };
  window.__hash = () => {
    let out = [];
    for (const c of document.querySelectorAll('canvas')) {
      try {
        const x = c.getContext('2d', { willReadFrequently: true }) || null;
        const t = document.createElement('canvas'); t.width = 64; t.height = 40; const tc = t.getContext('2d'); tc.drawImage(c, 0, 0, 64, 40);
        const d = tc.getImageData(0, 0, 64, 40).data; let h = 0; for (let i = 0; i < d.length; i++) h = (h * 31 + d[i]) | 0; out.push(h);
      } catch (e) { out.push('err'); }
    }
    return out.join(',');
  };
};
const rafRate = async (p, ms) => { const a = await p.evaluate(() => window.__raf.n); await p.waitForTimeout(ms); const b = await p.evaluate(() => window.__raf.n); return +(((b - a) * 1000) / ms).toFixed(1); };
const hashes = async (p, n, gap) => { const out = []; for (let i = 0; i < n; i++) { out.push(await p.evaluate(() => window.__hash())); await p.waitForTimeout(gap); } return [...new Set(out)].length; };
await withServer(process.env.DATA, async ({ ctx, base }) => {
  const mk = async (rm) => { const p = await ctx.newPage(); await p.addInitScript(INIT); await p.emulateMedia({ reducedMotion: rm }); await p.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(p)).includes('FIRST PRACTICE SETUP')) await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForTimeout(500); return p; };
  for (const [screen, label] of [['Free Play', 'free-play'], ['Soundboard', 'soundboard']]) {
    for (const rm of ['no-preference', 'reduce']) {
      const p = await mk(rm);
      await p.getByRole('button', { name: screen, exact: true }).first().click(); await p.waitForTimeout(1500);
      const idle = await rafRate(p, 3000);
      const idleDistinct = await hashes(p, 8, 200);
      // keys: tap Comma, Period, Slash repeatedly for 3 s
      const a = await p.evaluate(() => window.__raf.n); const h0 = await p.evaluate(() => window.__hash());
      const tStart = Date.now(); const seen = new Set([h0]);
      while (Date.now() - tStart < 3000) { for (const k of ['Comma', 'Period', 'Slash']) { await p.keyboard.down(k); await p.waitForTimeout(80); seen.add(await p.evaluate(() => window.__hash())); await p.keyboard.up(k); await p.waitForTimeout(60); } }
      const b = await p.evaluate(() => window.__raf.n);
      // after release: settle, then idle again
      await p.waitForTimeout(1500);
      const after = await rafRate(p, 2000);
      const afterDistinct = await hashes(p, 6, 250);
      console.log(`${label} ${rm}: idle RAF/s=${idle}, distinct canvas hashes in 8 samples idle=${idleDistinct}; during key taps RAF/s=${(((b - a) * 1000) / (Date.now() - tStart)).toFixed(1)}, distinct canvas hashes while tapping=${seen.size}; after release RAF/s=${after}, distinct hashes in 6 samples=${afterDistinct}`);
      if (rm === 'reduce') {
        await p.screenshot({ path: `${process.env.SHOTS}/E-raf-${label}-reduce.png` });
        // live toggle: reduce -> no-preference -> reduce
        await p.emulateMedia({ reducedMotion: 'no-preference' }); await p.waitForTimeout(800);
        const live1 = await rafRate(p, 2000);
        await p.emulateMedia({ reducedMotion: 'reduce' }); await p.waitForTimeout(800);
        const live2 = await rafRate(p, 2000);
        console.log(`   live toggle after load: no-preference RAF/s=${live1}; back to reduce RAF/s=${live2}`);
      } else {
        await p.emulateMedia({ reducedMotion: 'reduce' }); await p.waitForTimeout(800);
        console.log(`   live toggle no-preference -> reduce after load: RAF/s=${await rafRate(p, 2000)}, distinct hashes in 8 idle samples=${await hashes(p, 8, 200)}`);
      }
      await p.close();
    }
  }
  // main menu and library baseline for global RAF (other consumers)
  for (const rm of ['no-preference', 'reduce']) { const p = await mk(rm); console.log(`main-menu ${rm}: idle RAF/s=${await rafRate(p, 3000)}`); await p.close(); }
}, { port: 3792, timeout: 15000 });
