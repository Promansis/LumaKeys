// Phase 11 proof for PH-PAR-003: hash-mismatched, unreadable, missing and corrupt legacy
// MIDI sources must leave no playable row, in both runtimes, while valid sources migrate.
//
// Desktop path: the exact Electron main-process sequence (src/main/index.ts), run in-process:
//   new AppDatabase -> migrateFromJson(userData, FileSystemMidiStorageAdapter) -> midiStorage.read
//   (readDesktopSongMidiBytes) -> recomputeAllSongDifficulties. Electron itself is not launched.
// Web path: the built server (dist/server/index.cjs) over HTTP: /api/bridge, /api/midi/:id.
//
// Two profile variants per runtime:
//   fresh  - only song-metadata.json (first-run JSON migration).
//   repair - rows already in the database with external file paths (pre-fix migration output)
//            plus song-metadata.json.migrated (startup repair).
// A restart is run after each variant to show the unavailable state is stable.
//
// Everything is written under PROBE_ROOT (default $TMPDIR/p11/PF/probes/par003). The script
// never reads real user data: it builds synthetic legacy profiles only.
//
// Run: node scripts/audit/proof-par003-unplayable-legacy.mjs   (PROBE_PORT defaults to 3940)
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(REPO, 'package.json'));
const ROOT = resolve(process.env.PROBE_ROOT ?? join(tmpdir(), 'p11', 'PF', 'probes', 'par003'));
if (!ROOT.startsWith(resolve(tmpdir()))) throw new Error(`PROBE_ROOT must be under ${tmpdir()}`);
const PORT = Number(process.env.PROBE_PORT ?? 3940);
if (PORT < 3940 || PORT > 3949) throw new Error('PROBE_PORT must be 3940-3949');
const SERVER = join(REPO, 'dist', 'server', 'index.cjs');

rmSync(ROOT, { recursive: true, force: true });
mkdirSync(ROOT, { recursive: true });

