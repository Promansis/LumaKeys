// Desktop halves of lane F's library items (A2: WF-007 and PH-UI-006; A3: WF-008).
// A2: import four songs through the Upload MIDI dialog path, create a folder in the sidebar,
//   tick two songs and move them into it with the bulk bar, relaunch, check the folder still
//   holds them; then tick two other songs and press the bulk bar's Delete, recording any
//   prompt (window.confirm, an in-page dialog, or a main-process message box).
// A3: import "Two Hand Study" (Melody F4 G4 A4 B4 C5 C5 above C4, Accompaniment C3 E3 G3
//   C3 E3 G3 below), start Learn, choose Right Hand in the overlay, play the six melody keys,
//   read the results; set Melody to Left Hand, relaunch, start the song again and read the
//   overlay's assignments and hand choice.
// Env: PROFILE (empty, under $TMPDIR), LK_SQLITE_MODULE, FIX_LIB (directory holding Alpha
//   Waltz, Bravo March, charlie etude and Delta Scale .mid), FIX_TWO (Two Hand Study.mid);
//   both written by ../browser/midi-fixtures.mjs. Run from $TMPDIR/pw.
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const Database = createRequire(path.join(REPO, 'package.json'))('better-sqlite3');
const profile = process.env.PROFILE;
const LIB = ['Alpha Waltz', 'Bravo March', 'charlie etude', 'Delta Scale'];
const bridge = (page, m, args = []) => page.evaluate(([m, a]) => window.appBridge[m](...a).then((r) => r, (e) => ({ error: String(e) })), [m, args]);
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

