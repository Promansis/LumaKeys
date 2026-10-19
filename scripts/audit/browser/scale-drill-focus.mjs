import { withServer, text } from './harness.mjs';
const shots = process.env.SHOTS; const data = process.env.DATA;
await withServer(data, async ({ page, base, errors }) => {
  for (const blur of [false, true]) {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Theory Trainer', exact: true }).click(); await page.waitForTimeout(700);
    await page.getByRole('button', { name: /^Start/ }).nth(0).click(); await page.waitForTimeout(900);
    await page.getByRole('button', { name: 'Start Drill' }).click(); await page.waitForTimeout(600);
    const focus = await page.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.textContent?.trim().slice(0, 30)}`);
    if (blur) await page.evaluate(() => document.activeElement?.blur());
    for (const k of ['Comma', 'Period', 'Slash', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT']) {
      await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k); await page.waitForTimeout(450);
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${shots}/36-scale-blur-${blur}.png` });
    console.log(`blur=${blur} focus-after-start="${focus}"`, JSON.stringify((await text(page)).match(/PROGRESS\n\d[^\n]*|LAST CHECK\n[^\n]+|[^\n]*(complete|Complete|Accuracy|accuracy)[^\n]{0,80}/g)));
  }
  console.log('ERRORS', JSON.stringify(errors.filter((e) => !e.includes('"off"'))));
}, { port: 3780, timeout: 8000 });
