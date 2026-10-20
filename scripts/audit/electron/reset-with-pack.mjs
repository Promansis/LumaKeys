// Desktop proof for PH-DATA-002 (WF-022): with the managed Flute pack installed, Delete User
// Data must also remove the pack, and a relaunch must not resolve it again.
// Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE (empty, under $TMPDIR) set.
import { withElectron, text } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
const profile = process.env.PROFILE;
const ls = (d) => { try { return fs.readdirSync(d); } catch (e) { return `ERR ${e.code}`; } };
const walk = (d) => { try { return fs.readdirSync(d, { recursive: true }).length; } catch (e) { return `ERR ${e.code}`; } };
const status = (page) => page.locator('.settings-status-message').innerText().catch(() => '?');
const openSettings = async (page, tab) => {
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700);
  await page.locator(`#settings-tab-${tab}`).click(); await page.waitForTimeout(250);
  const adv = page.getByRole('button', { name: /show advanced options/i });
  if (tab === 'audio' && await adv.count()) { await adv.first().click(); await page.waitForTimeout(250); }
};
const resolve = (page) => page.evaluate(() => window.appBridge.resolveInstrumentSampleSource('flute').then((s) => (s ? { baseUrl: s.baseUrl, files: Object.keys(s.urls ?? {}).length } : null), (e) => ({ error: String(e) })));

await withElectron(profile, async (h) => {
  let { page } = h;
  const packDir = path.join(h.userData, 'instrument-sample-packs');
  await page.waitForTimeout(2500);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await openSettings(page, 'audio');
  await page.locator('#settings-panel-audio label').filter({ hasText: /^Instrument/i }).locator('select').first().selectOption('flute'); await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /Install Better Sounds/ }).click(); await page.waitForTimeout(3000);
  console.log('installed', JSON.stringify({ status: await status(page), packDir: ls(packDir), entries: walk(packDir), resolve: await resolve(page) }));

  await page.locator('#settings-tab-practice').click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Delete User Data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete User Data' }).click();
  await page.waitForTimeout(1500);
  console.log('after Delete User Data', JSON.stringify({ status: await status(page), packDir: ls(packDir), entries: walk(packDir), resolve: await resolve(page), userData: ls(h.userData) }));

  ({ page } = await h.relaunch());
  await page.waitForTimeout(2500);
  console.log('after relaunch', JSON.stringify({ setupGuide: /FIRST PRACTICE SETUP/i.test(await text(page)), packDir: ls(packDir), entries: walk(packDir), resolve: await resolve(page) }));
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 10)));
});
console.log('DONE');
