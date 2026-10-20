// PH-DATA-001 proof, web runtime: restore, delete and reset through the UI with a filesystem
// failure injected only by permissions in a throwaway data dir. Checks the message the user
// sees, the DB rows and files before and after each failed attempt, and that a retry works once
// permissions are back.
// Env: REPO (repository root), DATA (empty dir under $TMPDIR), EVID (evidence dir), PORT (3910-3919),
//      PLAYWRIGHT_BROWSERS_PATH. Run from $TMPDIR/pw. Never point DATA at real data.
import fs from 'node:fs';
import path from 'node:path';
import * as playwright from 'playwright';
import { REPO, startServer, inventory, summarize, compare, lock, unlock, unlockTree, plantLockedDir, ls, rpc, text, visibleStatus } from './proof-data-common.mjs';

const DATA = process.env.DATA; const EVID = process.env.EVID; const PORT = Number(process.env.PORT ?? 3910);
if (!DATA || !EVID) throw new Error('set DATA and EVID');
if (!DATA.includes('/tmp/') && !(process.env.TMPDIR && DATA.startsWith(process.env.TMPDIR))) throw new Error('DATA must be under $TMPDIR');
fs.mkdirSync(EVID, { recursive: true });
const MF = path.join(DATA, 'midi-files');
const DBF = path.join(DATA, 'lumakeys.db');
const MIDI = path.join(REPO, 'public/curriculum-midis');
const log = (...a) => console.log(...a);
const snap = () => inventory(DATA, DBF);
const save = (name, obj) => fs.writeFileSync(path.join(EVID, name + '.json'), JSON.stringify(obj, null, 1));

