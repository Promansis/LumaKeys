// PH-DATA-001 proof, Electron runtime (out/ build): restore, delete and reset through the UI with a
// filesystem failure injected only by permissions in a throwaway profile. Checks the message the
// user sees, the DB rows and files before and after each failed attempt, that a retry works once
// permissions are back, and what a relaunch does while a fault is still present.
// Env: REPO, PROFILE (empty dir under $TMPDIR), EVID, LK_SQLITE_MODULE (Electron-ABI better-sqlite3).
// Run from $TMPDIR/pw next to proof-data-common.mjs and proof-electron-harness.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { withElectron, launchRaw } from './proof-electron-harness.mjs';
import { REPO, inventory, summarize, compare, lock, unlockTree, plantLockedDir, ls, text, visibleStatus } from './proof-data-common.mjs';

const PROFILE = process.env.PROFILE; const EVID = process.env.EVID;
if (!PROFILE || !EVID) throw new Error('set PROFILE and EVID');
if (!process.env.TMPDIR || !PROFILE.startsWith(process.env.TMPDIR)) throw new Error('PROFILE must be under $TMPDIR');
fs.mkdirSync(EVID, { recursive: true });
const UD = path.join(PROFILE, '.config', 'lumakeys');
const MF = path.join(UD, 'midi-files');
const DBF = path.join(UD, 'lumakeys.db');
const MIDI = path.join(REPO, 'public/curriculum-midis');
const KEEP = /^(midi-files|\.midi-files|instrument-sample-packs|\.instrument-sample-packs)/;
const log = (...a) => console.log(...a);
const snap = () => inventory(UD, DBF, { keep: KEEP, skip: [] });
const save = (name, obj) => fs.writeFileSync(path.join(EVID, name + '.json'), JSON.stringify(obj, null, 1));
const unlockAll = () => unlockTree(UD);

let ids = []; let backup;
const BACKUP = path.join(EVID, 'backup.json');
const UNREADABLE = path.join(EVID, 'unreadable-backup.json');

