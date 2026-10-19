// WF-019 web: which instrument the audio engine ends up with after "Install Better Sounds".
// Captures the AudioEngine console trail (custom sampler, built-in sampler, synth fallback).
// Run: DATA=$TMPDIR/p11/EL2/web-pack PORT=3789 node sample-pack-engine-log.mjs
import { withServer, text } from './harness.mjs';
import fs from 'node:fs';
const data = process.env.DATA;
fs.rmSync(data, { recursive: true, force: true });
const ctl = (page, label) => page.locator('#settings-panel-audio label').filter({ hasText: new RegExp(label, 'i') }).locator('select, input').first();
const status = (page) => page.locator('.settings-status-message').innerText().catch(() => '?');
await withServer(data, async ({ page, base }) => {
  const log = [];
  page.on('console', (m) => { if (/AudioEngine/.test(m.text())) log.push(m.text().replace(/\n[\s\S]*/, '').slice(0, 110)); });
  const trail = (label) => { console.log(label, JSON.stringify(log.filter((l) => /custom|Failed|fallback|loaded successfully|Loading sampler|PolySynth/i.test(l)))); log.length = 0; };
  for (let run = 1; run <= 3; run++) {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(page)).includes('FIRST PRACTICE SETUP')) await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.mouse.click(400, 300); await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700);
    await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(250);
    const adv = page.getByRole('button', { name: /show advanced options/i });
    if (await adv.count()) { await adv.first().click(); await page.waitForTimeout(250); }
    if (run === 1) {
      await ctl(page, '^Instrument').selectOption('flute'); await page.waitForTimeout(2000);
      trail(`run ${run} select flute, no pack:`);
      await page.getByRole('button', { name: /Install Better Sounds/ }).click(); await page.waitForTimeout(4000);
      console.log(`run ${run} install status`, JSON.stringify(await status(page)));
      trail(`run ${run} after install:`);
    } else {
      await page.waitForTimeout(2500);
      trail(`run ${run} after reload with pack installed:`);
    }
  }
}, { port: Number(process.env.PORT || 3789), timeout: 10000 });
