// Sitting 3 item 2 (RT-006, PH-UI-002, PH-UI-012) with REAL pointer clicks at the zoom levels.
// ZOOM=emulate: CSS viewport shrunk and deviceScaleFactor raised (any engine). ZOOM=ffpref: Firefox only, the
// layout.css.devPixelsPerPx pref (genuine page zoom of the whole window; viewport:null so the window size is the real one).
// Per zoom: click every Settings tab by mouse; Free Play, Tab once (expands the HUD), mouse-click SETTINGS.
// Env: DATA, PORT, SHOTS, ZOOM, ZOOMS (default 1.5,2). BROWSER/BROWSER_PATH via harness.
import { withServer, text, browserName } from './sitting3-harness.mjs';
const MODE = process.env.ZOOM || 'emulate';
const ZOOMS = (process.env.ZOOMS || '1.5,2').split(',').map(Number);
for (const z of ZOOMS) {
  const opts = MODE === 'ffpref'
    ? { launch: { firefoxUserPrefs: { 'layout.css.devPixelsPerPx': String(z) } }, context: { viewport: null } }
    : { context: { viewport: { width: Math.round(1480 / z), height: Math.round(960 / z) }, deviceScaleFactor: z } };
  await withServer(`${process.env.DATA}/${MODE}-${z}`, async ({ page: p, base }) => {
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    if (await p.getByRole('button', { name: 'Skip for now' }).count()) { await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForTimeout(500); }
    console.log(`\n=== ${browserName} ${MODE} zoom ${z * 100}%: ${await p.evaluate(() => `inner=${innerWidth}x${innerHeight} dpr=${devicePixelRatio}`)}`);
    await p.getByRole('button', { name: 'Settings', exact: true }).first().click(); await p.waitForTimeout(900);
    const names = await p.$$eval('[role=tab]', (t) => t.map((x) => x.getAttribute('aria-label') || x.textContent.trim()));
    const out = [];
    for (const n of names) {
      const t = p.locator(`[role=tab][aria-label="${n}"]`).first();
      await t.scrollIntoViewIfNeeded(); const b = await t.boundingBox();
      const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const hit = await p.evaluate(([x, y, nm]) => { const e = document.elementFromPoint(x, y); const tt = document.querySelector(`[role=tab][aria-label="${nm}"]`); return !!e && (e === tt || tt.contains(e)); }, [cx, cy, n]);
      await p.mouse.click(cx, cy); await p.waitForTimeout(300);
      const sel = await t.getAttribute('aria-selected');
      const panel = await p.evaluate(() => { const pn = document.querySelector('[role=tabpanel]'); return pn ? Math.round(pn.getBoundingClientRect().height) : null; });
      out.push(`${n}: tab ${Math.round(b.width)}x${Math.round(b.height)} hit=${hit} selected=${sel} panelH=${panel}`);
    }
    console.log(`Settings tabs (${names.length}): ${out.join(' | ')}`);
    await p.screenshot({ path: `${process.env.SHOTS}/${browserName}-${MODE}-${z}-settings.png` });
    // HUD: Free Play, one real Tab, mouse-click SETTINGS
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Free Play', exact: true }).first().click(); await p.waitForTimeout(1200);
    await p.evaluate(() => document.activeElement?.blur());
    await p.keyboard.press('Tab'); await p.waitForTimeout(700);
    const focus = await p.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()} "${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 24)}"` : 'none'; });
    const nav = p.locator('.immersive-hud-nav-btn').filter({ hasText: /^\s*Settings\s*$/i }).first();
    const b = await nav.boundingBox(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const top = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]} "${(e.textContent || '').trim().slice(0, 20)}"` : null; }, [cx, cy]);
    await p.screenshot({ path: `${process.env.SHOTS}/${browserName}-${MODE}-${z}-hud.png`, clip: { x: 0, y: 0, width: Math.min(1480, await p.evaluate(() => innerWidth)), height: 130 } });
    await p.mouse.click(cx, cy); await p.waitForTimeout(900);
    const landed = await p.evaluate(() => ({ settings: !!document.querySelector('.settings-screen'), dialog: !!document.querySelector('[role=dialog]'), text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 60) }));
    console.log(`Free Play after one Tab: focus=${focus}; SETTINGS nav button ${Math.round(b.width)}x${Math.round(b.height)} at (${Math.round(cx)},${Math.round(cy)}); element at its centre = ${top}; after mouse click: settings screen opened=${landed.settings}, dialog=${landed.dialog}, text="${landed.text}"`);
  }, { ...opts, port: Number(process.env.PORT) });
}