await withElectron(PROFILE, async (h) => {
  let page = h.page;
  const bridge = (m, args = []) => page.evaluate(([m, a]) => window.appBridge[m](...a).then((r) => r, (e) => ({ error: String(e) })), [m, args]);
  const shot = async (n) => page.screenshot({ path: path.join(EVID, n + '.png') });
  async function toMenu() {
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
    if (/FIRST PRACTICE SETUP/i.test(await text(page))) { await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForTimeout(400); }
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
  const importBackup = async (file) => { await h.stubOpen([file]); await page.getByRole('button', { name: 'Import Library' }).click(); };
  async function selectSongs(songIds) {
    const songs = await bridge('getAllSongs');
    for (const id of songIds) {
      const t = songs.find((s) => s.id === id).title;
      await page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).locator('.song-select-toggle input').check();
    }
  }
  const bulkDelete = () => page.locator('.bulk-action-bar').getByRole('button', { name: 'Delete', exact: true }).click();
  const confirmReset = () => page.getByRole('dialog').getByRole('button', { name: 'Delete User Data' }).click();

  async function attempt(label, action) {
    const before = snap();
    await action();
    await page.waitForTimeout(1500);
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
  const phase = async (name, fn, keepLock = false) => { log(`\n=== ${name} ===`); try { await fn(); } catch (e) { log(`PHASE ERROR ${name}:`, String(e).slice(0, 500)); } finally { if (!keepLock) unlockAll(); } };
  const songsNow = async () => (await bridge('getAllSongs')).length;

  await phase('seed and export', async () => {
    await toLibrary();
    const mids = fs.readdirSync(MIDI).filter((f) => f.endsWith('.mid')).slice(0, 4).map((f) => path.join(MIDI, f));
    await h.stubOpen(mids);
    await page.getByRole('button', { name: 'Upload MIDI', exact: true }).click(); await page.waitForTimeout(3000);
    ids = (await bridge('getAllSongs')).map((s) => s.id);
    log('seeded songs', ids.length, 'midi-files', ls(MF).length, 'userData top level', JSON.stringify(ls(UD)));
    await h.stubSave(BACKUP);
    await page.getByRole('button', { name: 'Export Library' }).click(); await page.waitForTimeout(1500);
    backup = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
    log('export: version', backup.version, 'songs', backup.songs.length, 'midiFiles', backup.midiFiles.length);
    save('00-seed', snap());
  });

  await phase('DELETE A single song, midi-files read-only', async () => {
    await toLibrary(); await selectSongs([ids[0]]); lock(MF);
    await attempt('D-A-fail', () => bulkDelete());
    unlockAll();
    await attempt('D-A-retry', () => bulkDelete());
    log('after retry: songs', await songsNow());
  });

  await phase('DELETE B bulk, failure on the 2nd file', async () => {
    await toLibrary();
    const [x, y, z] = ids.slice(1, 4);
    const real = path.join(MF, `${y}.mid`); const aside = path.join(EVID, 'aside-y.mid');
    fs.renameSync(real, aside); plantLockedDir(real);
    await selectSongs([x, y, z]);
    await attempt('D-B-fail', () => bulkDelete());
    await attempt('D-B-retry-still-blocked', () => bulkDelete());
    unlockAll(); fs.rmSync(real, { recursive: true, force: true }); fs.renameSync(aside, real);
    await attempt('D-B-retry-fixed', () => bulkDelete());
    log('after retry: songs', await songsNow(), 'midi-files', JSON.stringify(ls(MF)));
  });

  await phase('RESTORE C, backup file unreadable', async () => {
    await toLibrary();
    fs.copyFileSync(BACKUP, UNREADABLE); fs.chmodSync(UNREADABLE, 0o000);
    await attempt('R-C-fail', () => importBackup(UNREADABLE));
    fs.chmodSync(UNREADABLE, 0o644);
    await attempt('R-C-retry', () => importBackup(UNREADABLE));
    log('after retry: songs', await songsNow(), 'midi-files', ls(MF).length);
  });

  await phase('RESTORE A, midi-files read-only', async () => {
    await toLibrary(); await selectSongs((await bridge('getAllSongs')).map((s) => s.id)); await bulkDelete(); await page.waitForTimeout(1500);
    log('emptied: songs', await songsNow());
    lock(MF);
    await attempt('R-A-fail', () => importBackup(BACKUP));
    unlockAll();
    await attempt('R-A-retry', () => importBackup(BACKUP));
    log('after retry: songs', await songsNow(), 'midi-files', ls(MF).length);
  });

  await phase('RESTORE B, failure on the 2nd file commit', async () => {
    await toLibrary(); await selectSongs((await bridge('getAllSongs')).map((s) => s.id)); await bulkDelete(); await page.waitForTimeout(1500);
    log('emptied: songs', await songsNow());
    const second = backup.songs[1].id;
    plantLockedDir(path.join(MF, `${second}.mid`));
    await attempt('R-B-fail', () => importBackup(BACKUP));
    await attempt('R-B-retry-still-blocked', () => importBackup(BACKUP));
    unlockAll(); fs.rmSync(path.join(MF, `${second}.mid`), { recursive: true, force: true });
    await attempt('R-B-retry-fixed', () => importBackup(BACKUP));
    log('after retry: songs', await songsNow(), 'midi-files', ls(MF).length);
  });

  await phase('RESET A, userData read-only', async () => {
    await toResetDialog();
    lock(UD);
    await attempt('X-A-fail', () => confirmReset());
    unlockAll();
    await attempt('X-A-retry', () => confirmReset());
    log('after retry: songs', await songsNow(), 'userData top level', JSON.stringify(ls(UD)));
  });

  await phase('RESET C, sample-pack directory cannot be removed', async () => {
    await toLibrary(); await importBackup(BACKUP); await page.waitForTimeout(2500);
    log('reseeded: songs', await songsNow());
    plantLockedDir(path.join(UD, 'instrument-sample-packs', 'flute'));
    await toResetDialog();
    await attempt('X-C-fail', () => confirmReset());
    log('GET after failed reset: songs', await songsNow());
    unlockAll();
    await attempt('X-C-retry', () => confirmReset());
    ({ page } = await h.relaunch()); await page.waitForTimeout(2500);
    const after = snap(); save('X-C-relaunch', after);
    log('after relaunch:', summarize(after), 'userData top level', JSON.stringify(ls(UD)));
  });

  await phase('RESET B, midi-files read-only', async () => {
    await toLibrary(); await importBackup(BACKUP); await page.waitForTimeout(2500);
    log('reseeded: songs', await songsNow());
    await toResetDialog();
    await page.evaluate(() => { localStorage.setItem('proof-marker', 'still-here'); });
    lock(MF);
    await attempt('X-B-fail', () => confirmReset());
    log('localStorage marker after failed reset =', await page.evaluate(() => localStorage.getItem('proof-marker')));
    log('songs after failed reset =', await songsNow());
    await attempt('X-B-retry-still-locked', () => confirmReset());
  }, true);
  // the stale directory stays read-only for the relaunch below
  log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 20)));
});

