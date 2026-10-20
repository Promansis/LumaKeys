// Owed proof for PH-MUS-003 (Electron): custom fingerings are saved and re-opened while the
// hand filter, the loop and the track assignment vary, then survive a backup round trip.
// Part 1  (profile PROFILE): import "Two Hand Study", record every note's finger, then
//   T0  ignore the Accompaniment track and save a finger on a melody note (ignored-track view),
//   T1  put the track back (the app clears every saved fingering on an assignment change; the
//       row count before and after is recorded),
//   S1  Right Hand only view, S2 Left Hand only view, S3 loop of measure 2 with both hands,
//   S4 loop of measure 2 with Left Hand only, S5 full view: save one finger in each view,
//   then check the rows by note id, re-open the song from the library and read every note's
//   finger in the full, right-only, left-only and loop views.
//   Then Export Library through the save-dialog stub.
// Part 2  (profile PROFILE2, fresh): Import Library through the open-dialog stub, check the rows
//   and read every note's finger again, in the full view and in a loop view.
// Env: PROFILE and PROFILE2 (empty dirs under $TMPDIR), LK_SQLITE_MODULE (Electron-ABI
//   better-sqlite3), FIX_TWO (Two Hand Study.mid from ../browser/midi-fixtures.mjs
//   writeTwoTrackFixture). Run from $TMPDIR/pw next to the Playwright install.
// The note positions are computed by GameSession (on the song filtered by hand, as GameScreen
// does) in a helper written to PROFILE and run with
// `node --import tsx` from the repository root (as scripts/audit/note-positions.ts does).
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const Database = createRequire(path.join(REPO, 'package.json'))('better-sqlite3');
const profile = process.env.PROFILE;
const profile2 = process.env.PROFILE2;
const FIX = process.env.FIX_TWO;
const TITLE = 'Two Hand Study';
fs.mkdirSync(profile, { recursive: true });
const shots = path.join(profile, 'shots');
fs.mkdirSync(shots, { recursive: true });

// ---- note positions from GameSession, one set per view ----
const gen = path.join(profile, 'positions.ts');
fs.writeFileSync(gen, `
import { readFileSync } from 'node:fs';
import { GameSession } from ${JSON.stringify(path.join(REPO, 'src/lib/game/GameSession'))};
import { filterSongByHand } from ${JSON.stringify(path.join(REPO, 'src/lib/game/songUtils'))};
import { parseMidiFile } from ${JSON.stringify(path.join(REPO, 'src/lib/midi/midiFileParser'))};
const bytes = readFileSync(process.argv[2]);
const song = parseMidiFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), { songId: 's', title: 's' });
const base = { mode: 'learning', tempoMultiplier: 1, handFilter: 'both', loopRange: null, waitForInput: true, metronomeEnabled: false, handSize: 'medium', fingeringDisplayMode: 'learning-only', pitchBendEnabled: true, latencyCompMs: 0, hitWindowMs: 100, beatsVisible: 8, leadInBeats: 0 };
const views = { full: {}, right: { handFilter: 'right' }, left: { handFilter: 'left' }, loop2: { loopRange: { startMeasure: 1, endMeasure: 1 } }, loop2left: { handFilter: 'left', loopRange: { startMeasure: 1, endMeasure: 1 } } };
const out = {};
for (const [name, extra] of Object.entries(views)) {
  const s = new GameSession(filterSongByHand(song, (extra as any).handFilter ?? 'both'), { ...base, ...extra } as never);
  out[name] = s.getSnapshot(0).visibleNotes.map((n) => ({ id: n.id, label: n.label, hand: n.hand, scheduledIndex: n.scheduledIndex, x: n.xRatio, w: n.widthRatio, top: n.topRatio, h: n.heightRatio }));
}
console.log(JSON.stringify(out));
`);
const gp = spawnSync(process.execPath, ['--import', 'tsx', gen, FIX], { cwd: REPO, encoding: 'utf8' });
if (gp.status !== 0) throw new Error('positions failed: ' + gp.stderr);
const POS = JSON.parse(gp.stdout);
fs.writeFileSync(path.join(profile, 'positions.json'), JSON.stringify(POS));
const noteById = (view, id) => POS[view].find((n) => n.id === id);
const fullNotes = POS.full;

let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
const bridge = (page, m, args = []) => page.evaluate(([m, a]) => window.appBridge[m](...a).then((r) => r, (e) => ({ error: String(e) })), [m, args]);
const rowsOf = (userData) => {
  const db = new Database(path.join(userData, 'lumakeys.db'), { readonly: true, fileMustExist: true });
  try { return db.prepare('SELECT note_id AS noteId, note_index AS noteIndex, finger, hand FROM fingerings ORDER BY note_id').all(); } finally { db.close(); }
};
const summ = (rows) => rows.map((r) => `${r.noteId}:${r.hand[0]}${r.finger}`).join(' ');

