// Paused-input defect, desktop: on lesson 1's drill a C4 press is judged while the session is
// not playing. Case B presses during the 3-2-1 count-in, case A before Space is pressed at all.
// Deterministic engine proof: scripts/audit/paused-input-probe.ts. Run from $TMPDIR/pw with
// LK_SQLITE_MODULE and PROFILE set.
import { withElectron, text } from './electron-harness.mjs';
import fs from 'node:fs';
const profile = process.env.PROFILE;
fs.rmSync(profile, { recursive: true, force: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const tap = async (page, key) => { await page.keyboard.down(key); await sleep(25); await page.keyboard.up(key); };
const hud = (page) => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.immersive-hud-item')]
  .map((el) => [el.querySelector('span')?.textContent ?? '?', el.querySelector('strong')?.textContent ?? '?'])));
const counting = (page) => page.evaluate(() => document.querySelector('.countdown-overlay')?.textContent ?? null);
const startDrill = async (page) => {
  await page.getByRole('button', { name: 'Start Drill' }).click(); await page.waitForTimeout(1200);
  await page.evaluate(() => document.activeElement?.blur());
};

await withElectron(profile, async (h) => {
  const { page } = h;
  await page.waitForTimeout(2500);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Guided Lessons', exact: true }).click(); await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Lesson 1\b/ }).first().click(); await page.waitForTimeout(600);
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: /Complete Tip/ }).click(); await page.waitForTimeout(400); }

  // B: press during the count-in.
  await startDrill(page);
  console.log('B drill loaded, HUD', JSON.stringify(await hud(page)));
  await page.keyboard.press('Space');
  await sleep(1000);
  console.log('B count-in showing', JSON.stringify(await counting(page)));
  await tap(page, 'Comma'); await sleep(150);
  console.log('B after one C4 during the count-in: count-in', JSON.stringify(await counting(page)), 'HUD', JSON.stringify(await hud(page)));
  // Let the drill run out with no further input, then return to the lesson.
  for (let i = 0; i < 80 && !/Lesson Steps/i.test(await text(page)); i++) await sleep(250);
  console.log('B drill over, back on lesson', /Lesson Steps/i.test(await text(page)));

  // A: press before Space, with no count-in running.
  await startDrill(page);
  console.log('A drill loaded, count-in', JSON.stringify(await counting(page)), 'HUD', JSON.stringify(await hud(page)));
  await tap(page, 'Comma'); await sleep(150);
  console.log('A after one C4 before Space: count-in', JSON.stringify(await counting(page)), 'HUD', JSON.stringify(await hud(page)));
  await tap(page, 'Comma'); await sleep(150);
  console.log('A after a second C4 before Space: HUD', JSON.stringify(await hud(page)));
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 10)));
});
console.log('DONE');
