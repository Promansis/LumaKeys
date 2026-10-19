import { withServer, text } from './harness.mjs';
const shots = process.env.SHOTS; const data = process.env.DATA;
const hud = async (page) => (await text(page)).match(/SCORE\n(\d+)\nCOMBO\n([^\n]+)/)?.slice(1).join(' | ') ?? 'n/a';
const focus = (page) => page.evaluate(() => `${document.activeElement?.tagName}.${document.activeElement?.className} "${document.activeElement?.textContent?.trim().slice(0, 20)}"`);
const tryHit = async (page, k) => { const s = await hud(page); for (let i = 0; i < 30; i++) { await page.keyboard.down(k); await page.waitForTimeout(60); await page.keyboard.up(k); await page.waitForTimeout(90); if ((await hud(page)) !== s) return `hit (${await hud(page)})`; } return `no score change (${s})`; };
await withServer(data, async ({ page, base }) => {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(800);
  const card = page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: /^short-4-notes$/ }) });
  await card.getByRole('button', { name: 'Learn', exact: true }).click(); await page.waitForTimeout(1000);
  await page.keyboard.press('Space'); await page.waitForTimeout(300);
  console.log('C4 before pause:', await tryHit(page, 'Comma'));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  console.log('overlay open', await page.locator('.immersive-overlay').count());
  await page.locator('.immersive-overlay').getByRole('button', { name: 'Resume' }).click(); await page.waitForTimeout(400);
  console.log('after Resume click: overlay', await page.locator('.immersive-overlay').count(), 'focus', await focus(page));
  console.log('D4 after Resume click:', await tryHit(page, 'Period'));
  await page.keyboard.press('Space'); await page.waitForTimeout(400);
  console.log('after Space: overlay', await page.locator('.immersive-overlay').count(), 'focus', await focus(page));
  if (await page.locator('.immersive-overlay').count()) { await page.locator('.immersive-overlay').getByRole('button', { name: 'Resume' }).click(); await page.waitForTimeout(300); }
  await page.mouse.click(640, 300); await page.waitForTimeout(300);
  console.log('after clicking the canvas: focus', await focus(page));
  console.log('D4 after canvas click:', await tryHit(page, 'Period'));
}, { port: 3780, timeout: 8000 });