const server = await startServer(DATA, PORT);
if (!server.ok) throw new Error('server did not start');
const browser = await playwright.chromium.launch();
log('versions: node', process.version, '| chromium', browser.version(), '| playwright', playwright.chromium.name());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
const page = await ctx.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text().slice(0, 240)}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message.slice(0, 240)}`));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`[http ${r.status()}] ${r.request().method()} ${r.url().replace(server.base, '')}`); });

const shot = (n) => page.screenshot({ path: path.join(EVID, n + '.png') });
async function toMenu() {
  await page.goto(server.base + '/', { waitUntil: 'networkidle' });
  const skip = page.getByRole('button', { name: /Skip for now/i });
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(400); }
}
async function toLibrary() {
  await toMenu();
  await page.getByRole('button', { name: 'Play' }).first().click();
  await page.getByRole('heading', { name: 'Your Library' }).waitFor();
  await page.waitForTimeout(500);
}
async function toResetDialog() {
  await toMenu();
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(600);
  await page.getByRole('tab', { name: 'Practice' }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Delete User Data' }).click(); await page.waitForTimeout(300);
}
async function upload(files) {
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Upload MIDI/ }).click()]);
  await ch.setFiles(files); await page.waitForTimeout(2500);
}
async function importBackup(file) {
  const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Import Library' }).click()]);
  await ch.setFiles(file);
}
async function selectSongs(ids) {
  const songs = await rpc(server.base, 'getAllSongs');
  for (const id of ids) {
    const t = songs.find((s) => s.id === id).title;
    await page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).locator('.song-select-toggle input').check();
  }
}
const bulkDelete = () => page.locator('.bulk-action-bar').getByRole('button', { name: 'Delete', exact: true }).click();

// Run one UI action, then compare the data dir and DB before and after.
async function attempt(label, action) {
  const before = snap();
  await action();
  await page.waitForTimeout(1200);
  const status = await visibleStatus(page);
  const dialog = await page.getByRole('dialog').allInnerTexts().catch(() => []);
  const after = snap();
  await shot(label);
  log(`\n[${label}] UI status: ${JSON.stringify(status)}${dialog.length ? ' dialog: ' + JSON.stringify(dialog) : ''}`);
  log(`[${label}] before ${summarize(before)}`);
  log(`[${label}] after  ${summarize(after)}`);
  log(`[${label}] ${compare('diff', before, after)}`);
  save(label, { status, dialog, before, after });
  return { before, after, status };
}
const phase = async (name, fn) => { log(`\n=== ${name} ===`); try { await fn(); } catch (e) { log(`PHASE ERROR ${name}:`, String(e).slice(0, 400)); } finally { unlockTree(DATA); } };

// ---- seed: four songs through the Upload MIDI path, then a backup through Export Library
let backup; let ids = [];
await phase('seed and export', async () => {
  await toLibrary();
  const mids = fs.readdirSync(MIDI).filter((f) => f.endsWith('.mid')).slice(0, 4).map((f) => path.join(MIDI, f));
  await upload(mids);
  const songs = await rpc(server.base, 'getAllSongs');
  ids = songs.map((s) => s.id);
  log('seeded songs', songs.length, 'midi-files', ls(MF).length);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Library' }).click()]);
  const backupPath = path.join(EVID, 'backup.json');
  await download.saveAs(backupPath);
  backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  log('export: version', backup.version, 'songs', backup.songs.length, 'midiFiles', backup.midiFiles.length);
  save('00-seed', snap());
});
const BACKUP = path.join(EVID, 'backup.json');

// ---- DELETE A: midi-files read-only. Single-song delete through the bulk bar.
await phase('DELETE A single song, midi-files read-only', async () => {
  await toLibrary();
  await selectSongs([ids[0]]);
  lock(MF);
  const r = await attempt('D-A-fail', () => bulkDelete());
  unlockTree(DATA);
  log('permissions restored; selection still checked =', await page.locator('.song-select-toggle input:checked').count());
  await attempt('D-A-retry', () => bulkDelete());
  log('after retry: getAllSongs', (await rpc(server.base, 'getAllSongs')).length);
});

// ---- DELETE B: three songs selected, the second file's path is a locked directory so the
// rename out of midi-files fails after the first file has already been moved.
await phase('DELETE B bulk, failure on the 2nd file', async () => {
  await toLibrary();
  const [x, y, z] = ids.slice(1, 4);
  const real = path.join(MF, `${y}.mid`); const aside = path.join(EVID, 'aside-y.mid');
  fs.renameSync(real, aside);
  plantLockedDir(real);
  await selectSongs([x, y, z]);
  await attempt('D-B-fail', () => bulkDelete());
  await attempt('D-B-retry-still-blocked', () => bulkDelete());
  unlockTree(DATA); fs.rmSync(real, { recursive: true, force: true }); fs.renameSync(aside, real);
  log('blocker removed, real file put back');
  await attempt('D-B-retry-fixed', () => bulkDelete());
  log('after retry: getAllSongs', (await rpc(server.base, 'getAllSongs')).length, 'midi-files', JSON.stringify(ls(MF)));
});

// ---- RESTORE A: library empty, midi-files read-only, restore the backup.
await phase('RESTORE A, midi-files read-only', async () => {
  log('library before restore: songs', (await rpc(server.base, 'getAllSongs')).length);
  await toLibrary();
  lock(MF);
  await attempt('R-A-fail', () => importBackup(BACKUP));
  unlockTree(DATA);
  await attempt('R-A-retry', () => importBackup(BACKUP));
  log('after retry: songs', (await rpc(server.base, 'getAllSongs')).length, 'midi-files', ls(MF).length);
});

// ---- RESTORE B: empty the library again, put a locked directory where the 2nd backup file
// goes, so the first commit works and the second fails.
await phase('RESTORE B, failure on the 2nd file commit', async () => {
  await toLibrary();
  await selectSongs((await rpc(server.base, 'getAllSongs')).map((s) => s.id));
  await bulkDelete(); await page.waitForTimeout(1200);
  log('emptied: songs', (await rpc(server.base, 'getAllSongs')).length, 'midi-files', JSON.stringify(ls(MF)));
  const second = backup.songs[1].id;
  plantLockedDir(path.join(MF, `${second}.mid`));
  await attempt('R-B-fail', () => importBackup(BACKUP));
  await attempt('R-B-retry-still-blocked', () => importBackup(BACKUP));
  unlockTree(DATA); fs.rmSync(path.join(MF, `${second}.mid`), { recursive: true, force: true });
  await attempt('R-B-retry-fixed', () => importBackup(BACKUP));
  log('after retry: songs', (await rpc(server.base, 'getAllSongs')).length, 'midi-files', ls(MF).length);
});

// ---- RESET A: the data dir itself is read-only, so the midi-files rename cannot happen.
await phase('RESET A, data dir read-only', async () => {
  await toResetDialog();
  lock(DATA);
  await attempt('X-A-fail', () => page.getByRole('dialog').getByRole('button', { name: 'Delete User Data' }).click());
  unlockTree(DATA);
  await attempt('X-A-retry', () => page.getByRole('dialog').getByRole('button', { name: 'Delete User Data' }).click());
  log('after retry: songs', (await rpc(server.base, 'getAllSongs')).length, 'midi-files', JSON.stringify(ls(MF)), 'data dir', JSON.stringify(ls(DATA)));
});

// ---- RESET B: midi-files read-only. The directory moves aside (same parent), SQLite is wiped,
// then removing the moved directory fails.
await phase('RESET B, midi-files read-only', async () => {
  await toLibrary();
  await importBackup(BACKUP); await page.waitForTimeout(2500);
  log('reseeded: songs', (await rpc(server.base, 'getAllSongs')).length);
  await rpc(server.base, 'saveGameResult', [{ songId: (await rpc(server.base, 'getAllSongs'))[0].id, score: 1, accuracy: 0.5, maxCombo: 1, perfectHits: 1, goodHits: 0, okHits: 0, misses: 0, tempo: 100, mode: 'learning', durationSec: 5, measureAccuracy: [] }]);
  await toResetDialog();
  await page.evaluate(() => { localStorage.setItem('proof-marker', 'still-here'); });
  lock(MF);
  await attempt('X-B-fail', () => page.getByRole('dialog').getByRole('button', { name: 'Delete User Data' }).click());
  log('localStorage marker after failed reset =', await page.evaluate(() => localStorage.getItem('proof-marker')));
  log('GET getAllSongs after failed reset =', (await rpc(server.base, 'getAllSongs')).length);
  // retry with the fault still in place
  await attempt('X-B-retry-still-locked', () => page.getByRole('dialog').getByRole('button', { name: 'Delete User Data' }).click());
  // restart the server with the stale directory still locked
  log('\nrestart with fault still present');
  const ok1 = await server.restart();
  log('server restarted ok =', ok1, 'exitCode', server.srv.exitCode);
  save('X-B-restart-locked', { ok: ok1, inv: snap(), serverLog: fs.readFileSync(server.logFile, 'utf8').split('\n').slice(-25) });
  log('after restart (locked):', summarize(snap()));
  unlockTree(DATA);
  const ok2 = await server.restart();
  log('restart after permissions restored ok =', ok2);
  log('after restart (fixed):', summarize(snap()));
  save('X-B-restart-fixed', { ok: ok2, inv: snap() });
  log('after recovery: songs', (await rpc(server.base, 'getAllSongs')).length, 'data dir', JSON.stringify(ls(DATA)));
});

log('\nBROWSER ERRORS', JSON.stringify(errors, null, 1));
unlockTree(DATA);
await browser.close();
await server.down();
log('DONE');
