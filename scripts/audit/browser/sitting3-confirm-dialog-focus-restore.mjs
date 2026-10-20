// Sitting 3 copy of confirm-dialog-focus-restore.mjs (sitting3-harness: own port via PORT, Firefox boot wait). Original header follows.
// Lane E (RT-008, Phase 5 oracle "restore focus on close"): where focus lands after the Settings confirmation
// dialog closes, by Escape and by the Cancel button, plus a focus() call trace. Env: DATA. Port 3793.
import { withServer, text } from './sitting3-harness.mjs';
await withServer(process.env.DATA, async ({ ctx, base }) => {
  const p = await ctx.newPage(); await p.setViewportSize({ width: 1480, height: 960 });
  await p.addInitScript(() => { window.__log = []; const o = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function (...a) { window.__log.push(`focus(${this.tagName} "${(this.textContent || '').trim().slice(0, 22)}")`); return o.apply(this, a); }; });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(p)).includes('FIRST PRACTICE SETUP')) { await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForTimeout(500); }
  await p.getByRole('button', { name: 'Settings', exact: true }).first().click(); await p.waitForTimeout(800);
  await p.getByRole('tab', { name: 'Practice' }).click(); await p.waitForTimeout(300);
  const act = () => p.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? `${a.tagName} "${(a.textContent || '').trim().slice(0, 30)}" connected=${a.isConnected}` : 'body'; });
  for (const via of ['Escape', 'CancelButton']) {
    const t = p.getByRole('button', { name: /^Clear Learning Progress/ }).first();
    await t.focus(); await p.evaluate(() => { window.__trig = document.activeElement; window.__log.length = 0; });
    await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
    console.log(via, 'open ->', await act(), '| focus() calls while open:', JSON.stringify(await p.evaluate(() => window.__log)));
    await p.evaluate(() => { window.__log.length = 0; });
    if (via === 'Escape') await p.keyboard.press('Escape'); else await p.keyboard.press('Enter');
    await p.waitForTimeout(400);
    console.log(via, 'closed -> focus:', await act(), '| trigger still connected:', await p.evaluate(() => window.__trig.isConnected), '| trigger is activeElement:', await p.evaluate(() => document.activeElement === window.__trig), '| focus() calls on close:', JSON.stringify(await p.evaluate(() => window.__log)));
  }
}, { port: 3793 });