// ---- UI helpers ----
const sel = (page, title) => page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: new RegExp(`^${title}$`) }) });
const toLibrary = async (page) => {
  await page.waitForTimeout(2200);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) { await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForTimeout(600); }
  if (!/Your Library/i.test(await text(page))) {
    if (!(await page.getByRole('button', { name: 'Play Songs', exact: true }).count())) {
      if (!(await page.locator('#game-overlay-title').count()) && !/FINAL SCORE/.test(await text(page))) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
      await page.getByRole('button', { name: /^(Main Menu|Back to Main Menu|Back to Library)$/ }).filter({ visible: true }).first().click(); await page.waitForTimeout(800);
    }
    if (!/Your Library/i.test(await text(page))) await page.getByRole('button', { name: 'Play Songs', exact: true }).click();
  }
  await page.waitForSelector('h1:has-text("Your Library")'); await page.waitForTimeout(700);
};
const learn = async (page) => {
  await sel(page, TITLE).getByRole('button', { name: 'Learn', exact: true }).click(); await page.waitForTimeout(1500);
  await page.evaluate(() => { window.confirm = () => true; document.activeElement?.blur(); });
};
const overlay = async (page) => { if (!(await page.locator('#game-overlay-title').count())) { await page.keyboard.press('Escape'); await page.waitForSelector('#game-overlay-title'); await page.waitForTimeout(300); } };
const resume = async (page) => { await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.waitForTimeout(500); };
const hand = async (page, name) => { await page.locator('.session-toolbar').getByRole('button', { name, exact: true }).click(); await page.waitForTimeout(800); };
const setLoop = async (page, m) => {
  await page.getByLabel('Loop start measure').fill(String(m)); await page.getByLabel('Loop end measure').fill(String(m));
  await page.getByRole('button', { name: 'Set Loop', exact: true }).click(); await page.waitForTimeout(800);
};
const clearLoop = async (page) => { const b = page.getByRole('button', { name: 'Clear Loop', exact: true }); if (await b.count()) { await b.click(); await page.waitForTimeout(800); } };
const editOn = async (page) => {
  const b = page.getByRole('button', { name: 'Edit Fingering', exact: true });
  if (!/primary/.test((await b.getAttribute('class')) ?? '')) { await b.click(); await page.waitForTimeout(300); }
};
const assignment = async (page, track, label) => { await page.locator('.track-row').filter({ hasText: track }).locator('select').selectOption({ label }); await page.waitForTimeout(1200); };
const assignState = (page) => page.$$eval('.track-row', (rows) => rows.map((r) => `${r.querySelector('strong').textContent}=${r.querySelector('select').selectedOptions[0].textContent}`).join(', '));
const clickNote = async (page, view, id) => {
  const note = noteById(view, id);
  if (!note) return { id, missing: true };
  const rect = await page.locator('.canvas-shell').boundingBox();
  const w = Math.max(rect.width * note.w * 0.92, 12);
  const hgt = Math.max(note.h * rect.height, 14);
  await page.mouse.click(rect.x + note.x * rect.width + w / 2, rect.y + note.top * rect.height + hgt / 2);
  await page.waitForTimeout(350);
  const popup = page.locator('.fingering-editor-popup');
  if (!(await popup.count())) return { id, popup: null };
  const label = (await popup.locator('h2').innerText()).trim();
  const m = (await popup.locator('.panel-copy').innerText()).match(/(\w+) hand · current (\S+)/);
  return { id, label, hand: m?.[1], finger: m?.[2] === 'auto' ? null : Number(m?.[2]), expectedLabel: note.label };
};
const closePopup = async (page) => { const c = page.locator('.fingering-editor-popup').getByRole('button', { name: 'Close' }); if (await c.count()) { await c.click(); await page.waitForTimeout(200); } };
// Read every visible note's finger in the current view (edit mode on, canvas ready).
const readView = async (page, view) => {
  const out = {};
  for (const n of POS[view]) { const r = await clickNote(page, view, n.id); out[n.id] = r.finger ?? null; if (r.label !== n.label) out[n.id] = `MISCLICK(${r.label ?? 'none'})`; await closePopup(page); }
  return out;
};
const saveFinger = async (page, view, id, finger) => {
  const r = await clickNote(page, view, id);
  if (r.label !== noteById(view, id).label) return { ok: false, r };
  await page.locator('.fingering-editor-buttons').getByRole('button', { name: String(finger), exact: true }).click(); await page.waitForTimeout(600);
  await closePopup(page);
  return { ok: true, r };
};
const gotoView = async (page, { h = 'Both Hands', loop = null } = {}) => {
  await overlay(page);
  await clearLoop(page);
  await hand(page, h);
  if (loop) await setLoop(page, loop);
  await editOn(page);
  await resume(page);
};

