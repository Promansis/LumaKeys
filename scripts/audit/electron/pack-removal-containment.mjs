// Desktop runtime proof for PH-SEC-001 (OP-006): crafted instrument ids sent to
// removeInstrumentSamplePack over the real IPC bridge must not remove anything outside
// `instrument-sample-packs/`. Sentinels sit beside the profile, inside userData and beside
// the installed Flute and Cello packs. After each call the stored pack list is read back.
// A valid removal of the Flute pack runs last and must leave Cello.
// Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE (empty, under $TMPDIR) set.
import { withElectron, text } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
const profile = process.env.PROFILE;
const j = JSON.stringify;
const status = (page) => page.locator('.settings-status-message').innerText().catch(() => '?');
const remove = (page, id) => page.evaluate((i) => window.appBridge.removeInstrumentSamplePack(i).then(
  (r) => ({ ok: r.filter((s) => s.isInstalled).map((s) => s.instrumentId) }),
  (e) => ({ rejected: String(e.message ?? e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }),
), id);

await withElectron(profile, async (h) => {
  const { page } = h;
  const packRoot = path.join(h.userData, 'instrument-sample-packs');
  const sentinels = {
    outsideUserData: path.join(profile, 'outside-sentinel'),
    insideUserData: path.join(h.userData, 'sentinel-dir'),
    besidePack: path.join(packRoot, 'sentinel-pack'),
  };
  const state = () => Object.fromEntries([
    ...Object.entries(sentinels).map(([k, d]) => [k, fs.existsSync(path.join(d, 'keep.txt'))]),
    ['flutePack', fs.existsSync(path.join(packRoot, 'flute'))],
    ['celloPack', fs.existsSync(path.join(packRoot, 'cello'))],
    ['removeLeftovers', fs.readdirSync(h.userData).filter((n) => n.startsWith('.remove-')).length],
  ]);

  await page.waitForTimeout(2500);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700);
  await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(250);
  const adv = page.getByRole('button', { name: /show advanced options/i });
  if (await adv.count()) { await adv.first().click(); await page.waitForTimeout(250); }
  await page.locator('#settings-panel-audio label').filter({ hasText: /^Instrument/i }).locator('select').first().selectOption('flute'); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Install Better Sounds/ }).click(); await page.waitForTimeout(3000);
  const installed = () => page.evaluate(() => window.appBridge.getInstrumentSamplePackStatuses().then((r) => r.filter((s) => s.isInstalled).map((s) => s.instrumentId)));
  await page.evaluate(() => window.appBridge.installInstrumentSamplePack('cello'));
  for (const d of Object.values(sentinels)) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'keep.txt'), 'sentinel'); }
  console.log('setup', j({ status: await status(page), installed: await installed(), state: state() }));

  const crafted = [
    '../../../outside-sentinel',
    '../sentinel-dir',
    'flute/../../sentinel-dir',
    'flute/../sentinel-pack',
    sentinels.outsideUserData,
    sentinels.insideUserData,
    '..',
    '.',
    '',
    'sentinel-pack',
    'flute/',
    'flute\\..\\..\\sentinel-dir',
    '__proto__',
    'constructor',
  ];
  for (const id of crafted) console.log('crafted', j(id), j(await remove(page, id)), 'installed', j(await installed()), j(state()));

  console.log('valid flute', j(await remove(page, 'flute')), 'installed', j(await installed()), j(state()));
  console.log('ERRORS', j(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 10)));
});
console.log('DONE');
