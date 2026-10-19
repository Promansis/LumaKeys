import { withServer, text } from './harness.mjs';
const data = process.env.DATA;
const lit = (page) => page.$$eval('.white-key.active, .black-key.active, [class*=key][class*=active]', (e) => e.filter((x) => /key/.test(x.className) && !/nav|preset|mode|instrument/.test(x.className)).length);
await withServer(data, async ({ page, base }) => {
  for (const [screen, btn] of [['Free Play', /^(Concert Stage|Color Ribbons)$/], ['Soundboard', null]]) {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: screen, exact: true }).click(); await page.waitForTimeout(1200);
    await page.keyboard.down('Comma'); await page.waitForTimeout(200);
    const before = await lit(page); await page.keyboard.up('Comma'); await page.waitForTimeout(200);
    const label = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /Menu|HUD/.test(x.textContent)); b?.focus(); return b?.textContent; });
    await page.waitForTimeout(300);
    const f = await page.evaluate(() => `${document.activeElement?.tagName} "${document.activeElement?.textContent?.trim().slice(0, 20)}"`);
    await page.keyboard.down('Comma'); await page.waitForTimeout(200);
    const after = await lit(page); await page.keyboard.up('Comma');
    console.log(`${screen}: keys lit before any click=${before}; after clicking "${label?.trim().slice(0, 25)}" focus=${f} keys lit=${after}`);
  }
}, { port: 3780, timeout: 8000 });