// ---- relaunch with the stale reset directory still read-only, then with permissions restored
log('\n=== RELAUNCH with fault still present ===');
const stale = fs.readdirSync(UD).filter((n) => n.startsWith('.midi-files-reset-'));
for (const n of stale) { fs.chmodSync(path.join(UD, n), 0o555); }
log('stale dirs', JSON.stringify(stale), 'modes', JSON.stringify(stale.map((n) => (fs.statSync(path.join(UD, n)).mode & 0o777).toString(8))));
// Plain launch, no Playwright: does the main process stay up, and what does it print?
{
  const p = spawn(path.join(REPO, 'node_modules/electron/dist/electron'), [path.join(REPO, 'scripts/audit/electron'), '--no-sandbox', '--disable-gpu', '--ozone-platform=headless'],
    { env: { ...process.env, HOME: PROFILE, XDG_CONFIG_HOME: path.join(PROFILE, '.config'), LK_PROFILE: PROFILE, LK_SQLITE_MODULE: process.env.LK_SQLITE_MODULE }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  await new Promise((r) => setTimeout(r, 15000));
  const still = p.exitCode === null && p.signalCode === null;
  if (still) { p.kill('SIGTERM'); await new Promise((r) => p.once('exit', r)); }
  const lines = out.split('\n').filter((l) => l.trim() && !/bus\.cc|dbus|Insecure Content|gpu|vaapi|libva/i.test(l)).slice(0, 14);
  log('plain launch (locked): still running after 15s =', still, '| output', JSON.stringify(lines));
  save('X-B-plain-launch-locked', { still, lines });
}
let r1;
try {
  r1 = await launchRaw(PROFILE, 20000);
  await r1.page.waitForTimeout(2500);
  log('relaunch (locked): window opened. body text start:', JSON.stringify((await text(r1.page)).slice(0, 160)));
  log('relaunch (locked): songs', (await r1.page.evaluate(() => window.appBridge.getAllSongs().then((s) => s.length, (e) => String(e)))));
} catch (e) {
  log('relaunch (locked) FAILED:', String(e).slice(0, 400));
}
const mainLog = fs.existsSync(path.join(PROFILE, 'main.log')) ? fs.readFileSync(path.join(PROFILE, 'main.log'), 'utf8').split('\n').filter((l) => !/Insecure Content|dbus|gpu|vaapi|libva/i.test(l)).slice(-15) : [];
log('main.log tail', JSON.stringify(mainLog));
save('X-B-relaunch-locked', { inv: snap(), mainLog });
log('after relaunch (locked):', summarize(snap()));
try { await r1?.app.close(); } catch {}
unlockAll();
const r2 = await launchRaw(PROFILE, 30000);
await r2.page.waitForTimeout(2500);
log('relaunch (fixed): songs', await r2.page.evaluate(() => window.appBridge.getAllSongs().then((s) => s.length)));
const fin = snap(); save('X-B-relaunch-fixed', fin);
log('after relaunch (fixed):', summarize(fin), 'userData top level', JSON.stringify(ls(UD)));
await r2.app.close();
unlockAll();
log('DONE');
process.exit(0);
