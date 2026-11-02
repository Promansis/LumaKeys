// WF-007: browse, search, filter, sort, edit, organize (folders, playlists), and bulk-manage the library.
// Web runtime. Oracle: the library rows from the bridge (getAllSongs and friends), the SQLite file, and the
// midi-files directory. Every mutation is followed by a full page reload and a state comparison.
//
// Run: DATA=$TMPDIR/p11/FB/data-wf007 FIX=$TMPDIR/p11/FB/fx-lib PORT=3785 node library-organize-bulk.mjs
import { withServer, text } from './harness.mjs';
import { writeLibraryFixtures } from './midi-fixtures.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/media/storage/LumaKeys/package.json');
const Database = require('better-sqlite3');

const data = process.env.DATA;
const fix = process.env.FIX;
const port = Number(process.env.PORT || 3785);
const shots = process.env.SHOTS || path.join(data, 'shots');
fs.mkdirSync(shots, { recursive: true });
fs.rmSync(data, { recursive: true, force: true });

const rpc = (base, m, args = []) => fetch(`${base}/api/bridge/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }).then((r) => r.json()).then((j) => ('result' in j ? j.result : j));
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function walk(dir, rel = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) out.push(r + '/', ...walk(path.join(dir, e.name), r)); else out.push(r);
  }
  return out;
}

const fixtures = writeLibraryFixtures(fix);

await withServer(data, async ({ page, base, errors }) => {
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await d.dismiss(); });
  const sel = (title) => page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: new RegExp('^' + title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) });
  const titles = () => page.$$eval('article.song-card h2.song-card-title', (e) => e.map((x) => x.textContent));
  const settle = (ms = 600) => page.waitForTimeout(ms);
  const gotoLibrary = async () => {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(page)).includes('FIRST PRACTICE SETUP')) await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.getByRole('button', { name: 'Play Songs', exact: true }).click();
    await page.waitForSelector('h1:has-text("Your Library")');
    await settle(800);
  };
  const status = async () => (await page.locator('.library-header .song-title').first().textContent())?.trim();
  const clearAll = async () => {
    await page.locator('input[type=search]').fill('');
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByRole('button', { name: 'All Songs', exact: true }).click();
    await page.locator('.search-bar select').nth(0).selectOption('date');
    await page.locator('.search-bar select').nth(1).selectOption('desc');
    await settle(300);
  };
  const dbRead = (fn) => {
    const db = new Database(path.join(data, 'lumakeys.db'), { readonly: true, fileMustExist: true });
    try { return fn(db); } finally { db.close(); }
  };
  // Invariant: files on disk == songs in DB (both directions), and no staging leftovers.
  const storageAgrees = async (label) => {
    const songs = await rpc(base, 'getAllSongs');
    const dbIds = dbRead((db) => db.prepare('SELECT id FROM songs').all().map((r) => r.id)).sort();
    const rpcIds = songs.map((s) => s.id).sort();
    const files = walk(path.join(data, 'midi-files'));
    const mids = files.filter((f) => f.endsWith('.mid')).map((f) => f.replace(/\.mid$/, '')).sort();
    const staging = files.filter((f) => f.startsWith('.'));
    const orphanFiles = mids.filter((id) => !dbIds.includes(id));
    const missingFiles = dbIds.filter((id) => !mids.includes(id));
    check(`storage ${label}`, eq(dbIds, rpcIds) && orphanFiles.length === 0 && missingFiles.length === 0 && staging.length === 0,
      `db=${dbIds.length} rpc=${rpcIds.length} files=${mids.length} orphanFiles=${orphanFiles.length} missingFiles=${missingFiles.length} staging=${JSON.stringify(staging)}`);
    return songs;
  };
  const rowsOf = (songs) => Object.fromEntries(songs.map((s) => [s.title, s]));

  // ---------- 1. Import through the UI ----------
  await gotoLibrary();
  console.log('empty library status:', JSON.stringify(await status()));
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Upload MIDI / MSCZ' }).click()]);
  await fc.setFiles(fixtures.map((f) => f.file));
  await settle(2500);
  console.log('after import status:', JSON.stringify(await status()));
  let songs = await storageAgrees('after import');
  let byTitle = rowsOf(songs);
  check('5 songs imported', songs.length === 5, `titles=${JSON.stringify(songs.map((s) => s.title))}`);
  for (const f of fixtures) {
    const s = byTitle[f.title];
    check(`metadata ${f.title}`, s && Math.round(s.bpm) === f.bpm && Math.abs(s.durationSec - f.durationSec) < 1.5 && s.noteCount === f.noteCount,
      s ? `bpm=${s.bpm} dur=${s.durationSec.toFixed(1)} (want ${f.durationSec.toFixed(1)}) notes=${s.noteCount} difficulty=${s.difficulty}` : 'missing');
  }
  console.log('difficulties:', JSON.stringify(songs.map((s) => [s.title, s.difficulty])));
  console.log('metadata editor open right after import:', (await page.locator('.metadata-editor').count()) > 0, 'for', JSON.stringify(await page.locator('.metadata-editor h2').allTextContents()));
  await page.screenshot({ path: `${shots}/01-imported.png` });
  await page.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});

  // ---------- 2. Search ----------
  const allTitles = songs.map((s) => s.title);
  const search = page.locator('input[type=search]');
  await search.fill('alpha'); await settle(300);
  check('search "alpha"', eq(await titles(), ['Alpha Waltz']), JSON.stringify(await titles()));
  await search.fill('ETUDE'); await settle(300);
  check('search is case-insensitive', eq(await titles(), ['charlie etude']), JSON.stringify(await titles()));
  await search.fill('  march  '); await settle(300);
  check('search trims whitespace', eq(await titles(), ['Bravo March']), JSON.stringify(await titles()));
  await search.fill('zzzz'); await settle(300);
  check('search no match shows empty state', (await titles()).length === 0 && (await text(page)).includes('Widen the filter'), '');
  await search.fill('a'); await settle(300);
  check('search substring "a"', eq((await titles()).sort(), allTitles.filter((t) => t.toLowerCase().includes('a')).sort()), JSON.stringify(await titles()));
  await search.fill(''); await settle(300);

  // ---------- 3. Sort ----------
  const sortSel = page.locator('.search-bar select').nth(0);
  const dirSel = page.locator('.search-bar select').nth(1);
  const expectTitleAsc = [...allTitles].sort((a, b) => a.localeCompare(b));
  await sortSel.selectOption('title'); await dirSel.selectOption('asc'); await settle(300);
  check('sort title asc (case-insensitive locale order)', eq(await titles(), expectTitleAsc), JSON.stringify(await titles()));
  await dirSel.selectOption('desc'); await settle(300);
  check('sort title desc', eq(await titles(), [...expectTitleAsc].reverse()), JSON.stringify(await titles()));
  await sortSel.selectOption('difficulty'); await dirSel.selectOption('asc'); await settle(300);
  {
    const order = await titles();
    const diffs = order.map((t) => byTitle[t].difficulty);
    check('sort difficulty asc is non-decreasing', diffs.every((d, i) => i === 0 || diffs[i - 1] <= d), JSON.stringify(order.map((t) => [t, byTitle[t].difficulty])));
  }
  await dirSel.selectOption('desc'); await settle(300);
  {
    const diffs = (await titles()).map((t) => byTitle[t].difficulty);
    check('sort difficulty desc is non-increasing', diffs.every((d, i) => i === 0 || diffs[i - 1] >= d), JSON.stringify(diffs));
  }
  await sortSel.selectOption('date'); await dirSel.selectOption('desc'); await settle(300);
  {
    const order = await titles();
    const times = order.map((t) => new Date(byTitle[t].dateAdded).getTime());
    check('sort date added desc', times.every((v, i) => i === 0 || times[i - 1] >= v), JSON.stringify(order.map((t) => byTitle[t].dateAdded)));
  }
  const sortOptions = await sortSel.locator('option').allTextContents();
  console.log('sort options:', JSON.stringify(sortOptions));

  // ---------- 4. Difficulty chips ----------
  check('fixtures span easy, medium, and hard', [(d) => d <= 3, (d) => d >= 4 && d <= 6, (d) => d >= 7].every((t) => songs.some((s) => t(s.difficulty))), JSON.stringify(songs.map((s) => [s.title, s.difficulty])));
  await dirSel.selectOption('desc');
  for (const [label, test] of [['Easy', (d) => d <= 3], ['Medium', (d) => d >= 4 && d <= 6], ['Hard', (d) => d >= 7], ['All', () => true]]) {
    await page.locator('section.filter-chips').last().getByRole('button', { name: label, exact: true }).click(); await settle(250);
    check(`difficulty chip ${label}`, eq((await titles()).sort(), songs.filter((s) => test(s.difficulty)).map((s) => s.title).sort()), JSON.stringify(await titles()));
  }

  // ---------- 5. Advanced filters ----------
  await page.getByRole('button', { name: 'Show Filters' }).click(); await settle(200);
  const adv = (label) => page.locator('.advanced-filters-grid label').filter({ hasText: label }).locator('input,select');
  await adv('Duration Min').fill('30'); await settle(250);
  check('duration min 30', eq((await titles()).sort(), songs.filter((s) => s.durationSec >= 30).map((s) => s.title).sort()), JSON.stringify(await titles()));
  await adv('Duration Max').fill('100'); await settle(250);
  check('duration 30..100', eq((await titles()).sort(), songs.filter((s) => s.durationSec >= 30 && s.durationSec <= 100).map((s) => s.title).sort()), JSON.stringify(await titles()));
  await adv('Duration Min').fill(''); await adv('Duration Max').fill('10'); await settle(250);
  check('duration max 10', eq((await titles()).sort(), songs.filter((s) => s.durationSec <= 10).map((s) => s.title).sort()), JSON.stringify(await titles()));
  await page.getByRole('button', { name: 'Clear', exact: true }).click(); await settle(250);
  check('Clear resets duration filter', (await titles()).length === 5, JSON.stringify(await titles()));
  // date filters: today is inside, tomorrow is outside
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await adv('Date Added From').fill(tomorrow); await settle(250);
  check('date from tomorrow -> none', (await titles()).length === 0, '');
  await adv('Date Added From').fill(today); await settle(250);
  check('date from today -> all (start of day)', (await titles()).length === 5, JSON.stringify((await titles()).length));
  await adv('Date Added To').fill(yesterday); await settle(250);
  check('date to yesterday -> none', (await titles()).length === 0, '');
  await adv('Date Added To').fill(today); await settle(250);
  check('date to today -> all (end of day)', (await titles()).length === 5, `${(await titles()).length} (UTC date ${today}, local ${new Date().toString().slice(0, 24)})`);
  await page.getByRole('button', { name: 'Clear', exact: true }).click(); await settle(250);
  // Play one song through the product API so played/score filters have data.
  const played = byTitle['Delta Scale'];
  await rpc(base, 'saveGameResult', [{ songId: played.id, score: 9000, accuracy: 95, maxCombo: 4, perfectHits: 4, goodHits: 0, okHits: 0, misses: 0, tempo: 100, mode: 'luma-keys', durationSec: 2, measureAccuracy: [] }]);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await settle(800);
  const stats = await rpc(base, 'getUserStats', [played.id]);
  console.log('stats for played song:', JSON.stringify({ bestScore: stats?.bestScore, bestAccuracy: stats?.bestAccuracy }));
  await adv('Played State').selectOption('played'); await settle(250);
  check('played state = played', eq(await titles(), ['Delta Scale']), JSON.stringify(await titles()));
  await adv('Played State').selectOption('unplayed'); await settle(250);
  check('played state = unplayed', eq((await titles()).sort(), allTitles.filter((t) => t !== 'Delta Scale').sort()), JSON.stringify(await titles()));
  await adv('Played State').selectOption('all');
  await adv('Best Score Min').fill('90'); await settle(250);
  check('best score min 90 (compares bestAccuracy)', eq(await titles(), ['Delta Scale']), JSON.stringify(await titles()));
  await adv('Best Score Min').fill(''); await adv('Best Score Max').fill('50'); await settle(250);
  check('best score max 50 keeps unplayed (0) songs', (await titles()).length === 4 && !(await titles()).includes('Delta Scale'), JSON.stringify(await titles()));
  await page.getByRole('button', { name: 'Clear', exact: true }).click(); await settle(250);
  // result-based sorts: Delta Scale is the only song with a result, so it must lead when sorted high-to-low
  await page.getByRole('button', { name: 'Clear', exact: true }).click(); await settle(200);
  for (const [value, label] of [['score', 'Best Score'], ['plays', 'Times Played'], ['lastPlayed', 'Last Played']]) {
    await sortSel.selectOption(value); await dirSel.selectOption('desc'); await settle(250);
    const first = (await titles())[0];
    check(`sort ${label} desc puts the only played song first`, first === 'Delta Scale', JSON.stringify(await titles()));
  }
  await sortSel.selectOption('date'); await dirSel.selectOption('desc'); await settle(200);
  // presets
  const preset = (label) => page.locator('.filter-presets').getByRole('button', { name: label, exact: true });
  await preset('Quick (< 3 min)').click(); await settle(250);
  check('preset Quick (< 3 min)', eq((await titles()).sort(), songs.filter((s) => s.durationSec <= 180).map((s) => s.title).sort()), JSON.stringify(await titles()));
  await preset('Unplayed').click(); await settle(250);
  check('preset Unplayed', (await titles()).length === 4, JSON.stringify(await titles()));
  await preset('High Score').click(); await settle(250);
  check('preset High Score', eq(await titles(), ['Delta Scale']), JSON.stringify(await titles()));
  await preset('Hard').click(); await settle(250);
  check('preset Hard', eq((await titles()).sort(), songs.filter((s) => s.difficulty >= 7).map((s) => s.title).sort()), JSON.stringify(await titles()));
  // user preset persistence across reload
  await preset('Quick (< 3 min)').click();
  await page.locator('.preset-name-input').fill('My Quick'); await page.getByRole('button', { name: 'Save Filters' }).click(); await settle(200);
  await clearAll();

  // ---------- 6. Metadata edit ----------
  await sel('Bravo March').getByRole('button', { name: 'More' }).click(); await settle(200);
  await sel('Bravo March').getByRole('button', { name: 'Edit Metadata' }).click(); await settle(300);
  const ed = page.locator('.metadata-editor');
  const fieldInput = (label) => ed.locator('label').filter({ hasText: new RegExp('^' + label) }).locator('input').first();
  await fieldInput('Title').fill('Bravo March (edited)');
  await fieldInput('Artist').fill('J. Sousa');
  await fieldInput('Genre').fill('March');
  await ed.locator('input[type=range]').focus();
  await page.keyboard.press('Home'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); // difficulty 3
  const tagInput = ed.locator('.tag-chip-editor input');
  await tagInput.fill('brass'); await tagInput.press('Enter'); await tagInput.fill('parade'); await tagInput.press(',');
  await page.screenshot({ path: `${shots}/02-editor.png` });
  await ed.getByRole('button', { name: 'Save Metadata' }).click(); await settle(700);
  console.log('after save status:', JSON.stringify(await status()));
  songs = await rpc(base, 'getAllSongs'); byTitle = rowsOf(songs);
  const edited = byTitle['Bravo March (edited)'];
  check('metadata saved (rpc)', edited && edited.artist === 'J. Sousa' && edited.genre === 'March' && edited.difficulty === 3 && eq([...edited.tags].sort(), ['brass', 'parade']), JSON.stringify(edited && [edited.title, edited.artist, edited.genre, edited.difficulty, edited.tags]));
  await gotoLibrary();
  songs = await storageAgrees('after metadata edit + reload'); byTitle = rowsOf(songs);
  check('metadata visible after reload', (await titles()).includes('Bravo March (edited)'), JSON.stringify(await titles()));
  check('user preset survives reload', (await page.locator('.user-preset-chip').allTextContents()).join('|').includes('My Quick'), JSON.stringify(await page.locator('.user-preset-chip').allTextContents()));
  const allTitles2 = songs.map((s) => s.title);
  for (const [q, want] of [['sousa', ['Bravo March (edited)']], ['march', ['Bravo March (edited)']], ['parade', ['Bravo March (edited)']]]) {
    await search.fill(q); await settle(250);
    check(`search by ${q} (artist/genre/tag)`, eq(await titles(), want), JSON.stringify(await titles()));
  }
  await search.fill('');
  await sel('Bravo March (edited)').locator('.tag-chip-label', { hasText: 'brass' }).click(); await settle(250);
  check('tag chip click filters', eq(await titles(), ['Bravo March (edited)']), JSON.stringify(await titles()));
  await page.getByRole('button', { name: 'Clear', exact: true }).click(); await settle(250);
  check('Clear also clears tag filter', (await titles()).length === 5, JSON.stringify(await titles()));
  // empty title save keeps old title
  await sel('Delta Scale').getByRole('button', { name: 'More' }).click();
  await sel('Delta Scale').getByRole('button', { name: 'Edit Metadata' }).click(); await settle(300);
  await fieldInput('Title').fill('   ');
  await ed.getByRole('button', { name: 'Save Metadata' }).click(); await settle(600);
  check('blank title falls back to previous title', (await rpc(base, 'getAllSongs')).some((s) => s.title === 'Delta Scale'), JSON.stringify((await rpc(base, 'getAllSongs')).map((s) => s.title)));
  await ed.getByRole('button', { name: 'Close' }).click();
  // favorite
  await sel('Alpha Waltz').getByRole('button', { name: 'More' }).click();
  await sel('Alpha Waltz').getByRole('button', { name: 'Mark Favorite' }).click(); await settle(500);
  await gotoLibrary();
  await page.getByRole('button', { name: 'Favorites', exact: true }).click(); await settle(300);
  check('favorite persisted and listed in Favorites', eq(await titles(), ['Alpha Waltz']), JSON.stringify(await titles()));
  await page.getByRole('button', { name: 'All Songs', exact: true }).click();

  // ---------- 7. Folders ----------
  const sidebar = page.locator('aside.library-sidebar');
  const addFolder = async (name) => { await sidebar.locator('#library-sidebar-folders .sidebar-create-row input').fill(name); await sidebar.locator('#library-sidebar-folders .sidebar-create-row button').click(); await settle(500); };
  await addFolder('Marches'); await addFolder('Etudes'); await addFolder('   ');
  let folders = await rpc(base, 'getAllFolders');
  check('folders created, blank name ignored', eq(folders.map((f) => f.name), ['Marches', 'Etudes']), JSON.stringify(folders.map((f) => f.name)));
  // move into folder via bulk bar
  await sel('Bravo March (edited)').locator('input[type=checkbox]').check();
  await sel('Alpha Waltz').locator('input[type=checkbox]').check(); await settle(200);
  check('bulk bar shows selection count', (await page.locator('.bulk-action-bar h2').textContent()) === '2 selected', await page.locator('.bulk-action-bar h2').textContent());
  await page.locator('.bulk-action-bar label').filter({ hasText: 'Move to Folder' }).locator('select').selectOption({ label: 'Marches' }); await settle(700);
  console.log('after move status:', JSON.stringify(await status()));
  songs = await rpc(base, 'getAllSongs'); byTitle = rowsOf(songs);
  const marchesId = folders.find((f) => f.name === 'Marches').id;
  check('bulk move to folder (rpc)', byTitle['Bravo March (edited)'].folderId === marchesId && byTitle['Alpha Waltz'].folderId === marchesId && songs.filter((s) => s.folderId === marchesId).length === 2, '');
  check('selection cleared after move', (await page.locator('.bulk-action-bar').count()) === 0, '');
  await gotoLibrary();
  await page.getByRole('button', { name: 'Marches', exact: true }).click(); await settle(300);
  check('folder view lists moved songs after reload', eq((await titles()).sort(), ['Alpha Waltz', 'Bravo March (edited)']), JSON.stringify(await titles()));
  check('card folder label', (await sel('Alpha Waltz').locator('.song-card-folder').textContent()) === 'Marches', '');
  await page.getByRole('button', { name: 'All Songs', exact: true }).click();
  // rename
  await sidebar.locator('.sidebar-row').filter({ hasText: 'Marches' }).getByRole('button', { name: 'Rename' }).click();
  await sidebar.locator('.sidebar-row input').fill('Brass Marches');
  await sidebar.locator('.sidebar-row').getByRole('button', { name: 'Save' }).click(); await settle(500);
  await gotoLibrary();
  folders = await rpc(base, 'getAllFolders');
  check('folder rename persisted', folders.some((f) => f.name === 'Brass Marches') && !folders.some((f) => f.name === 'Marches'), JSON.stringify(folders.map((f) => f.name)));
  check('moved songs follow the rename', (await sel('Alpha Waltz').locator('.song-card-folder').textContent()) === 'Brass Marches', '');
  // move to Unfiled
  await sel('Alpha Waltz').locator('input[type=checkbox]').check();
  await page.locator('.bulk-action-bar label').filter({ hasText: 'Move to Folder' }).locator('select').selectOption({ label: 'Unfiled' }); await settle(600);
  check('bulk move to Unfiled', (await rpc(base, 'getAllSongs')).find((s) => s.title === 'Alpha Waltz').folderId === null, '');
  // delete a folder that holds a song
  dialogs.length = 0;
  await sidebar.locator('.sidebar-row').filter({ hasText: 'Brass Marches' }).getByRole('button', { name: 'Delete' }).click(); await settle(600);
  console.log('folder delete: dialogs shown =', JSON.stringify(dialogs), 'modal present =', (await page.locator('[role=dialog]').count()) > 0, 'status:', JSON.stringify(await status()));
  await gotoLibrary();
  songs = await storageAgrees('after folder delete'); byTitle = rowsOf(songs);
  check('folder delete keeps songs, unfiles them', songs.length === 5 && byTitle['Bravo March (edited)'].folderId === null && (await rpc(base, 'getAllFolders')).length === 1, `folders left=${JSON.stringify((await rpc(base, 'getAllFolders')).map((f) => f.name))}`);

  // ---------- 8. Playlists ----------
  const addPlaylist = async (name) => { await sidebar.locator('#library-sidebar-playlists .sidebar-create-row input').fill(name); await sidebar.locator('#library-sidebar-playlists .sidebar-create-row button').click(); await settle(600); };
  await addPlaylist('Set One');
  check('new playlist becomes active view', (await page.locator('.playlist-view').count()) === 1, '');
  await page.getByRole('button', { name: 'All Songs', exact: true }).click(); await settle(300);
  for (const t of ['charlie etude', 'Alpha Waltz', 'Foxtrot Epic']) await sel(t).locator('input[type=checkbox]').check(); // selection order differs from title/library order
  await page.locator('.bulk-action-bar label').filter({ hasText: 'Add to Playlist' }).locator('select').selectOption({ label: 'Set One' }); await settle(700);
  console.log('after add status:', JSON.stringify(await status()));
  let pl = (await rpc(base, 'getAllPlaylists'))[0];
  let plSongs = await rpc(base, 'getPlaylistSongs', [pl.id]);
  console.log('playlist order after bulk add (selected charlie, Alpha, Foxtrot):', JSON.stringify(plSongs.map((s) => s.title)));
  check('playlist has 3 songs', plSongs.length === 3, '');
  await gotoLibrary();
  await sidebar.locator('.sidebar-row').filter({ hasText: 'Set One' }).getByRole('button', { name: /Set One/ }).click(); await settle(500);
  const rowTitles = () => page.$$eval('.playlist-row strong', (e) => e.map((x) => x.textContent.replace(/^\d+\.\s*/, '')));
  check('playlist view order matches database order', eq(await rowTitles(), plSongs.map((s) => s.title)), JSON.stringify(await rowTitles()));
  // reorder: drag last row onto first row
  const before = await rowTitles();
  await page.locator('.playlist-row').nth(2).dragTo(page.locator('.playlist-row').nth(0)); await settle(700);
  const after = await rowTitles();
  const dbAfter = (await rpc(base, 'getPlaylistSongs', [pl.id])).map((s) => s.title);
  console.log('reorder drag row3 -> row1:', JSON.stringify(before), '->', JSON.stringify(after), 'db:', JSON.stringify(dbAfter));
  check('drag reorder moved last to first', eq(after, [before[2], before[0], before[1]]) && eq(after, dbAfter), '');
  await gotoLibrary();
  await sidebar.locator('.sidebar-row').filter({ hasText: 'Set One' }).getByRole('button', { name: /Set One/ }).click(); await settle(500);
  check('reorder persisted after reload', eq(await rowTitles(), dbAfter), JSON.stringify(await rowTitles()));
  // keyboard / button alternative to drag?
  const reorderButtons = await page.locator('.playlist-row button').allTextContents();
  console.log('playlist row buttons (any non-drag reorder control?):', JSON.stringify([...new Set(reorderButtons)]));
  // filters block reordering
  await search.fill('alpha'); await settle(250);
  check('reorder disabled while a search is active', (await text(page)).includes('Clear search and advanced filters to reorder this playlist.') && (await page.locator('.playlist-row[draggable=true]').count()) === 0, '');
  await search.fill(''); await settle(250);
  // remove one
  await page.locator('.playlist-row').filter({ hasText: 'Foxtrot Epic' }).getByRole('button', { name: 'Remove' }).click(); await settle(600);
  plSongs = await rpc(base, 'getPlaylistSongs', [pl.id]);
  check('remove from playlist', plSongs.length === 2 && !plSongs.some((s) => s.title === 'Foxtrot Epic') && (await rpc(base, 'getAllSongs')).length === 5, JSON.stringify(plSongs.map((s) => s.title)));
  // Play All starts the queue with the first song (the game HUD hides the title, so read it from the Escape overlay)
  const sessionTitle = async () => { await page.keyboard.press('Escape'); await settle(400); const t = await page.locator('#game-overlay-title').textContent().catch(() => null); await page.getByRole('button', { name: 'Resume' }).click().catch(() => {}); return t; };
  await page.getByRole('button', { name: 'Play All' }).click(); await settle(2000);
  const firstTitle = await sessionTitle();
  check('Play All starts the first playlist song', firstTitle === plSongs[0].title, `overlay title=${JSON.stringify(firstTitle)} want ${plSongs[0].title}`);
  await page.screenshot({ path: `${shots}/03-playall.png` });
  await gotoLibrary();
  // queue advance: a two-song playlist of the two shortest songs, played through without input
  await addPlaylist('Queue Test');
  await page.getByRole('button', { name: 'All Songs', exact: true }).click(); await settle(300);
  await sel('Delta Scale').locator('input[type=checkbox]').check();
  await sel('Bravo March (edited)').locator('input[type=checkbox]').check();
  await page.locator('.bulk-action-bar label').filter({ hasText: 'Add to Playlist' }).locator('select').selectOption({ label: 'Queue Test' }); await settle(600);
  const qPl = (await rpc(base, 'getAllPlaylists')).find((p) => p.name === 'Queue Test');
  const qSongs = await rpc(base, 'getPlaylistSongs', [qPl.id]);
  await sidebar.locator('.sidebar-row').filter({ hasText: 'Queue Test' }).getByRole('button', { name: /Queue Test/ }).click(); await settle(400);
  await page.getByRole('button', { name: 'Play All' }).click(); await settle(1500);
  await page.keyboard.press('Space');
  let res = false;
  for (let i = 0; i < 25 && !res; i++) { await page.waitForTimeout(1000); res = (await text(page)).includes('FINAL SCORE'); }
  const hasNext = res && (await page.getByRole('button', { name: 'Next Song' }).count()) > 0;
  console.log(`queue ${JSON.stringify(qSongs.map((x) => x.title))}: first run finished=${res}, Next Song offered=${hasNext}`);
  if (hasNext) {
    await page.getByRole('button', { name: 'Next Song' }).click(); await settle(1800);
    const second = await sessionTitle();
    check('Next Song loads the second queued song', second === qSongs[1].title, `overlay title=${JSON.stringify(second)} want ${qSongs[1].title}`);
    await page.keyboard.press('Space');
    let res2 = false;
    for (let i = 0; i < 25 && !res2; i++) { await page.waitForTimeout(1000); res2 = (await text(page)).includes('FINAL SCORE'); }
    check('last queued song offers no Next Song', res2 && (await page.getByRole('button', { name: 'Next Song' }).count()) === 0, `finished=${res2}`);
  }
  await gotoLibrary();
  // rename + delete playlist
  await sidebar.locator('.sidebar-row').filter({ hasText: 'Set One' }).getByRole('button', { name: 'Rename' }).click();
  await sidebar.locator('.sidebar-row input').fill('Set Two');
  await sidebar.locator('.sidebar-row').getByRole('button', { name: 'Save' }).click(); await settle(500);
  check('playlist rename persisted', (await rpc(base, 'getAllPlaylists')).some((p) => p.name === 'Set Two'), '');
  dialogs.length = 0;
  await sidebar.locator('.sidebar-row').filter({ hasText: 'Set Two' }).getByRole('button', { name: 'Delete' }).click(); await settle(600);
  console.log('playlist delete: dialogs =', JSON.stringify(dialogs), 'modal =', (await page.locator('[role=dialog]').count()) > 0);
  await gotoLibrary();
  await sidebar.locator('.sidebar-row').filter({ hasText: 'Queue Test' }).getByRole('button', { name: 'Delete' }).click(); await settle(600);
  await gotoLibrary();
  songs = await storageAgrees('after playlist delete');
  check('playlist delete keeps songs and clears membership rows', songs.length === 5 && (await rpc(base, 'getAllPlaylists')).length === 0 && dbRead((db) => db.prepare('SELECT COUNT(*) c FROM playlist_songs').get().c) === 0, '');

  // ---------- 9. Bulk actions ----------
  await page.getByRole('button', { name: 'Select All Visible' }).click(); await settle(200);
  check('Select All Visible selects 5', (await page.locator('.bulk-action-bar h2').textContent()) === '5 selected', '');
  const tagField = (label) => page.locator('.bulk-action-bar label').filter({ hasText: label }).locator('input');
  await tagField('Add Tag').fill('bulk'); await tagField('Add Tag').press('Enter'); await settle(600);
  songs = await rpc(base, 'getAllSongs');
  check('bulk add tag', songs.every((s) => s.tags.includes('bulk')), JSON.stringify(songs.map((s) => s.tags)));
  await tagField('Remove Tag').fill('bulk'); await tagField('Remove Tag').press('Enter'); await settle(600);
  songs = await rpc(base, 'getAllSongs');
  check('bulk remove tag', songs.every((s) => !s.tags.includes('bulk')), JSON.stringify(songs.map((s) => s.tags)));
  await page.getByRole('button', { name: 'Deselect All' }).first().click();
  // bulk delete: two songs, one of them has a game result and a playlist membership
  await addPlaylist('Doomed');
  await page.getByRole('button', { name: 'All Songs', exact: true }).click(); await settle(300);
  await sel('Delta Scale').locator('input[type=checkbox]').check();
  await page.locator('.bulk-action-bar label').filter({ hasText: 'Add to Playlist' }).locator('select').selectOption({ label: 'Doomed' }); await settle(600);
  songs = await rpc(base, 'getAllSongs'); byTitle = rowsOf(songs);
  const doomedIds = [byTitle['Delta Scale'].id, byTitle['charlie etude'].id];
  const keepIds = songs.map((s) => s.id).filter((id) => !doomedIds.includes(id));
  const countFor = (ids) => dbRead((db) => ({ results: db.prepare(`SELECT COUNT(*) c FROM game_results WHERE song_id IN (${ids.map(() => '?').join(',')})`).get(...ids).c, playlist: db.prepare(`SELECT COUNT(*) c FROM playlist_songs WHERE song_id IN (${ids.map(() => '?').join(',')})`).get(...ids).c }));
  console.log('before bulk delete: dependent rows for doomed songs', JSON.stringify(countFor(doomedIds)));
  await page.getByRole('button', { name: 'All Songs', exact: true }).click(); await settle(300);
  await sel('Delta Scale').locator('input[type=checkbox]').check();
  await sel('charlie etude').locator('input[type=checkbox]').check(); await settle(200);
  dialogs.length = 0;
  await page.screenshot({ path: `${shots}/04-before-bulk-delete.png` });
  const confirmDialog = () => page.locator('[role=dialog]');
  const dependentBefore = JSON.stringify(countFor(doomedIds));
  const filesBefore = JSON.stringify(walk(path.join(data, 'midi-files')).sort());
  // PH-UI-006: Delete asks first. Cancel owns focus and changes nothing.
  await page.locator('.bulk-action-bar').getByRole('button', { name: 'Delete', exact: true }).click();
  await settle(300);
  const promptText = (await confirmDialog().count()) ? await confirmDialog().innerText() : '';
  const focusedLabel = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
  console.log('bulk delete prompt:', JSON.stringify(promptText), '; focused:', JSON.stringify(focusedLabel), '; native dialogs =', JSON.stringify(dialogs));
  await page.screenshot({ path: `${shots}/04b-bulk-delete-prompt.png` });
  check('bulk Delete asks first, names 2 songs and their results and practice history', /Delete 2 songs\?/.test(promptText) && /results/.test(promptText) && /practice history/.test(promptText), JSON.stringify(promptText));
  check('Cancel takes the focus', focusedLabel === 'Cancel', focusedLabel);
  check('nothing was deleted while the prompt is open', (await rpc(base, 'getAllSongs')).length === 5, '');
  await confirmDialog().getByRole('button', { name: 'Cancel' }).click(); await settle(500);
  check('Cancel closes the prompt, keeps 5 songs, their results, playlist rows and files',
    (await confirmDialog().count()) === 0 && (await rpc(base, 'getAllSongs')).length === 5 && JSON.stringify(countFor(doomedIds)) === dependentBefore && JSON.stringify(walk(path.join(data, 'midi-files')).sort()) === filesBefore,
    `${dependentBefore} -> ${JSON.stringify(countFor(doomedIds))}`);
  check('Cancel leaves the 2 songs selected and no "Deleted" status', (await page.locator('.bulk-action-bar h2').innerText()).startsWith('2 selected') && !/Deleted/.test(await status()), JSON.stringify(await status()));
  await page.locator('.bulk-action-bar').getByRole('button', { name: 'Delete', exact: true }).click(); await settle(300);
  await confirmDialog().getByRole('button', { name: 'Delete 2 songs' }).click();
  await settle(900);
  console.log('bulk delete confirmed: status:', JSON.stringify(await status()));
  const goneAfterConfirm = (await rpc(base, 'getAllSongs')).length === 3;
  console.log('bulk delete removed 2 songs after Confirm:', goneAfterConfirm && (await confirmDialog().count()) === 0);
  await gotoLibrary();
  songs = await storageAgrees('after bulk delete + reload');
  check('only doomed songs deleted', eq(songs.map((s) => s.id).sort(), keepIds.sort()), JSON.stringify(songs.map((s) => s.title)));
  console.log('after bulk delete: dependent rows for doomed songs', JSON.stringify(countFor(doomedIds)));
  check('deleted songs left no orphaned file, kept files intact', walk(path.join(data, 'midi-files')).filter((f) => f.endsWith('.mid')).length === 3 && doomedIds.every((id) => !fs.existsSync(path.join(data, 'midi-files', id + '.mid'))), JSON.stringify(walk(path.join(data, 'midi-files'))));
  // single delete from the editor
  await sel('Foxtrot Epic').getByRole('button', { name: 'More' }).click();
  await sel('Foxtrot Epic').getByRole('button', { name: 'Edit Metadata' }).click(); await settle(300);
  dialogs.length = 0;
  await ed.getByRole('button', { name: 'Delete Song' }).click(); await settle(300);
  const editorPrompt = (await confirmDialog().count()) ? await confirmDialog().innerText() : '';
  console.log('single delete (editor) prompt:', JSON.stringify(editorPrompt));
  check('Delete Song asks first, names 1 song', /Delete 1 song\?/.test(editorPrompt) && /practice history/.test(editorPrompt), JSON.stringify(editorPrompt));
  await confirmDialog().getByRole('button', { name: 'Cancel' }).click(); await settle(400);
  check('Cancel from the editor prompt keeps the song and the editor', (await rpc(base, 'getAllSongs')).length === 3 && (await ed.count()) > 0, '');
  await ed.getByRole('button', { name: 'Delete Song' }).click(); await settle(300);
  await confirmDialog().getByRole('button', { name: 'Delete 1 song' }).click(); await settle(900);
  console.log('single delete (editor) confirmed: dialogs =', JSON.stringify(dialogs), 'modal =', (await confirmDialog().count()) > 0);
  await gotoLibrary();
  songs = await storageAgrees('after single delete + reload');
  check('single delete removed exactly one', songs.length === 2 && !songs.some((s) => s.title === 'Foxtrot Epic'), JSON.stringify(songs.map((s) => s.title)));
  // delete all remaining via Select All + Delete -> empty state
  await page.getByRole('button', { name: 'Select All Visible' }).click();
  await page.locator('.bulk-action-bar').getByRole('button', { name: 'Delete', exact: true }).click(); await settle(300);
  await confirmDialog().getByRole('button', { name: /^Delete 2 songs$/ }).click(); await settle(900);
  await gotoLibrary();
  songs = await storageAgrees('after deleting everything + reload');
  check('empty library message after deleting all', songs.length === 0 && (await text(page)).includes('Upload MIDI or MSCZ to start your setlist.'), '');
  console.log('server log tail:', JSON.stringify(fs.readFileSync(path.join(data, 'server.log'), 'utf8').split('\n').filter(Boolean).slice(-4)));
  console.log('console/page errors:', JSON.stringify(errors.filter((e) => !e.includes('"off"'))));
}, { port, timeout: 8000 });
console.log(fails === 0 ? 'ALL CHECKS PASSED' : `${fails} CHECK(S) FAILED`);
