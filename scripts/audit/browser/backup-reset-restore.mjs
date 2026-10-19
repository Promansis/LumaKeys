import { withServer, text } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
const shots = process.env.SHOTS; const data = process.env.DATA;
const MODE = process.env.MODE || 'both';
const MIDI = '/media/storage/LumaKeys/public/curriculum-midis';
const step = async (page, name) => { await page.waitForTimeout(500); await page.screenshot({ path: `${shots}/${name}.png` }); };
const status = async (page, re) => JSON.stringify((await text(page)).match(re));
const ls = (dir) => { try { return fs.readdirSync(dir); } catch (e) { return `ERR ${e.code}`; } };
const rpc = (base, m, args = []) => fetch(`${base}/api/bridge/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }).then((r) => r.json()).then((j) => ('result' in j ? j.result : j));
const errors = await withServer(data, async ({ page, base, restart }) => {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.waitForTimeout(800);
  console.log('songs before', (await rpc(base, 'getAllSongs')).length);

  // WF-020 export backup
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Library' }).click()]);
  const backupPath = path.join(data, 'backup.json');
  await download.saveAs(backupPath);
  await page.waitForTimeout(800);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  console.log('WF-020 export filename', download.suggestedFilename(), 'keys', Object.keys(backup), 'songs', backup.songs?.length, 'status', await status(page, /Export[^\n]{0,160}/));
  // tampered backup: mismatch content id
  const tampered = JSON.parse(JSON.stringify(backup));
  if (tampered.songs?.[0]?.midi) tampered.songs[0].midi = tampered.songs[0].midi.slice(0, -4) + 'AAAA';
  console.log('backup song keys', Object.keys(backup.songs?.[0] ?? {}));
  fs.writeFileSync(path.join(data, 'tampered.json'), JSON.stringify(tampered));
  fs.writeFileSync(path.join(data, 'garbage.json'), '{"not":"a backup"}');

  // WF-021 reset learning progress with confirmation; Escape and Cancel first
  await page.getByRole('button', { name: 'Settings' }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('tab', { name: 'Practice' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Clear Learning Progress' }).click();
  await step(page, '05-confirm-progress');
  const dlg = page.getByRole('dialog');
  console.log('WF-021 dialog visible', await dlg.isVisible(), 'focus in dialog', await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  console.log('WF-021 Escape closes dialog', !(await dlg.isVisible()));
  await page.getByRole('button', { name: 'Clear Learning Progress' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click(); await page.waitForTimeout(300);
  console.log('WF-021 Cancel closes dialog', !(await page.getByRole('dialog').isVisible()));
  // seed some progress: a game result via rpc
  const songs = await rpc(base, 'getAllSongs');
  const seed = await rpc(base, 'saveGameResult', [{ songId: songs[0].id, score: 1234, accuracy: 0.9, maxCombo: 10, perfectHits: 9, goodHits: 1, okHits: 0, misses: 0, tempo: 100, mode: MODE, durationSec: 30, measureAccuracy: [] }]).catch((e) => ({ err: String(e) }));
  console.log('seed result', JSON.stringify(seed).slice(0, 200));
  const before = await rpc(base, 'getGameResults', [songs[0].id]).catch(() => null);
  console.log('results before reset', Array.isArray(before) ? before.length : JSON.stringify(before).slice(0, 120));
  await page.getByRole('button', { name: 'Clear Learning Progress' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Clear Learning Progress' }).click();
  await page.waitForTimeout(1200);
  await step(page, '06-after-progress-reset');
  console.log('WF-021 status', await status(page, /(progress|reset|cleared)[^\n]{0,140}/i));
  console.log('WF-021 songs kept', (await rpc(base, 'getAllSongs')).length, 'results after', JSON.stringify(await rpc(base, 'getGameResults', [songs[0].id]).catch((e) => String(e))).slice(0, 80));

  // WF-022 reset all user data
  await page.getByRole('button', { name: 'Delete User Data' }).click();
  await step(page, '07-confirm-data');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete User Data' }).click();
  await page.waitForTimeout(1500);
  await step(page, '08-after-data-reset');
  console.log('WF-022 after reset: screen text', JSON.stringify((await text(page)).slice(0, 300)));
  console.log('WF-022 songs after', (await rpc(base, 'getAllSongs')).length, 'midi-files', JSON.stringify(ls(path.join(data, 'midi-files'))), 'localStorage', JSON.stringify(await page.evaluate(() => Object.keys(localStorage))));
  console.log('WF-022 settings after reset (posture skip)', JSON.stringify(await rpc(base, 'getAllSettings').catch(() => 'n/a')).slice(0, 300));

  // WF-020 restore from backup
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  console.log('WF-022 reload after reset: setup guide shown again =', (await text(page)).includes('FIRST PRACTICE SETUP'));
  if ((await text(page)).includes('FIRST PRACTICE SETUP')) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Play' }).first().click(); await page.waitForTimeout(600);
  for (const [label, file] of [['garbage', 'garbage.json'], ['tampered', 'tampered.json'], ['valid', 'backup.json']]) {
    const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import Library' }).click()]);
    await ch.setFiles(path.join(data, file));
    await page.waitForTimeout(1500);
    console.log(`WF-020 restore ${label}:`, await status(page, /(Import|Restore)[^\n]{0,200}/), 'songs now', (await rpc(base, 'getAllSongs')).length, 'midi-files', ls(path.join(data, 'midi-files')).length);
  }
  await step(page, '09-after-restore');

  // WF-006 delete song, then reattach: make file missing
  const now = await rpc(base, 'getAllSongs');
  const target = now[0];
  const stored = ls(path.join(data, 'midi-files'));
  console.log('song filePath', target.filePath, 'stored', JSON.stringify(stored));
  const missing = stored.find((f) => target.filePath.endsWith(f)) ?? stored[0];
  fs.renameSync(path.join(data, 'midi-files', missing), path.join(data, missing + '.moved'));
  await page.getByRole('button', { name: 'Refresh' }).click(); await page.waitForTimeout(800);
  // open first song card
  await page.getByRole('button', { name: 'More' }).first().click(); await page.waitForTimeout(400);
  await step(page, '10-song-detail-missing');
  console.log('detail text', JSON.stringify((await text(page)).match(/(missing|not found|unavailable|Reattach)[^\n]{0,120}/gi)));
  // play with missing file
  const detailPlay = page.getByRole('button', { name: 'Play', exact: true }).last();
  await detailPlay.click(); await page.waitForTimeout(1500);
  await step(page, '11-play-missing');
  console.log('WF-006 play missing text', JSON.stringify((await text(page)).match(/(missing|not found|unavailable|failed|error|Retry|Back)[^\n]{0,120}/gi)));
});
console.log('ERRORS', JSON.stringify(errors, null, 1));