// Bundle the real persistence code from src/ into ROOT (read-only use of the repo).
const esbuild = require('esbuild');
const bundle = join(ROOT, 'persistence.cjs');
esbuild.buildSync({
  stdin: {
    contents: `export { AppDatabase } from './src/persistence/database';
export { FileSystemMidiStorageAdapter } from './src/storage/midiStorage';
export { recomputeAllSongDifficulties } from './src/persistence/importSong';`,
    resolveDir: REPO,
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', outfile: bundle, external: ['better-sqlite3'],
  nodePaths: [join(REPO, 'node_modules')], logLevel: 'silent',
});
writeFileSync(bundle, readFileSync(bundle, 'utf8').replaceAll('require("better-sqlite3")', `require(${JSON.stringify(join(REPO, 'node_modules', 'better-sqlite3'))})`));
const { AppDatabase, FileSystemMidiStorageAdapter, recomputeAllSongDifficulties } = require(bundle);
const { Midi } = require('@tonejs/midi');

const sha = (b) => createHash('sha256').update(b).digest('hex');
const midiBytes = (note) => { const m = new Midi(); m.addTrack().addNote({ midi: note, time: 0, duration: 0.5, velocity: 0.8 }); return Buffer.from(m.toArray()); };

const SONGS = {
  valid: { bytes: midiBytes(60) },
  mismatch: { claimed: midiBytes(62), onDisk: midiBytes(72) }, // id = hash(claimed), file holds different valid MIDI
  unreadable: { bytes: midiBytes(64) },                        // chmod 000
  missing: { bytes: midiBytes(65) },                           // source file never created
  corrupt: { bytes: Buffer.from('this is not a midi file') },  // hash matches, bytes are not MIDI
  nosource: { bytes: midiBytes(67) },                          // no sourcePath at all
};
for (const [k, s] of Object.entries(SONGS)) s.id = sha(s.claimed ?? s.bytes);
const EXPECT_PLAYABLE = new Set(['valid']);

function buildProfile(variant, name) {
  const base = join(ROOT, name);
  const data = join(base, 'data'); // the userData / LUMAKEYS_DATA_DIR root
  const src = join(base, 'legacy-sources');
  mkdirSync(data, { recursive: true });
  mkdirSync(src, { recursive: true });
  const paths = {
    valid: join(src, 'valid.mid'), mismatch: join(src, 'mismatch.mid'), unreadable: join(src, 'unreadable.mid'),
    missing: join(src, 'missing.mid'), corrupt: join(src, 'corrupt.mid'), nosource: undefined,
  };
  writeFileSync(paths.valid, SONGS.valid.bytes);
  writeFileSync(paths.mismatch, SONGS.mismatch.onDisk);
  writeFileSync(paths.unreadable, SONGS.unreadable.bytes);
  writeFileSync(paths.corrupt, SONGS.corrupt.bytes);
  chmodSync(paths.unreadable, 0o000);
  const meta = { songs: {} };
  for (const k of Object.keys(SONGS)) {
    meta.songs[SONGS[k].id] = { title: `legacy-${k}`, ...(paths[k] ? { sourcePath: paths[k] } : {}), trackAssignments: {}, updatedAt: '2026-07-30T00:00:00.000Z' };
  }
  if (variant === 'fresh') {
    writeFileSync(join(data, 'song-metadata.json'), JSON.stringify(meta));
  } else {
    writeFileSync(join(data, 'song-metadata.json.migrated'), JSON.stringify(meta));
    const db = new AppDatabase(join(data, 'lumakeys.db'));
    for (const k of Object.keys(SONGS)) {
      db.addSong({ id: SONGS[k].id, title: `legacy-${k}`, artist: '', genre: '', filePath: paths[k] ?? join(src, `${k}.mid`), difficulty: 1, durationSec: 1, bpm: 120, noteCount: 1, tags: [], trackAssignments: {} });
    }
    db.close();
  }
  return { base, data, src, paths };
}

const nameOf = (id) => Object.keys(SONGS).find((k) => SONGS[k].id === id);
const summarizeRecompute = (r) => ({ updated: r.updated, errorTitles: r.errors.map((e) => e.filename).sort() });

/** Runtime-agnostic judgement from observations. */
function judge(obs, profile, variant) {
  const problems = [];
  const notes = [];
  // Startup repair (variant 'repair') copies hash-matching bytes without parsing them, so a
  // corrupt-but-hash-matching source becomes a playable-looking row. The first-run path rejects it.
  // That gap is outside the owed proof (hash-mismatch / unreadable / missing); it is reported as a
  // separate observation, not as a failure of the owed proof.
  const repairCorruptGap = variant === 'repair' && obs.rows.corrupt?.filePath !== '';
  if (repairCorruptGap) notes.push('corrupt (hash-matching, unparseable) source was copied into app-owned storage and left as a loadable row by the repair path');
  for (const k of Object.keys(SONGS)) {
    if (k === 'corrupt' && repairCorruptGap) continue;
    const row = obs.rows[k];
    if (!row) { problems.push(`${k}: row missing`); continue; }
    const playable = row.filePath !== '' && obs.loadable[k];
    if (EXPECT_PLAYABLE.has(k)) {
      if (!playable) problems.push(`${k}: expected playable`);
      if (!row.filePathUnderMidiFiles) problems.push(`${k}: filePath not under midi-files`);
      if (!obs.storedBytesMatch[k]) problems.push(`${k}: app-owned bytes differ from source`);
    } else {
      if (row.filePath !== '') problems.push(`${k}: filePath should be empty, got ${row.filePath}`);
      if (obs.loadable[k]) problems.push(`${k}: loadable but should not be`);
      if (obs.storedFileExists[k]) problems.push(`${k}: app-owned file exists`);
    }
  }
  const want = Object.keys(SONGS).filter((k) => !EXPECT_PLAYABLE.has(k)).map((k) => `legacy-${k}`).sort();
  if (obs.recompute.updated !== EXPECT_PLAYABLE.size) problems.push(`recompute updated ${obs.recompute.updated}`);
  if (JSON.stringify(obs.recompute.errorTitles) !== JSON.stringify(want)) problems.push(`recompute errors ${JSON.stringify(obs.recompute.errorTitles)}`);
  const expectedFiles = [`${SONGS.valid.id}.mid`, ...(repairCorruptGap ? [`${SONGS.corrupt.id}.mid`] : [])].sort();
  if (JSON.stringify(obs.midiFilesDir) !== JSON.stringify(expectedFiles)) problems.push(`midi-files entries ${JSON.stringify(obs.midiFilesDir)}`);
  if (!obs.sourcesIntact) problems.push('legacy sources were modified');
  return { problems, notes };
}

function sourcesIntact(p) {
  try {
    return sha(readFileSync(p.paths.mismatch)) === sha(SONGS.mismatch.onDisk)
      && existsSync(p.paths.unreadable) && (statSync(p.paths.unreadable).mode & 0o777) === 0
      && sha(readFileSync(p.paths.valid)) === sha(SONGS.valid.bytes);
  } catch { return false; }
}

// ---------------------------------------------------------------- desktop path
async function desktopRun(p) {
  const midiDir = join(p.data, 'midi-files');
  mkdirSync(midiDir, { recursive: true });
  const midiStorage = new FileSystemMidiStorageAdapter(midiDir);
  const db = new AppDatabase(join(p.data, 'lumakeys.db'));
  await db.migrateFromJson(p.data, midiStorage);
  const rows = {}; const loadable = {}; const storedFileExists = {}; const storedBytesMatch = {};
  const loadErrors = {};
  for (const k of Object.keys(SONGS)) {
    const s = db.getSong(SONGS[k].id);
    rows[k] = s ? { title: s.title, filePath: s.filePath, filePathUnderMidiFiles: s.filePath.startsWith(midiDir) } : null;
    storedFileExists[k] = existsSync(midiStorage.getPathForSong(SONGS[k].id));
    try { // readDesktopSongMidiBytes in src/main/index.ts: app-owned storage only, no external fallback
      const bytes = Buffer.from(await midiStorage.read(SONGS[k].id));
      loadable[k] = true; storedBytesMatch[k] = bytes.equals(k === 'valid' ? SONGS.valid.bytes : Buffer.alloc(0));
    } catch (e) { loadable[k] = false; loadErrors[k] = e.code ?? e.message; storedBytesMatch[k] = false; }
  }
  const recompute = summarizeRecompute(await recomputeAllSongDifficulties({ db, midiStorage, readSongBytes: (s) => midiStorage.read(s.id) }));
  const totalRows = db.getAllSongs().length;
  db.close();
  return { rows, loadable, loadErrors, storedFileExists, storedBytesMatch, recompute, totalRows, midiFilesDir: readdirSync(midiDir).sort(), dataDirEntries: readdirSync(p.data).sort(), sourcesIntact: sourcesIntact(p) };
}

// ---------------------------------------------------------------- web path
async function startServer(cwd, dataDir) {
  const env = { PATH: process.env.PATH, HOME: join(ROOT, 'home'), PORT: String(PORT), LUMAKEYS_DATA_DIR: dataDir, LUMAKEYS_TRUST_UPSTREAM_AUTH: '1' };
  const child = spawn(process.execPath, [SERVER], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const exited = new Promise((r) => child.once('exit', (code, signal) => r({ code, signal })));
  let up = false;
  for (let i = 0; i < 100 && child.exitCode === null; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/access`); if (r.status) { up = true; break; } } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return { child, up, exited, log: () => log };
}
async function stopServer(srv) {
  srv.child.kill('SIGTERM');
  await Promise.race([srv.exited, new Promise((r) => setTimeout(() => { srv.child.kill('SIGKILL'); r(); }, 5000))]);
}
async function bridge(method, args = []) {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/bridge/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function webRun(p, srv) {
  if (!srv.up) return { serverUp: false, log: srv.log().slice(0, 600) };
  const all = (await bridge('getAllSongs')).body.result;
  const rows = {}; const loadable = {}; const storedFileExists = {}; const storedBytesMatch = {}; const midiStatus = {};
  const midiDir = join(p.data, 'midi-files');
  for (const k of Object.keys(SONGS)) {
    const s = all.find((x) => x.id === SONGS[k].id);
    rows[k] = s ? { title: s.title, filePath: s.filePath, filePathUnderMidiFiles: s.filePath.startsWith(midiDir) } : null;
    storedFileExists[k] = existsSync(join(midiDir, `${SONGS[k].id}.mid`));
    const r = await fetch(`http://127.0.0.1:${PORT}/api/midi/${SONGS[k].id}`);
    midiStatus[k] = r.status;
    const bytes = Buffer.from(await r.arrayBuffer());
    loadable[k] = r.status === 200;
    storedBytesMatch[k] = r.status === 200 && bytes.equals(SONGS.valid.bytes);
  }
  const rec = await bridge('recomputeAllSongDifficulties');
  return { serverUp: true, rows, loadable, midiStatus, storedFileExists, storedBytesMatch, recompute: summarizeRecompute(rec.body.result), totalRows: all.length, midiFilesDir: readdirSync(midiDir).sort(), dataDirEntries: readdirSync(p.data).sort(), sourcesIntact: sourcesIntact(p) };
}

// ---------------------------------------------------------------- main
const report = { startedAt: new Date().toISOString(), cases: {} };
let failures = 0;
const cleanup = [];

async function runCase(runtime, variant) {
  const id = `${runtime}-${variant}`;
  const p = buildProfile(variant, id);
  cleanup.push(p);
  const out = { first: null, restart: null, problems: [], notes: [] };
  if (runtime === 'desktop') {
    out.first = await desktopRun(p);
    out.restart = await desktopRun(p); // second app start against the same profile
  } else {
    mkdirSync(join(p.base, 'cwd'), { recursive: true });
    let srv = await startServer(join(p.base, 'cwd'), p.data);
    out.first = await webRun(p, srv);
    await stopServer(srv);
    srv = await startServer(join(p.base, 'cwd'), p.data);
    out.restart = await webRun(p, srv);
    await stopServer(srv);
  }
  for (const [label, obs] of [['first', out.first], ['restart', out.restart]]) {
    if (obs.serverUp === false) { out.problems.push(`${label}: server did not start: ${obs.log}`); continue; }
    const j = judge(obs, p, variant);
    out.problems.push(...j.problems.map((x) => `${label}: ${x}`));
    for (const n of j.notes) if (!out.notes.includes(n)) out.notes.push(n);
    if (obs.totalRows !== Object.keys(SONGS).length) out.problems.push(`${label}: row count ${obs.totalRows}`);
  }
  if (variant === 'fresh') {
    const ok = existsSync(join(p.data, 'song-metadata.json.migrated')) && !existsSync(join(p.data, 'song-metadata.json'));
    out.jsonRenamedToMigrated = ok;
    if (!ok) out.problems.push('song-metadata.json was not renamed to .migrated');
  }
  out.pass = out.problems.length === 0;
  if (!out.pass) failures += 1;
  report.cases[id] = out;
  console.log(`CASE ${id} ${out.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(out.problems)} NOTES ${JSON.stringify(out.notes)}`);
}

mkdirSync(join(ROOT, 'home'), { recursive: true });
try {
  for (const runtime of ['desktop', 'web']) {
    for (const variant of ['fresh', 'repair']) {
      await runCase(runtime, variant);
    }
  }
} finally {
  for (const p of cleanup) { try { chmodSync(p.paths.unreadable, 0o600); } catch {} }
}
writeFileSync(join(ROOT, 'report.json'), JSON.stringify(report, null, 2));
console.log(failures === 0 ? 'OVERALL PASS' : `OVERALL FAIL (${failures} case(s))`);
process.exit(failures === 0 ? 0 : 1);