const FIRST = {}; // finger shown per note before any edit
const WANT = {};  // finger saved per note id
const MEL = (k) => `track-0-note-${k}`;
const ACC = (k) => `track-1-note-${k}`;
const pickDifferent = (base) => (base === 5 ? 4 : 5);

let backupPath;
await withElectron(profile, async (h) => {
  const { page } = h;
  console.log('ELECTRON', await h.app.evaluate(() => process.versions.electron));
  await page.waitForTimeout(2300);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await bridge(page, 'setSetting', ['gameplay', 'leadInBeats', '0']);
  await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(800);
  await h.stubOpen([FIX]);
  await page.getByRole('button', { name: 'Upload MIDI', exact: true }).click(); await page.waitForTimeout(2000);
  const song = (await bridge(page, 'getAllSongs')).find((s) => s.title === TITLE);
  console.log('import', song?.id?.slice(0, 12), JSON.stringify(song?.trackAssignments));

  await learn(page); await overlay(page);
  console.log('track assignments', await assignState(page), '');
  await editOn(page); await resume(page);
  Object.assign(FIRST, await readView(page, 'full'));
  console.log('FIRST fingers (full view)', JSON.stringify(FIRST));
  check('baseline: all 12 notes selectable and labelled right', Object.values(FIRST).every((v) => typeof v === 'number'), JSON.stringify(FIRST));

  // T0 / T1: ignored-track view, then restore
  await overlay(page);
  await assignment(page, 'Accompaniment', 'Ignore');
  console.log('T0 assignments', await assignState(page), 'notes in view', POS.right.length);
  await overlay(page); await editOn(page); await resume(page);
  const t0 = await saveFinger(page, 'right', MEL(1), pickDifferent(FIRST[MEL(1)]));
  check('T0: finger saved on melody note 1 with Accompaniment ignored', t0.ok, JSON.stringify(t0.r));
  const t0rows = rowsOf(h.userData);
  console.log('T0 rows', summ(t0rows));
  await overlay(page);
  await assignment(page, 'Accompaniment', 'Left Hand');
  const t1rows = rowsOf(h.userData);
  console.log('T1 rows after Accompaniment back to Left Hand', JSON.stringify(summ(t1rows)), 'assignments', await assignState(page));
  console.log('T1 cleared by an assignment change:', t0rows.length > 0 && t1rows.length === 0);
  await resume(page);

  // S1..S5
  const plan = [
    ['S1 right-only', 'right', { h: 'Right Hand' }, MEL(3)],
    ['S2 left-only', 'left', { h: 'Left Hand' }, ACC(4)],
    ['S3 loop m2 both hands', 'loop2', { h: 'Both Hands', loop: 2 }, MEL(5)],
    ['S4 loop m2 left-only', 'loop2left', { h: 'Left Hand', loop: 2 }, ACC(5)],
    ['S5 full both hands', 'full', { h: 'Both Hands' }, ACC(0)],
  ];
  for (const [name, view, cfg, id] of plan) {
    await gotoView(page, cfg);
    const idx = noteById(view, id).scheduledIndex;
    const fullIdx = noteById('full', id).scheduledIndex;
    const f = pickDifferent(FIRST[id]);
    const r = await saveFinger(page, view, id, f);
    WANT[id] = f;
    console.log(`${name}: hand ${cfg.h}${cfg.loop ? ', loop measure ' + cfg.loop : ''}, view scheduledIndex ${idx} (full ${fullIdx}) note ${id} ${noteById(view, id).label} saved ${f}`);
    check(`${name}: finger saved on ${id}`, r.ok, JSON.stringify(r.r));
    const rows = rowsOf(h.userData);
    const row = rows.find((x) => x.noteId === id);
    check(`${name}: row stored by note id, not view index`, !!row && row.finger === f && row.noteIndex === -1, JSON.stringify(row));
  }
  check('rows after S1-S5: five rows, one per saved note', rowsOf(h.userData).length === 5, summ(rowsOf(h.userData)));
  console.log('rows', summ(rowsOf(h.userData)));

  // re-open from the library and read every view
  await toLibrary(page); await learn(page); await overlay(page); await editOn(page); await resume(page);
  const reFull = await readView(page, 'full');
  console.log('RE-OPEN full view', JSON.stringify(reFull));
  const wantFull = { ...FIRST, ...WANT };
  const diffFull = Object.keys(wantFull).filter((k) => reFull[k] !== wantFull[k]);
  check('re-open full view: edited notes show their fingers, every other note unchanged', diffFull.length === 0, `mismatches ${JSON.stringify(diffFull.map((k) => [k, reFull[k], wantFull[k]]))}`);
  await page.screenshot({ path: path.join(shots, 'reopen-full.png') });
  for (const [view, cfg] of [['right', { h: 'Right Hand' }], ['left', { h: 'Left Hand' }], ['loop2', { h: 'Both Hands', loop: 2 }], ['loop2left', { h: 'Left Hand', loop: 2 }]]) {
    await gotoView(page, cfg);
    const got = await readView(page, view);
    const bad = Object.keys(got).filter((id) => id in WANT && got[id] !== WANT[id]);
    const mis = Object.keys(got).filter((id) => String(got[id]).startsWith('MISCLICK'));
    console.log(`RE-OPEN ${view}`, JSON.stringify(got));
    check(`re-open ${view} view: saved notes in view show their saved finger`, bad.length === 0 && mis.length === 0, `bad ${JSON.stringify(bad)} misclick ${JSON.stringify(mis)}`);
  }
  await gotoView(page, { h: 'Both Hands' });

  // export
  await toLibrary(page);
  backupPath = path.join(profile, 'backup.json');
  await h.stubSave(backupPath);
  await page.getByRole('button', { name: 'Export Library' }).click(); await page.waitForTimeout(1500);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  console.log('EXPORT keys', Object.keys(backup).join(','), 'fingerings', JSON.stringify(backup.fingerings));
  check('export holds the five fingerings with note ids', backup.fingerings?.length === 5 && backup.fingerings.every((f) => f.noteId), summ(backup.fingerings ?? []));
  fs.writeFileSync(path.join(profile, 'summary.json'), JSON.stringify({ FIRST, WANT, songId: song.id }));
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy|polyphony/.test(e)).slice(0, 10)));
});
const { songId } = JSON.parse(fs.readFileSync(path.join(profile, 'summary.json'), 'utf8'));
const rows1 = rowsOf(path.join(profile, '.config', 'lumakeys'));

