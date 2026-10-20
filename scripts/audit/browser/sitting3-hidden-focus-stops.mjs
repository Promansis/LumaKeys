// Sitting 3 copy of hidden-focus-stops.mjs (sitting3-harness: own port via PORT, Firefox boot wait). Original header follows.
// Lane E (RT-008): keyboard Tab stops that sit inside closed HUD popouts (aria-hidden or transparent) on the
// immersive screens, i.e. focus the user cannot see. Env: DATA, SHOTS, FIX. Port 3793.
import { withServer, text } from './sitting3-harness.mjs';
const j = JSON.stringify;
const probe = () => {
  const a = document.activeElement; if (!a || a === document.body) return null;
  let op = 1, ariaHidden = null, vis = 'visible', pe = null; let n = a;
  while (n && n !== document.documentElement) {
    const s = getComputedStyle(n); op *= parseFloat(s.opacity); if (s.visibility === 'hidden') vis = 'hidden';
    if (!ariaHidden && n.getAttribute && n.getAttribute('aria-hidden') === 'true') ariaHidden = (n.id || n.className || n.tagName).toString().split(' ')[0];
    if (!pe && s.pointerEvents === 'none') pe = (n.id || n.className || n.tagName).toString().split(' ')[0];
    n = n.parentElement;
  }
  const r = a.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const top = document.elementFromPoint(Math.min(Math.max(cx, 0), innerWidth - 1), Math.min(Math.max(cy, 0), innerHeight - 1));
  const covered = !(top === a || a.contains(top) || (top && top.contains(a)));
  const offscreen = r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight;
  return { label: `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22)}"`, op: +op.toFixed(2), ariaHidden, vis, pe, covered, offscreen, key: a.className + '|' + Math.round(r.left) + ',' + Math.round(r.top) };
};
await withServer(process.env.DATA, async ({ ctx, base }) => {
  const run = async (name, setup) => {
    const p = await ctx.newPage(); await p.setViewportSize({ width: 1480, height: 960 });
    await p.goto(base + '/', { waitUntil: 'networkidle' }); await setup(p); await p.evaluate(() => document.activeElement?.blur());
    const rows = []; const seen = new Set(); let wrapped = false;
    for (let i = 0; i < 200; i++) {
      await p.keyboard.press('Tab'); await p.waitForTimeout(330);
      const r = await p.evaluate(probe); if (!r) { rows.push({ label: 'body' }); if (rows.slice(-2).every((x) => x.label === 'body')) break; continue; }
      if (seen.has(r.key)) { wrapped = true; break; } seen.add(r.key); rows.push(r);
    }
    const real = rows.filter((r) => r.label !== 'body');
    const ah = real.filter((r) => r.ariaHidden); const tr = real.filter((r) => r.op < 0.1); const cv = real.filter((r) => r.covered || r.offscreen);
    const ghost = real.filter((r) => r.ariaHidden || r.op < 0.1 || r.vis === 'hidden');
    console.log(`## ${name}: ${real.length} Tab stops before ${wrapped ? 'wrapping' : 'cap/end'}; inside aria-hidden container=${ah.length}; effective opacity<0.1=${tr.length}; covered/offscreen at centre=${cv.length}; union of ghost (aria-hidden, transparent, or visibility hidden)=${ghost.length}`);
    const groups = {}; for (const g of ghost) { const k = `aria-hidden=${g.ariaHidden} op=${g.op}`; (groups[k] ||= []).push(g.label); }
    for (const [k, v] of Object.entries(groups)) console.log(`   ${k}: ${v.length} stops, first: ${v.slice(0, 3).join(', ')}`);
    const first = real.findIndex((r) => r.ariaHidden || r.op < 0.1);
    if (first >= 0) { await p.evaluate(() => document.activeElement?.blur()); for (let i = 0; i <= first; i++) await p.keyboard.press('Tab'); await p.waitForTimeout(500); await p.screenshot({ path: `${process.env.SHOTS}/E-ghost-focus-${name.replace(/\W+/g, '-')}.png` }); console.log(`   screenshot taken with focus on first ghost stop #${first + 1}: ${real[first].label}`); }
    await p.close();
  };
  await run('Free Play', async (p) => { await p.getByRole('button', { name: 'Free Play', exact: true }).first().click(); await p.waitForTimeout(1200); });
  await run('Soundboard', async (p) => { await p.getByRole('button', { name: 'Soundboard', exact: true }).first().click(); await p.waitForTimeout(1200); });
  await run('Game', async (p) => { await p.getByRole('button', { name: 'Play Songs', exact: true }).first().click(); await p.waitForTimeout(900); await p.locator('article.song-card').first().getByRole('button', { name: 'Play', exact: true }).click(); await p.waitForTimeout(1500); });
}, { port: 3793, timeout: 12000 });
