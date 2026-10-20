// Sitting 3 item 3(e) (PH-UI-017): Settings, Practice, open Clear Learning Progress, Escape, Tab. Where does focus go?
// Opened by mouse click and by keyboard (focus + Enter). Env: DATA, PORT. BROWSER/BROWSER_PATH via harness.
import { withServer, text, browserName } from './sitting3-harness.mjs';
const act = (p) => p.evaluate(() => { const a = document.activeElement; return a && a !== document.body ? `${a.tagName} "${(a.getAttribute('aria-label') || a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"` : 'body'; });
await withServer(process.env.DATA, async ({ page: p, base }) => {
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  if (await p.getByRole('button', { name: 'Skip for now' }).count()) { await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForTimeout(500); }
  for (const via of ['mouse', 'keyboard']) {
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Settings', exact: true }).first().click(); await p.waitForTimeout(800);
    await p.getByRole('tab', { name: 'Practice' }).click(); await p.waitForTimeout(300);
    const t = p.getByRole('button', { name: /^Clear Learning Progress/ }).first();
    if (via === 'mouse') await t.click(); else { await t.focus(); await p.keyboard.press('Enter'); }
    await p.waitForTimeout(600);
    const open = await act(p); const dlg = await p.evaluate(() => !!document.querySelector('[role=dialog]'));
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
    const afterEsc = await act(p); const dlg2 = await p.evaluate(() => !!document.querySelector('[role=dialog]'));
    const trail = []; for (let i = 0; i < 3; i++) { await p.keyboard.press('Tab'); await p.waitForTimeout(80); trail.push(await act(p)); }
    console.log(`${browserName} opened by ${via}: dialog=${dlg} focus in dialog=${open}; Escape -> dialog=${dlg2} focus=${afterEsc}; then Tab x3 -> ${trail.join(' > ')}`);
  }
}, { port: Number(process.env.PORT) });
