// Lane E (RT-008): Free Play visual-mode popout. Does Tab reach it, and what does Enter on the toggle do? Env: DATA, SHOTS. Port 3793.
import { withServer, text } from './harness.mjs';
await withServer(process.env.DATA, async ({ ctx, base }) => {
  const p = await ctx.newPage(); await p.setViewportSize({ width: 1480, height: 960 });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(p)).includes('FIRST PRACTICE SETUP')) { await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForTimeout(500); } await p.getByRole('button', { name: 'Free Play', exact: true }).first().click(); await p.waitForTimeout(1200);
  const vis = () => p.evaluate(() => { const a = document.activeElement; const pop = document.querySelector('#free-play-visual-popout'); const cs = getComputedStyle(pop); return `focus=${a.tagName} "${(a.getAttribute('aria-label') || a.textContent).trim().slice(0, 24)}" popout open-class=${pop.classList.contains('open')} opacity=${cs.opacity} aria-hidden=${pop.getAttribute('aria-hidden')}`; });
  const toggle = p.getByRole('button', { name: 'Show visual mode controls' });
  await toggle.focus(); await p.waitForTimeout(400); console.log('toggle focused:', await vis());
  await p.keyboard.press('Tab'); await p.waitForTimeout(600); console.log('Tab from toggle (no Enter):', await vis());
  await p.screenshot({ path: process.env.SHOTS + '/E-ghost-free-play-after-tab.png' });
  await toggle.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(400); console.log('Enter #1 on toggle:', await vis());
  await p.keyboard.press('Enter'); await p.waitForTimeout(400); console.log('Enter #2 on toggle:', await vis());
  for (let i = 1; i <= 4; i++) { await p.keyboard.press('Tab'); await p.waitForTimeout(500); console.log(`Tab ${i} after pin:`, await vis()); }
  await p.screenshot({ path: process.env.SHOTS + '/E-ghost-free-play-pinned.png' });
}, { port: 3793 });
