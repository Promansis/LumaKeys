// PH-UI-021 runtime proof: each native file dialog gets the last folder of its own kind as defaultPath
// (memory only). A recorder replaces dialog.showOpenDialog/showSaveDialog in the main process, logs the
// options the product passed, and returns a real path under the profile.
// Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE (empty, under $TMPDIR) set; LABEL names the
// build in the output. Exits 1 when any check fails. A build without src/main/dialogDefaults.ts (before
// d5507a6) fails every second-use check.
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const profile = process.env.PROFILE;
const label = process.env.LABEL ?? 'build';
const CUR = path.join(REPO, 'public/curriculum-midis');
const picks = path.join(profile, 'picks');
const dir = (n) => { const d = path.join(picks, n); fs.mkdirSync(d, { recursive: true }); return d; };
const A = dir('a'), B = dir('b'), C = dir('c'), D = dir('d'), W = dir('w'), S = dir('s'), M = dir('m'), AU = dir('au');
fs.copyFileSync(path.join(CUR, 'ode-to-joy.mid'), path.join(A, 'one.mid'));
fs.copyFileSync(path.join(CUR, 'minuet-in-g.mid'), path.join(A, 'two.mid'));
fs.copyFileSync(path.join(CUR, 'prelude-in-c.mid'), path.join(C, 'folder-song.mid'));
// a minimal 16-bit mono PCM wav so the backing-track pick is a real audio file
{
  const n = 4410, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(44100, 24); buf.writeUInt32LE(88200, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  fs.writeFileSync(path.join(AU, 'backing.wav'), buf);
}

const install = (app) => app.evaluate(({ dialog }) => {
  globalThis.__dialogLog = [];
  globalThis.__next = { open: [], save: undefined };
  const rec = (kind) => async (...args) => {
    const options = args[args.length - 1] ?? {};
    globalThis.__dialogLog.push({ kind, defaultPath: options.defaultPath ?? null, title: options.title ?? null, properties: options.properties ?? null, filters: (options.filters ?? []).map((f) => f.name) });
    if (kind === 'open') { const p = globalThis.__next.open; return { canceled: p.length === 0, filePaths: p }; }
    const f = globalThis.__next.save; return { canceled: !f, filePath: f };
  };
  dialog.showOpenDialog = rec('open');
  dialog.showSaveDialog = rec('save');
});
const setNext = (app, open, save) => app.evaluate((_e, v) => { globalThis.__next = v; }, { open: open ?? [], save });
const drain = (app) => app.evaluate(() => globalThis.__dialogLog.splice(0));
const rel = (p) => (p === null ? null : p.startsWith(profile) ? p.replace(profile, '<profile>') : p);

const results = [];
let failures = 0;
const check = (name, entries, expectDir) => {
  // expectDir: null => no folder default; string => default must start with that folder
  const e = entries[entries.length - 1];
  const got = e?.defaultPath ?? null;
  let ok;
  if (expectDir === null) ok = got === null || !path.isAbsolute(got);
  else ok = typeof got === 'string' && (got === expectDir || path.dirname(got) === expectDir);
  if (entries.length !== 1) ok = false;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} | ${name} | calls=${entries.length} kind=${e?.kind} defaultPath=${rel(got)} expected=${expectDir === null ? 'none' : rel(expectDir)} title=${JSON.stringify(e?.title)} props=${JSON.stringify(e?.properties)}`);
  if (!ok) failures += 1;
};

await withElectron(profile, async (h) => {
  let { page, app } = h;
  await page.waitForTimeout(2500);
  const skipGuide = async () => { if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForTimeout(500); };
  await skipGuide();
  await install(app);
  const toLibrary = async () => { await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(900); };
  const click = async (name, opts = {}) => { await page.getByRole('button', { name, exact: true, ...opts }).click(); await page.waitForTimeout(1500); };
  const step = async (name, open, save, action, expectDir) => { await drain(app); await setNext(app, open, save); await action(); check(name, await drain(app), expectDir); };

  await toLibrary();
  // midiFile
  await step('Library > Upload MIDI #1', [path.join(A, 'one.mid')], undefined, () => click('Upload MIDI'), null);
  await step('Library > Upload MIDI #2 (expect last picked file folder a/)', [path.join(A, 'two.mid')], undefined, () => click('Upload MIDI'), A);
  // midiFolder
  await step('Library > Import Folder #1', [C], undefined, () => click('Import Folder'), null);
  await step('Library > Import Folder #2 (expect last picked folder c/)', [C], undefined, () => click('Import Folder'), C);
  // libraryJson: export (save) then import (open) share one kind
  await step('Library > Export Library #1 (name only)', [], path.join(B, 'export.json'), () => click('Export Library'), null);
  fs.copyFileSync(path.join(B, 'export.json'), path.join(D, 'import.json'));
  await step('Library > Import Library #1 (expect b/ from the export)', [path.join(D, 'import.json')], undefined, () => click('Import Library'), B);
  await step('Library > Export Library #2 (expect d/ from the import)', [], path.join(B, 'export2.json'), () => click('Export Library'), D);
  // other kinds stayed untouched: midiFile still a/, midiFolder still c/
  await step('Library > Upload MIDI #3 (still a/, unaffected by library/folder dialogs)', [path.join(A, 'one.mid')], undefined, () => click('Upload MIDI'), A);

  // Settings > Audio > Choose Folder (samplePackFolder)
  await page.reload(); await page.waitForTimeout(2500); await skipGuide();
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700);
  await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(300);
  const adv = page.getByRole('button', { name: /show advanced options/i });
  if (await adv.count()) { await adv.first().click(); await page.waitForTimeout(250); }
  await step('Settings > Audio > Choose Folder #1', [S], undefined, () => click('Choose Folder'), null);
  await step('Settings > Audio > Choose Folder #2 (expect s/)', [S], undefined, () => click('Choose Folder'), S);

  // Free Play: midiExport, wavExport, audioFile (Load Track)
  await page.reload(); await page.waitForTimeout(2500); await skipGuide();
  await page.getByRole('button', { name: 'Free Play', exact: true }).click(); await page.waitForTimeout(1500);
  const openOverlay = async () => { if (!(await page.locator('#free-play-overlay-panel').count())) { await page.keyboard.press('Escape'); await page.waitForSelector('#free-play-overlay-panel'); await page.waitForTimeout(250); } };
  const closeOverlay = async () => { await page.getByRole('button', { name: 'Resume' }).click(); await page.waitForTimeout(300); await page.locator('canvas').first().click({ position: { x: 640, y: 300 } }).catch(() => {}); await page.waitForTimeout(200); };
  await openOverlay();
  await page.getByRole('button', { name: 'Record', exact: true }).click(); await page.waitForTimeout(300);
  await closeOverlay();
  for (const [code, hold] of [['Comma', 300], ['Slash', 300], ['KeyW', 300]]) { await page.keyboard.down(code); await page.waitForTimeout(hold); await page.keyboard.up(code); await page.waitForTimeout(150); }
  await openOverlay();
  await page.getByRole('button', { name: 'Stop Recording' }).click(); await page.waitForTimeout(400);
  const wavDone = async () => { for (let i = 0; i < 100; i++) { const s = await page.locator('.immersive-overlay-panel .status-card').filter({ hasText: 'Status' }).locator('strong').first().textContent().catch(() => ''); if (/WAV saved|failed|cancel/i.test(s ?? '')) return s; await page.waitForTimeout(300); } return 'timeout'; };
  await step('Free Play > Export MIDI #1', [], path.join(M, 'take1.mid'), () => click('Export MIDI'), null);
  await step('Free Play > Export MIDI #2 (expect m/)', [], path.join(M, 'take2.mid'), () => click('Export MIDI'), M);
  await step('Free Play > Export WAV #1 (own kind: no dir even after MIDI export)', [], path.join(W, 'take1.wav'), async () => { await page.getByRole('button', { name: 'Export WAV', exact: true }).click(); await wavDone(); }, null);
  await step('Free Play > Export WAV #2 (expect w/)', [], path.join(W, 'take2.wav'), async () => { await page.getByRole('button', { name: 'Export WAV', exact: true }).click(); await wavDone(); }, W);
  await step('Free Play > Load Track #1', [path.join(AU, 'backing.wav')], undefined, () => click('Load Track'), null);
  await step('Free Play > Load Track #2 (expect au/)', [path.join(AU, 'backing.wav')], undefined, () => click('Load Track'), AU);
  console.log('files written', JSON.stringify({ midi: fs.readdirSync(M), wav: fs.readdirSync(W), lib: fs.readdirSync(B) }));

  // Relaunch: memory only
  ({ page, app } = await h.relaunch());
  await page.waitForTimeout(2500); await skipGuide();
  await install(app);
  await toLibrary();
  await step('AFTER RELAUNCH > Upload MIDI (memory only: expect none)', [path.join(A, 'one.mid')], undefined, () => click('Upload MIDI'), null);
  await step('AFTER RELAUNCH > Import Folder (expect none)', [C], undefined, () => click('Import Folder'), null);
  await step('AFTER RELAUNCH > Export Library (name only)', [], path.join(B, 'export3.json'), () => click('Export Library'), null);
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 8)));
});
console.log(`SUMMARY ${label}: failures=${failures}`);
console.log('DONE');
if (failures) process.exitCode = 1;
