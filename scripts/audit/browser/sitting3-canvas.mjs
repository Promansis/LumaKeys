// Sitting 3 item 1 (RT-002): upload pmus-16.mid through the Library UI, start it, and check the game canvas
// really paints (pixel hashes change between frames, non-blank). Env: DATA, SHOTS, FIX, PORT. BROWSER/BROWSER_PATH via harness.
import { withServer, text, browserName } from './harness.mjs';
import crypto from 'node:crypto';
const FILE = `${process.env.FIX}/pmus-16.mid`;
await withServer(process.env.DATA, async ({ page, base, errors }) => {
  console.log('UA', await page.evaluate(() => navigator.userAgent));
  const t0 = Date.now();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Skip for now|^Play Songs$/ }).first().waitFor({ timeout: 40000 });
  console.log('boot to main menu ms', Date.now() - t0);
  const skip = page.getByRole('button', { name: /Skip for now/i });
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(400); }
  await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(800);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Upload MIDI/ }).click()]);
  await fc.setFiles(FILE); await page.waitForTimeout(2000);
  console.log('cards', await page.locator('article.song-card').count(), await page.locator('h2.song-card-title').allInnerTexts());
  const card = page.locator('article.song-card').first();
  console.log('card buttons', await card.getByRole('button').allInnerTexts());
  await card.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForTimeout(500);
  const snap = async () => {
    const cv = page.locator('.falling-notes-canvas canvas, canvas').first();
    const buf = await cv.screenshot();
    return crypto.createHash('md5').update(buf).digest('hex');
  };
  const info = await page.evaluate(() => { const c = document.querySelector('canvas'); return c ? { w: c.width, h: c.height, cls: c.className, parent: c.parentElement?.className } : null; });
  console.log('canvas', JSON.stringify(info));
  const hashes = [];
  for (let i = 0; i < 12; i++) { hashes.push(await snap()); await page.waitForTimeout(250); }
  console.log('distinct frames in 12 samples over ~3s (count-in/idle):', new Set(hashes).size);
  // canvas pixel content via getImageData / drawImage readback (works for 2D canvas)
  const px = () => page.evaluate(() => {
    const c = document.querySelector('canvas'); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
    const x = t.getContext('2d'); x.drawImage(c, 0, 0); const d = x.getImageData(0, 0, t.width, t.height).data;
    const seen = new Set(); let nonBlank = 0, h = 0;
    for (let i = 0; i < d.length; i += 4) { const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]; seen.add(k); if (d[i + 3] && (d[i] | d[i + 1] | d[i + 2])) nonBlank++; h = (h * 31 + k) | 0; }
    return { colors: seen.size, nonBlankPct: +(100 * nonBlank / (d.length / 4)).toFixed(1), hash: h };
  });
  const a = await px();
  await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Space');
  const frames = [];
  const states = [];
  for (let i = 0; i < 24; i++) { frames.push(await px()); states.push((await text(page)).replace(/\n/g, ' ').match(/SCORE \d+ COMBO [^ ]+ [^ ]+/)?.[0]); await page.waitForTimeout(300); }
  console.log('distinct hashes by 300ms sample:', frames.map((f) => f.hash % 1000).join(','));
  console.log('readback first', JSON.stringify(a));
  console.log('readback while playing: distinct hashes', new Set(frames.map((f) => f.hash)).size, 'of', frames.length, 'canvas px changed after first 2.4s count-in window:', new Set(frames.slice(8).map((f) => f.hash)).size, 'colors', Math.max(...frames.map((f) => f.colors)), 'nonBlank%', frames.map((f) => f.nonBlankPct).join(','));
  const shot2 = [];
  for (let i = 0; i < 6; i++) { shot2.push(await snap()); await page.waitForTimeout(200); }
  console.log('element screenshot distinct hashes while playing', new Set(shot2).size, 'of 6');
  await page.screenshot({ path: `${process.env.SHOTS}/item1-${browserName}-${process.env.TAG}.png` });
  console.log('HUD text', JSON.stringify((await text(page)).slice(0, 160)));
  console.log('ERRORS', JSON.stringify(errors.slice(0, 8)));
}, { port: Number(process.env.PORT), timeout: 12000 });
