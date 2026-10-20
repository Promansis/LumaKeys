// PH-DATA-002 proof, Electron runtime (out/ build): capture the Delete User Data confirmation copy, then
// compare a before/after inventory (database tables, userData files, localStorage, pack status, and the
// same after a relaunch) with what the copy says is removed.
// Env: REPO, PROFILE (empty dir under $TMPDIR), EVID, LK_SQLITE_MODULE (Electron-ABI better-sqlite3).
// Run from $TMPDIR/pw next to proof-data-common.mjs and proof-electron-harness.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { withElectron } from './proof-electron-harness.mjs';
import { REPO, inventory, summarize, dbDiff, fsDiff, ls, walk, text, visibleStatus, seedRich, browserState } from './proof-data-common.mjs';

const PROFILE = process.env.PROFILE; const EVID = process.env.EVID;
if (!PROFILE || !EVID) throw new Error('set PROFILE and EVID');
if (!process.env.TMPDIR || !PROFILE.startsWith(process.env.TMPDIR)) throw new Error('PROFILE must be under $TMPDIR');
fs.mkdirSync(EVID, { recursive: true });
const UD = path.join(PROFILE, '.config', 'lumakeys');
const DBF = path.join(UD, 'lumakeys.db');
const MIDI = path.join(REPO, 'public/curriculum-midis');
const KEEP = /^(midi-files|\.midi-files|instrument-sample-packs|\.instrument-sample-packs)/;
const log = (...a) => console.log(...a);
const save = (name, obj) => fs.writeFileSync(path.join(EVID, name + '.json'), JSON.stringify(obj, null, 1));
const snap = () => inventory(UD, DBF, { keep: KEEP, skip: [] });

