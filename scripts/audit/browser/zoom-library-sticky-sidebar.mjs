// Lane E (RT-006): EMULATED zoom. Library sticky sidebar size and whether a control that scrollIntoView centres behind it can still be clicked. Env: DATA, SHOTS. Port 3794.
import { withServer, text } from './harness.mjs';
import fs from 'node:fs';
await withServer(process.env.DATA, async ({ ctx, base }) => {
  for (const [w, h, dsf] of [[987, 640, 1.5], [846, 549, 1.75], [1180, 780, 1]]) {
    const c = await ctx.browser().newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf }); const p = await c.newPage();
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(p)).includes('FIRST PRACTICE SETUP')) { await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForTimeout(500); } await p.getByRole('button', { name: 'Play Songs', exact: true }).first().click(); await p.waitForTimeout(1200);
    const inp = p.locator('input.preset-name-input').first();
    console.log(`${w}x${h}: preset input count=${await inp.count()} box=${JSON.stringify(await inp.boundingBox())}`);
    await inp.scrollIntoViewIfNeeded().catch(() => {});
    const info = await p.evaluate(() => { const el = document.querySelector('input.preset-name-input'); const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const chain = []; let n = el; while (n && chain.length < 8) { const s = getComputedStyle(n); chain.push(`${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]} pos=${s.position} ov=${s.overflowY} h=${Math.round(n.getBoundingClientRect().height)}`); n = n.parentElement; } return { rect: [r.left, r.top, r.width, r.height].map(Math.round), top: top && `${top.tagName.toLowerCase()}.${String(top.className).split(' ')[0]}`, sidebar: (() => { const sb = document.querySelector('.library-sidebar'); const b = sb.getBoundingClientRect(); const s = getComputedStyle(sb); return { rect: [b.left, b.top, b.width, b.height].map(Math.round), pos: s.position, ov: s.overflowY, maxH: s.maxHeight }; })(), chain }; });
    console.log(JSON.stringify(info));
    const t = await inp.click({ trial: true, timeout: 3000 }).then(() => 'click trial ok').catch((e) => 'click trial FAILED: ' + e.message.split('\n').slice(0, 3).join(' | '));
    console.log('   ', t);
    await p.screenshot({ path: `${process.env.SHOTS}/E-zoom-library-${w}.png` });
    await c.close();
  }
}, { port: 3794 });
