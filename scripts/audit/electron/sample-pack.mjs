// Desktop half of WF-019: install the managed Flute pack, confirm the sampler loads the
// copied files, relaunch, remove, and check userData on disk.
// Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE (under $TMPDIR) set.
import { withElectron, text } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
const profile = process.env.PROFILE;
const ctl = (page, label) => page.locator('#settings-panel-audio label').filter({ hasText: new RegExp(label, 'i') }).locator('select, input').first();
const status = (page) => page.locator('.settings-status-message').innerText().catch(() => '?');
const packCard = (page) => page.locator('.settings-note-card').filter({ hasText: /Selected Instrument/ }).first().innerText().then((t) => t.replace(/\n+/g, ' | ')).catch(() => 'no card');
const ls = (d) => { try { return fs.readdirSync(d); } catch (e) { return `ERR ${e.code}`; } };
const openAudio = async (page) => {
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700);
  await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(250);
  const adv = page.getByRole('button', { name: /show advanced options/i });
  if (await adv.count()) { await adv.first().click(); await page.waitForTimeout(250); }
};
const probe = (page) => page.evaluate(async () => {
  const src = await window.appBridge.resolveInstrumentSampleSource('flute');
  if (!src || !src.baseUrl) return { src };
  const first = Object.values(src.urls)[0];
  try { const r = await fetch(src.baseUrl + first); const b = await r.arrayBuffer(); return { baseUrl: src.baseUrl, first, ok: r.ok, bytes: b.byteLength }; } catch (e) { return { baseUrl: src.baseUrl, first, fetchError: String(e) }; }
});

await withElectron(profile, async (h) => {
  let { page } = h;
  const audioLog = [];
  const failed = [];
  const watch = (p) => {
    p.on('console', (m) => { if (/AudioEngine|sampler|undefinedblob/i.test(m.text())) audioLog.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
    p.on('requestfailed', (r) => failed.push(`${r.failure()?.errorText} ${r.url().replace(/^.*\/(out|lumakeys)\//, '<$1>/')}`));
  };
  const mark = (step) => { console.log(`  [${step}] failed requests so far`, JSON.stringify([...new Set(failed)])); failed.length = 0; };
  watch(page);
  await page.waitForTimeout(2500);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await openAudio(page);
  await page.mouse.click(400, 300); await page.waitForTimeout(1500);
  mark('boot');
  await ctl(page, '^Instrument').selectOption('flute'); await page.waitForTimeout(1500);
  mark('select flute (built-in)');
  console.log('WF-019 before install card', await packCard(page));
  await page.getByRole('button', { name: /Install Better Sounds/ }).click(); await page.waitForTimeout(3000);
  console.log('WF-019 after install status', JSON.stringify(await status(page)), 'card', await packCard(page));
  const packDir = path.join(h.userData, 'instrument-sample-packs');
  console.log('WF-019 userData packs', JSON.stringify(ls(packDir)), 'flute files', ls(path.join(packDir, 'flute')).length);
  console.log('WF-019 resolve + fetch first sample', JSON.stringify(await probe(page)));
  await page.mouse.click(400, 300); await page.waitForTimeout(1500);
  mark('install + click');
  console.log('WF-019 audio log after install', JSON.stringify(audioLog.filter((l) => /custom|Failed|undefinedblob|error/i.test(l)).slice(0, 6)));
  audioLog.length = 0;
  ({ page } = await h.relaunch()); watch(page);
  await page.waitForTimeout(2500);
  await page.mouse.click(400, 300); await page.waitForTimeout(2000);
  await openAudio(page);
  console.log('WF-019 after relaunch instrument', await ctl(page, '^Instrument').inputValue(), 'card', await packCard(page));
  mark('relaunch');
  console.log('WF-019 audio log after relaunch', JSON.stringify(audioLog.filter((l) => /custom|Failed|undefinedblob|error|Loading/i.test(l)).slice(0, 6)));
  audioLog.length = 0;
  await page.getByRole('button', { name: /Use Built-in Sounds/ }).first().click(); await page.waitForTimeout(1200);
  await page.mouse.click(400, 300); await page.waitForTimeout(1500);
  mark('remove');
  console.log('WF-019 engine log during remove', JSON.stringify(audioLog.filter((l) => /custom|Failed|fallback|loaded successfully|Loading sampler|PolySynth/i.test(l)).map((l) => l.slice(0, 90))));
  console.log('WF-019 remove status', JSON.stringify(await status(page)), 'card', await packCard(page), 'flute dir', JSON.stringify(ls(path.join(packDir, 'flute'))));
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 10)));
});
console.log('DONE');