// ---- Part 2: fresh profile, restore ----
fs.mkdirSync(profile2, { recursive: true });
await withElectron(profile2, async (h) => {
  const { page } = h;
  await toLibrary(page);
  console.log('PART2 fresh profile: songs', (await bridge(page, 'getAllSongs')).length, 'fingering rows', rowsOf(h.userData).length);
  await h.stubOpen([backupPath]);
  await page.getByRole('button', { name: 'Import Library' }).click(); await page.waitForTimeout(2200);
  const songs = await bridge(page, 'getAllSongs');
  console.log('PART2 restored songs', JSON.stringify(songs.map((s) => [s.id.slice(0, 12), s.title])));
  check('restore: song comes back with the same id', songs.some((s) => s.id === songId), '');
  const rows2 = rowsOf(h.userData);
  check('restore: fingering rows equal the source profile rows (note id, hand, finger)', summ(rows2) === summ(rows1) && rows2.length === 5, `${summ(rows2)} vs ${summ(rows1)}`);
  await bridge(page, 'setSetting', ['gameplay', 'leadInBeats', '0']);
  await toLibrary(page); await learn(page); await overlay(page); await editOn(page); await resume(page);
  const reFull = await readView(page, 'full');
  const wantFull = { ...FIRST, ...WANT };
  const diff = Object.keys(wantFull).filter((k) => reFull[k] !== wantFull[k]);
  console.log('PART2 full view', JSON.stringify(reFull));
  check('restore: every note shows the same finger as before the backup, on the same note', diff.length === 0, `mismatches ${JSON.stringify(diff.map((k) => [k, reFull[k], wantFull[k]]))}`);
  await page.screenshot({ path: path.join(shots, 'restored-full.png') });
  await gotoView(page, { h: 'Both Hands', loop: 2 });
  const lg = await readView(page, 'loop2');
  const bad = Object.keys(lg).filter((id) => id in WANT && lg[id] !== WANT[id]);
  check('restore: loop of measure 2 shows the saved finger on its notes', bad.length === 0, JSON.stringify(lg));
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy|polyphony/.test(e)).slice(0, 10)));
});
console.log(fails === 0 ? 'ALL CHECKS PASSED' : `${fails} CHECK(S) FAILED`);
console.log('DONE');