await withElectron(PROFILE, async (h) => {
  let page = h.page;
  log('versions: node', process.version, '| electron', await h.app.evaluate(({ app }) => `${app.getVersion()} electron ${process.versions.electron} chrome ${process.versions.chrome}`));
  const call = (m, args = []) => page.evaluate(([m, a]) => window.appBridge[m](...a), [m, args]);
  const bridgeState = () => page.evaluate(async () => ({
    songs: (await window.appBridge.getAllSongs()).length,
    folders: (await window.appBridge.getAllFolders()).length,
    playlists: (await window.appBridge.getAllPlaylists()).length,
    installedPacks: (await window.appBridge.getInstrumentSamplePackStatuses()).filter((s) => s.isInstalled).map((s) => s.instrumentId),
    fluteResolves: await window.appBridge.resolveInstrumentSampleSource('flute').then((s) => !!s, () => 'error'),
  }));
  const skipGuide = async () => { if (/FIRST PRACTICE SETUP/i.test(await text(page))) { await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForTimeout(400); } };
  await page.waitForTimeout(2500); await skipGuide();

  // seed: Upload MIDI dialog path, the bridge for the rest, then the Flute pack through Settings > Audio
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.getByRole('heading', { name: 'Your Library' }).waitFor();
  const mids = fs.readdirSync(MIDI).filter((f) => f.endsWith('.mid')).slice(0, 3).map((f) => path.join(MIDI, f));
  await h.stubOpen(mids);
  await page.getByRole('button', { name: 'Upload MIDI', exact: true }).click(); await page.waitForTimeout(3000);
  await seedRich(call, await call('getAllSongs'));
  await page.evaluate(() => localStorage.setItem('lumakeys-filter-presets', JSON.stringify({ proof: { text: 'x' } })));
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500); await skipGuide();
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(1000);
  if (!(await page.locator('#settings-tab-audio').count())) log('DEBUG screen text:', JSON.stringify((await text(page)).slice(0, 300)));
  await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(250);
  await page.locator('#settings-panel-audio label').filter({ hasText: /^Instrument/i }).locator('select').first().selectOption('flute'); await page.waitForTimeout(1000);
  const adv = page.getByRole('button', { name: /show advanced options/i }); if (await adv.count()) { await adv.first().click(); await page.waitForTimeout(250); }
  await page.getByRole('button', { name: /Install Better Sounds/ }).click(); await page.waitForTimeout(3500);

  const invBefore = snap(); const brBefore = await browserState(page); const stBefore = await bridgeState();
  const packFiles = walk(path.join(UD, 'instrument-sample-packs')).filter((e) => e.t === 'f').length;
  log('\nBEFORE db:', summarize(invBefore), '\n  unlocked achievements', invBefore.db.unlockedAchievements, 'settings keys', JSON.stringify(invBefore.db.settings));
  log('BEFORE userData top level:', JSON.stringify(invBefore.topLevel), '| sample-pack files', packFiles, '| pack dir', JSON.stringify(ls(path.join(UD, 'instrument-sample-packs'))));
  log('BEFORE browser:', JSON.stringify(brBefore), '\nBEFORE bridge:', JSON.stringify(stBefore));
  save('before', { invBefore, brBefore, stBefore, packFiles });

  // the confirmation dialog
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500); await skipGuide();
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(600);
  await page.getByRole('tab', { name: 'Practice' }).click(); await page.waitForTimeout(300);
  const groupCard = await page.locator('.settings-danger-zone').innerText();
  const card = await page.locator('.settings-danger-card').filter({ hasText: 'Delete User Data' }).innerText();
  await page.getByRole('button', { name: 'Delete User Data' }).click(); await page.waitForTimeout(400);
  const dlg = page.getByRole('dialog');
  const dialogText = await dlg.innerText();
  const dialogAria = await dlg.evaluate((el) => ({ role: el.getAttribute('role'), labelledby: el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.innerText, describedby: el.getAttribute('aria-describedby') && document.getElementById(el.getAttribute('aria-describedby'))?.innerText }));
  await page.screenshot({ path: path.join(EVID, 'confirm-dialog.png') });
  log('\nSETTINGS DANGER ZONE TEXT:', JSON.stringify(groupCard));
  log('DELETE USER DATA CARD TEXT:', JSON.stringify(card));
  log('CONFIRM DIALOG TEXT (exact):', JSON.stringify(dialogText));
  log('CONFIRM DIALOG ARIA:', JSON.stringify(dialogAria));
  save('dialog', { groupCard, card, dialogText, dialogAria });

  await dlg.getByRole('button', { name: 'Delete User Data' }).click(); await page.waitForTimeout(2500);
  const afterStatus = await visibleStatus(page);
  await page.screenshot({ path: path.join(EVID, 'after-reset.png') });
  const invAfter = snap(); const brAfter = await browserState(page); const stAfter = await bridgeState();
  log('\nAFTER reset UI status:', JSON.stringify(afterStatus));
  log('AFTER db:', summarize(invAfter), '\n  unlocked achievements', invAfter.db.unlockedAchievements, 'settings keys', JSON.stringify(invAfter.db.settings));
  log('AFTER userData top level:', JSON.stringify(invAfter.topLevel));
  log('AFTER browser:', JSON.stringify(brAfter), '\nAFTER bridge:', JSON.stringify(stAfter));
  log('DB row diff:', JSON.stringify(dbDiff(invBefore.db, invAfter.db)));
  log('FS diff:', JSON.stringify(fsDiff(invBefore.fs, invAfter.fs)));

  ({ page } = await h.relaunch()); await page.waitForTimeout(2500);
  const invRelaunch = snap(); const brRelaunch = await browserState(page); const stRelaunch = await bridgeState();
  log('\nAFTER relaunch: db', summarize(invRelaunch), '| setup guide shown =', /FIRST PRACTICE SETUP/i.test(await text(page)));
  log('AFTER relaunch: userData top level', JSON.stringify(invRelaunch.topLevel), '\nAFTER relaunch: browser', JSON.stringify(brRelaunch), '\nAFTER relaunch: bridge', JSON.stringify(stRelaunch));
  save('after', { afterStatus, invAfter, brAfter, stAfter, invRelaunch, brRelaunch, stRelaunch, rowDiff: dbDiff(invBefore.db, invAfter.db), fsDiff: fsDiff(invBefore.fs, invAfter.fs) });
});
log('DONE');
process.exit(0);
