// Desktop half of WF-020/021/022/023 and WF-006: export, confirm dialogs, resets,
// restore (garbage, tampered, valid), missing file, SIGKILL after writes.
// Run from $TMPDIR/pw with LK_SQLITE_MODULE set; PROFILE must be under $TMPDIR.
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const Database = createRequire(path.join(REPO, 'package.json'))('better-sqlite3');
const profile = process.env.PROFILE;
const shots = path.join(profile, 'shots');
fs.mkdirSync(shots, { recursive: true });
const MIDI = path.join(REPO, 'public/curriculum-midis');
const bridge = (page, m, args = []) => page.evaluate(([m, a]) => window.appBridge[m](...a).then((r) => r, (e) => ({ error: String(e) })), [m, args]);
const status = async (page, re) => JSON.stringify((await text(page)).match(re));
const ls = (dir) => { try { return fs.readdirSync(dir); } catch (e) { return `ERR ${e.code}`; } };
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${shots}/${name}.png` }); };
const dbq = (userData, sql) => { const db = new Database(path.join(userData, 'lumakeys.db'), { readonly: true, fileMustExist: true }); try { return db.prepare(sql).all(); } finally { db.close(); } };

await withElectron(profile, async (h) => {
  let { page } = h;
  await page.waitForTimeout(2500);
  if ((await text(page)).match(/FIRST PRACTICE SETUP/i)) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.waitForTimeout(800);

  // seed songs through the real Upload MIDI dialog path
  const mids = fs.readdirSync(MIDI).filter((f) => f.endsWith('.mid')).slice(0, 3).map((f) => path.join(MIDI, f));
  await h.stubOpen(mids);
  await page.getByRole('button', { name: 'Upload MIDI', exact: true }).click();
  await page.waitForTimeout(2000);
  console.log('seed import status', await status(page, /(Imported|import)[^\n]{0,160}/i), 'songs', (await bridge(page, 'getAllSongs')).length, 'midi-files', ls(path.join(h.userData, 'midi-files')).length);

  // WF-020 export through the save dialog
  const backupPath = path.join(profile, 'backup.json');
  await h.stubSave(backupPath);
  await page.getByRole('button', { name: 'Export Library' }).click();
  await page.waitForTimeout(1500);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  console.log('WF-020 export keys', Object.keys(backup), 'songs', backup.songs?.length, 'status', await status(page, /Export[^\n]{0,200}/));
  const tampered = JSON.parse(JSON.stringify(backup));
  const b64 = tampered.midiFiles[0].dataBase64;
  tampered.midiFiles[0].dataBase64 = b64.slice(0, 40) + (b64[40] === 'A' ? 'B' : 'A') + b64.slice(41);
  fs.writeFileSync(path.join(profile, 'tampered.json'), JSON.stringify(tampered));
  fs.writeFileSync(path.join(profile, 'garbage.json'), '{"not":"a backup"}');
  await h.stubSave(null);
  await page.getByRole('button', { name: 'Export Library' }).click();
  await page.waitForTimeout(800);
  console.log('WF-020 export cancelled status', await status(page, /Export[^\n]{0,200}/));

  // WF-021 learning progress reset with Escape and Cancel first
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('tab', { name: 'Practice' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Clear Learning Progress' }).click();
  await shot(page, '01-confirm-progress');
  const dlg = page.getByRole('dialog');
  console.log('WF-021 dialog visible', await dlg.isVisible(), 'focus in dialog', await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  console.log('WF-021 Escape closes', !(await dlg.isVisible()));
  await page.getByRole('button', { name: 'Clear Learning Progress' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click(); await page.waitForTimeout(300);
  console.log('WF-021 Cancel closes', !(await page.getByRole('dialog').isVisible()));
  const songs = await bridge(page, 'getAllSongs');
  const seed = await bridge(page, 'saveGameResult', [{ songId: songs[0].id, score: 1234, accuracy: 0.9, maxCombo: 10, perfectHits: 9, goodHits: 1, okHits: 0, misses: 0, tempo: 100, mode: 'both', durationSec: 30, measureAccuracy: [] }]);
  console.log('seed result', JSON.stringify(seed).slice(0, 160), 'results before', (await bridge(page, 'getGameResults', [songs[0].id])).length);
  await page.getByRole('button', { name: 'Clear Learning Progress' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear Learning Progress' }).click();
  await page.waitForTimeout(1200);
  console.log('WF-021 status', await status(page, /(progress|reset|cleared)[^\n]{0,140}/i));
  console.log('WF-021 songs kept', (await bridge(page, 'getAllSongs')).length, 'results after', JSON.stringify(await bridge(page, 'getGameResults', [songs[0].id])).slice(0, 80));

  // WF-022 delete all user data; inspect userData on disk
  await page.getByRole('button', { name: 'Delete User Data' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete User Data' }).click();
  await page.waitForTimeout(1500);
  await shot(page, '02-after-data-reset');
  console.log('WF-022 songs after', (await bridge(page, 'getAllSongs')).length, 'midi-files', JSON.stringify(ls(path.join(h.userData, 'midi-files'))), 'localStorage', JSON.stringify(await page.evaluate(() => Object.keys(localStorage))));
  console.log('WF-022 userData entries', JSON.stringify(ls(h.userData)));
  ({ page } = await h.relaunch());
  await page.waitForTimeout(2500);
  console.log('WF-022 relaunch: setup guide again', /FIRST PRACTICE SETUP/i.test(await text(page)), 'songs', (await bridge(page, 'getAllSongs')).length);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Play' }).first().click(); await page.waitForTimeout(800);

  // WF-020 restore: garbage, tampered, valid, then cancelled dialog
  for (const [label, file] of [['garbage', 'garbage.json'], ['tampered', 'tampered.json'], ['valid', 'backup.json'], ['cancel', null]]) {
    await h.stubOpen(file ? [path.join(profile, file)] : []);
    await page.getByRole('button', { name: 'Import Library' }).click();
    await page.waitForTimeout(1800);
    console.log(`WF-020 restore ${label}:`, await status(page, /(Import|Restore|Invalid|backup)[^\n]{0,200}/i), 'songs', (await bridge(page, 'getAllSongs')).length, 'midi-files', ls(path.join(h.userData, 'midi-files')).length);
  }
  await shot(page, '03-after-restore');

  // WF-006 missing MIDI file on disk
  const now = await bridge(page, 'getAllSongs');
  const target = now[0];
  const stored = ls(path.join(h.userData, 'midi-files'));
  const missing = stored.find((f) => (target.filePath ?? '').endsWith(f)) ?? stored[0];
  fs.renameSync(path.join(h.userData, 'midi-files', missing), path.join(profile, missing + '.moved'));
  console.log('WF-006 removed', missing, 'for', target.title);
  await page.getByRole('button', { name: 'Refresh' }).click(); await page.waitForTimeout(800);
  console.log('WF-006 library marks missing?', JSON.stringify((await text(page)).match(/[^\n]{0,60}(missing|unavailable|not found)[^\n]{0,60}/gi)));
  const card = () => page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: new RegExp('^' + target.title + '$') }) }).first();
  await card().getByRole('button', { name: 'More' }).click(); await page.waitForTimeout(300);
  await card().getByRole('button', { name: 'Edit Metadata' }).click(); await page.waitForTimeout(400);
  const other = now.find((s) => s.id !== target.id);
  await h.stubOpen([path.join(MIDI, path.basename(mids.find((m) => !m.includes(target.title)) ?? mids[1]))]);
  await page.getByRole('button', { name: 'Reattach MIDI' }).click(); await page.waitForTimeout(1200);
  console.log('WF-006 reattach wrong file:', JSON.stringify((await text(page)).match(/[^\n]{0,40}(Reattach|failed)[^\n]{0,200}/g)), 'other', other?.title, 'load still fails', 'error' in (await bridge(page, 'loadMidiFileData', [target.id])));
  await h.stubOpen([path.join(MIDI, target.title + '.mid')]);
  await page.getByRole('button', { name: 'Reattach MIDI' }).click(); await page.waitForTimeout(1200);
  console.log('WF-006 reattach right file:', JSON.stringify((await text(page)).match(/Reattach[^\n]{0,200}/g)), 'midi-files', ls(path.join(h.userData, 'midi-files')).length, 'load ok', !('error' in (await bridge(page, 'loadMidiFileData', [target.id]))));
  await h.stubOpen([]);
  await page.getByRole('button', { name: 'Reattach MIDI' }).click(); await page.waitForTimeout(800);
  console.log('WF-006 reattach cancel:', JSON.stringify((await text(page)).match(/(Reattach|cancel)[^\n]{0,120}/gi)));
  await shot(page, '04-reattach');
  // missing file at Play time: move the file away again and start this song from its card
  const again = path.basename((await bridge(page, 'getSong', [target.id])).filePath);
  fs.renameSync(path.join(h.userData, 'midi-files', again), path.join(profile, again + '.moved2'));
  await page.getByRole('button', { name: 'Close', exact: true }).click(); await page.waitForTimeout(400);
  await card().getByRole('button', { name: 'Play', exact: true }).click(); await page.waitForTimeout(2000);
  await shot(page, '05-play-missing');
  console.log('WF-006 play missing text', JSON.stringify((await text(page)).match(/[^\n]{0,40}(missing|not found|unavailable|failed|Unable|ENOENT)[^\n]{0,160}/gi)), 'buttons', JSON.stringify(await page.$$eval('button', (b) => b.map((x) => x.textContent.trim()).filter((t) => /Retry|Menu|Back|Library/.test(t)))));
  fs.renameSync(path.join(profile, again + '.moved2'), path.join(h.userData, 'midi-files', again));
  const back = page.getByRole('button', { name: /Main Menu/ }).first();
  if (await back.isVisible().catch(() => false)) { await back.click(); await page.waitForTimeout(600); }

  // WF-023 SIGKILL right after writes, then relaunch
  await bridge(page, 'saveGameResult', [{ songId: target.id, score: 777, accuracy: 0.5, maxCombo: 3, perfectHits: 1, goodHits: 1, okHits: 1, misses: 1, tempo: 100, mode: 'both', durationSec: 10, measureAccuracy: [] }]);
  await bridge(page, 'setSetting', ['audio', 'masterVolume', '0.42']);
  ({ page } = await h.relaunch({ kill: true }));
  await page.waitForTimeout(2500);
  console.log('WF-023 after SIGKILL: songs', (await bridge(page, 'getAllSongs')).length, 'results', (await bridge(page, 'getGameResults', [target.id])).length, 'setting', JSON.stringify(await bridge(page, 'getSetting', ['audio', 'masterVolume'])));
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 12)));
});
// app closed; check the database file with the Node-ABI driver
const ud = path.join(profile, '.config', 'lumakeys');
const db = new Database(path.join(ud, 'lumakeys.db'), { readonly: true });
console.log('WF-023 integrity_check', JSON.stringify(db.pragma('integrity_check')), 'journal', JSON.stringify(db.pragma('journal_mode')));
db.close();
console.log('userData', JSON.stringify(ls(ud)));
console.log('DONE');