await withElectron(profile, async (h) => {
  const page = () => h.page;
  const sel = (title) => page().locator('article.song-card').filter({ has: page().locator('h2.song-card-title', { hasText: new RegExp(`^${esc(title)}$`) }) });
  const titles = () => page().$$eval('article.song-card h2.song-card-title', (e) => e.map((x) => x.textContent));
  const settle = (ms = 600) => page().waitForTimeout(ms);
  const toLibrary = async () => {
    await settle(2000);
    if (/FIRST PRACTICE SETUP/i.test(await text(page()))) await page().getByRole('button', { name: 'Skip for now' }).click();
    if (!(await text(page())).includes('Training and Setup')) {
      if (await page().locator('main.game-screen, .canvas-shell').count() && !(await page().locator('#game-overlay-title').count())) { await page().keyboard.press('Escape'); await settle(300); }
      await page().getByRole('button', { name: /^(Main Menu|Back to Main Menu)$/ }).filter({ visible: true }).first().click(); await settle(800);
    }
    await page().getByRole('button', { name: 'Play Songs', exact: true }).click();
    await page().waitForSelector('h1:has-text("Your Library")'); await settle(800);
  };
  const dbRead = (fn) => {
    const db = new Database(path.join(h.userData, 'lumakeys.db'), { readonly: true, fileMustExist: true });
    try { return fn(db); } finally { db.close(); }
  };
  const midiFiles = () => fs.readdirSync(path.join(h.userData, 'midi-files')).filter((f) => f.endsWith('.mid')).sort();

  // ---------- A2: folder move survives a relaunch ----------
  await toLibrary();
  await h.stubOpen(LIB.map((t) => path.join(process.env.FIX_LIB, `${t}.mid`)));
  await page().getByRole('button', { name: 'Upload MIDI', exact: true }).click(); await settle(2500);
  console.log('A2 imported', JSON.stringify((await titles()).sort()));
  const sidebar = () => page().locator('aside.library-sidebar');
  await sidebar().locator('#library-sidebar-folders .sidebar-create-row input').fill('Marches');
  await sidebar().locator('#library-sidebar-folders .sidebar-create-row button').click(); await settle(500);
  await sel('Alpha Waltz').locator('input[type=checkbox]').check();
  await sel('Bravo March').locator('input[type=checkbox]').check(); await settle(200);
  console.log('A2 bulk bar', JSON.stringify(await page().locator('.bulk-action-bar h2').textContent()));
  await page().locator('.bulk-action-bar label').filter({ hasText: 'Move to Folder' }).locator('select').selectOption({ label: 'Marches' }); await settle(800);
  const moved = dbRead((db) => db.prepare('SELECT s.title, f.name AS folder FROM songs s LEFT JOIN folders f ON f.id = s.folder_id ORDER BY s.title').all());
  console.log('A2 DB after move', JSON.stringify(moved));
  await h.relaunch();
  await toLibrary();
  await sidebar().getByRole('button', { name: 'Marches', exact: true }).click(); await settle(700);
  const inFolder = (await titles()).sort();
  const labels = await Promise.all(inFolder.map(async (t) => `${t}=${(await sel(t).locator('.song-card-folder').textContent().catch(() => null))}`));
  console.log('A2 after relaunch, folder view', JSON.stringify(inFolder), 'card labels', JSON.stringify(labels));
  check('A2 folder move survives relaunch', JSON.stringify(inFolder) === JSON.stringify(['Alpha Waltz', 'Bravo March']), JSON.stringify(inFolder));

  // ---------- A2: bulk delete, record any prompt ----------
  await page().getByRole('button', { name: 'All Songs', exact: true }).click(); await settle(400);
  await page().evaluate(() => { window.__dialogs = []; const c = window.confirm; window.confirm = (m) => { window.__dialogs.push(`confirm: ${m}`); return false; }; window.__realConfirm = c; });
  await h.app.evaluate(({ dialog }) => {
    globalThis.__boxes = [];
    dialog.showMessageBox = async (...a) => { globalThis.__boxes.push(String(a.at(-1)?.message)); return { response: 0, checkboxChecked: false }; };
    dialog.showMessageBoxSync = (...a) => { globalThis.__boxes.push(String(a.at(-1)?.message)); return 0; };
  });
  const before = { songs: (await bridge(page(), 'getAllSongs')).length, files: midiFiles().length };
  await sel('charlie etude').locator('input[type=checkbox]').check();
  await sel('Delta Scale').locator('input[type=checkbox]').check(); await settle(200);
  await page().screenshot({ path: path.join(profile, 'a2-before-delete.png') });
  await page().locator('.bulk-action-bar').getByRole('button', { name: 'Delete', exact: true }).click();
  await settle(150);
  const modalNow = (await page().locator('[role=dialog], [role=alertdialog]').count()) > 0;
  await settle(900);
  const prompts = { confirm: await page().evaluate(() => window.__dialogs), mainBoxes: await h.app.evaluate(() => globalThis.__boxes), inPageModal: modalNow };
  const after = { songs: (await bridge(page(), 'getAllSongs')).map((s) => s.title).sort(), files: midiFiles().length };
  const status = (await page().locator('.library-header .song-title').first().textContent().catch(() => null))?.trim();
  console.log('A2 bulk delete', JSON.stringify({ before, after, prompts, status }));
  check('A2 bulk delete removed both songs and their files at once', after.songs.length === 2 && after.files === 2 && before.songs === 4, JSON.stringify(after));
  console.log('A2 no confirmation step (PH-UI-006 holds):', prompts.confirm.length === 0 && prompts.mainBoxes.length === 0 && !modalNow);

  // ---------- A3: one-hand session ----------
  await h.stubOpen([process.env.FIX_TWO]);
  await page().getByRole('button', { name: 'Upload MIDI', exact: true }).click(); await settle(2000);
  const two = (await bridge(page(), 'getAllSongs')).find((s) => s.title === 'Two Hand Study');
  console.log('A3 imported', JSON.stringify({ id: two?.id?.slice(0, 8), trackAssignments: two?.trackAssignments }));
  const hud = async () => (await text(page())).match(/SCORE\n(\d+)\nCOMBO\n([^\n]+)/)?.slice(1).join('|') ?? 'n/a';
  const results = async () => {
    const t = await text(page());
    const num = (re) => Number(t.match(re)?.[1] ?? NaN);
    return { final: num(/FINAL SCORE\n(\d+)/), perfect: num(/PERFECT\n(\d+)/), good: num(/GOOD\n(\d+)/), ok: num(/OK\n(\d+)/), miss: num(/MISS\n(\d+)/), mode: t.match(/MODE\n([^\n]+)/)?.[1] };
  };
  const start = async (mode) => { await sel('Two Hand Study').getByRole('button', { name: mode, exact: true }).click(); await settle(1500); };
  const openOverlay = async () => { await page().keyboard.press('Escape'); await page().waitForSelector('#game-overlay-title'); await settle(300); };
  const closeOverlay = async () => { await page().getByRole('button', { name: 'Resume' }).click(); await settle(300); await page().locator('canvas').first().click({ position: { x: 640, y: 250 } }); };
  const assignmentState = () => page().$$eval('.track-row', (rows) => rows.map((r) => `${r.querySelector('strong').textContent}=${r.querySelector('select').selectedOptions[0].textContent} (${r.querySelector('span').textContent})`));
  const handState = () => page().$$eval('.session-toolbar .session-chip-group:nth-child(2) button', (b) => b.find((x) => x.className.includes('primary'))?.textContent);
  const finish = async (limit = 30) => { for (let i = 0; i < limit; i++) { if ((await text(page())).includes('FINAL SCORE')) return true; await settle(1000); } return false; };
  const playSeq = async (keys) => {
    const log = [];
    for (const k of keys) {
      const s = await hud(); let hit = false;
      for (let i = 0; i < 60 && !hit; i++) {
        await page().keyboard.down(k); await settle(60); await page().keyboard.up(k); await settle(110);
        if ((await hud()) !== s) hit = true;
      }
      log.push(`${k}:${hit ? 'hit' : 'no-score'}`);
    }
    return log;
  };
  await start('Learn'); await openOverlay();
  console.log('A3 overlay assignments', JSON.stringify(await assignmentState()), 'hand', await handState());
  await page().locator('.session-toolbar').getByRole('button', { name: 'Right Hand', exact: true }).click(); await settle(800);
  console.log('A3 hand after choosing', await handState());
  await closeOverlay(); await page().keyboard.press('Space');
  const log = await playSeq(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyT']);
  console.log('A3 key log', JSON.stringify(log));
  check('A3 run finishes after the six right-hand keys', await finish(15));
  const r = await results();
  console.log('A3 results', JSON.stringify(r));
  check('A3 right hand: 6 judged notes, none missed', r.perfect + r.good + r.ok + r.miss === 6 && r.miss === 0, JSON.stringify(r));
  await page().screenshot({ path: path.join(profile, 'a3-results.png') });

  await toLibrary(); await start('Learn'); await openOverlay();
  console.log('A3 next session before change: hand', await handState(), 'assignments', JSON.stringify(await assignmentState()));
  await page().locator('.track-row').filter({ hasText: 'Melody' }).locator('select').selectOption({ label: 'Left Hand' }); await settle(900);
  const stored = dbRead((db) => db.prepare("SELECT track_assignments FROM songs WHERE title = 'Two Hand Study'").get()?.track_assignments);
  console.log('A3 stored after setting Melody to Left Hand', stored);
  await h.relaunch();
  await toLibrary();
  console.log('A3 library after relaunch', JSON.stringify(await titles()), JSON.stringify((await text(page())).slice(0, 400)));
  await start('Learn'); await openOverlay();
  const persisted = await assignmentState(); const hand = await handState();
  console.log('A3 after relaunch: assignments', JSON.stringify(persisted), 'hand', hand);
  check('A3 Melody=Left Hand survives relaunch', persisted.some((x) => x.startsWith('Melody=Left Hand')), JSON.stringify(persisted));
  check('A3 hand choice back to Both Hands after relaunch', hand === 'Both Hands', String(hand));
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy|polyphony/.test(e)).slice(0, 10)));
});
console.log(fails === 0 ? 'ALL CHECKS PASSED' : `${fails} CHECK(S) FAILED`);
