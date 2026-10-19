// Lane B (DATA-016, DATA-017): are library filter presets saved before the PianoHero -> LumaKeys rename
// still offered after it? The rename changed the localStorage key from 'pianohero-filter-presets' to
// 'lumakeys-filter-presets' (commit 489fe45). Web runtime; the Electron renderer runs the same code.
//
// Case L: only the legacy key is present. Case C (control): the same preset under the current key.
// Oracle: a user preset saved in an older build is still listed as a chip in the library.
//
// Run: DATA=$TMPDIR/p11/B/presets PORT=3798 node legacy-filter-presets.mjs
import { withServer, text } from './harness.mjs';
import fs from 'node:fs';

const data = process.env.DATA;
const port = Number(process.env.PORT || 3798);
if (!data || !data.startsWith(process.env.TMPDIR || '/tmp/')) throw new Error('DATA must be under TMPDIR');
fs.rmSync(data, { recursive: true, force: true });

const EMPTY = { durationMin: '', durationMax: '', scoreMin: '', scoreMax: '', playedState: 'all', dateAddedFrom: '', dateAddedTo: '' };
const preset = (label) => JSON.stringify([{ label, difficulty: 'all', advanced: { ...EMPTY, playedState: 'unplayed' } }]);
const results = [];

await withServer(data, async ({ page, base }) => {
  const gotoLibrary = async () => {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(page)).includes('FIRST PRACTICE SETUP')) await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.getByRole('button', { name: 'Play Songs', exact: true }).click();
    await page.waitForSelector('h1:has-text("Your Library")');
    await page.waitForTimeout(800);
  };
  const chips = () => page.$$eval('.user-preset-chip button:not(.user-preset-delete)', (e) => e.map((x) => x.textContent));
  const keys = () => page.evaluate(() => Object.keys(localStorage).filter((k) => /preset/i.test(k)).sort());

  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('pianohero-filter-presets', v); }, preset('Legacy Preset'));
  await gotoLibrary();
  results.push({ case: 'L', presetSectionShown: await page.locator('section.filter-presets').count(), userChips: await chips(), presetKeys: await keys() });

  await page.evaluate((v) => { localStorage.clear(); localStorage.setItem('lumakeys-filter-presets', v); }, preset('Control Preset'));
  await gotoLibrary();
  results.push({ case: 'C', presetSectionShown: await page.locator('section.filter-presets').count(), userChips: await chips(), presetKeys: await keys() });
}, { port });

for (const r of results) console.log('RESULT ' + JSON.stringify(r));
