// Phase 11 lane B probe: which data directory does the built web server pick, and what
// does the one-release legacy fallback do to it? Runs dist/server/index.cjs (the current
// build of src/server/index.ts) once per case with a clean environment and a working
// directory under PROBE_ROOT, so relative defaults never resolve inside the repository.
// Databases are seeded with the real AppDatabase (bundled from src/ with esbuild).
//
// Run: node scripts/audit/legacy-brand-server-probe.mjs   (PORT defaults to 3798)
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(REPO, 'package.json'));
const ROOT = resolve(process.env.PROBE_ROOT ?? join(tmpdir(), 'p11', 'B', 'legacy-server'));
if (!ROOT.startsWith(resolve(tmpdir()))) throw new Error(`PROBE_ROOT must be under ${tmpdir()}`);
const PORT = Number(process.env.PROBE_PORT ?? 3798);
const SERVER = join(REPO, 'dist', 'server', 'index.cjs');

const esbuild = require('esbuild');
const dbBundle = join(ROOT, 'database.cjs');
mkdirSync(ROOT, { recursive: true });
esbuild.buildSync({ entryPoints: [join(REPO, 'src/persistence/database.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: dbBundle, external: ['better-sqlite3'], nodePaths: [join(REPO, 'node_modules')], logLevel: 'silent' });
// The bundle lives outside the repo, so point its better-sqlite3 require at the repo copy.
writeFileSync(dbBundle, readFileSync(dbBundle, 'utf8').replaceAll('require("better-sqlite3")', `require(${JSON.stringify(join(REPO, 'node_modules', 'better-sqlite3'))})`));
const { AppDatabase } = require(dbBundle);
const Database = require('better-sqlite3');

/** Seed a data directory whose database holds one song with a recognisable id. */
function seed(dir, dbName, songId) {
  mkdirSync(join(dir, 'midi-files'), { recursive: true });
  const db = new AppDatabase(join(dir, 'seed.db'));
  db.addSong({ id: songId, title: songId, artist: '', genre: '', filePath: join(dir, 'midi-files', `${songId}.mid`), difficulty: 1, durationSec: 1, bpm: 120, noteCount: 1, tags: [], trackAssignments: {} });
  db.close();
  for (const ext of ['', '-wal', '-shm']) if (existsSync(join(dir, 'seed.db' + ext))) renameSync(join(dir, 'seed.db' + ext), join(dir, dbName + ext));
}

/** Seed a database whose second song is committed only in the WAL: the set is copied while the writer is still open. */
function seedWalOnly(dir, dbName, [checkpointedId, walOnlyId]) {
  mkdirSync(join(dir, 'midi-files'), { recursive: true });
  const seedPath = join(dir, 'seed.db');
  const db = new AppDatabase(seedPath);
  const add = (id) => db.addSong({ id, title: id, artist: '', genre: '', filePath: join(dir, 'midi-files', `${id}.mid`), difficulty: 1, durationSec: 1, bpm: 120, noteCount: 1, tags: [], trackAssignments: {} });
  add(checkpointedId);
  db.db.pragma('wal_checkpoint(TRUNCATE)');
  db.db.pragma('wal_autocheckpoint = 0');
  add(walOnlyId);
  for (const ext of ['', '-wal', '-shm']) copyFileSync(seedPath + ext, join(dir, dbName + ext));
  db.close();
  for (const ext of ['', '-wal', '-shm']) rmSync(seedPath + ext, { force: true });
}

/** Every path under base (depth 3) that holds a lumakeys.db or pianohero.db, plus its songs. */
function dbMap(base) {
  const found = {};
  const walk = (dir, depth) => {
    if (depth > 12 || !existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { walk(p, depth + 1); continue; }
      if (name !== 'lumakeys.db' && name !== 'pianohero.db') continue;
      const scratch = join(ROOT, '.inspect');
      rmSync(scratch, { recursive: true, force: true }); mkdirSync(scratch);
      for (const ext of ['', '-wal', '-shm']) if (existsSync(p + ext)) copyFileSync(p + ext, join(scratch, 'x.db' + ext));
      const db = new Database(join(scratch, 'x.db'), { readonly: true });
      let songs; try { songs = db.prepare('select id from songs').all().map((r) => r.id); } catch (e) { songs = String(e.message); }
      db.close();
      found[JSON.stringify(relative(base, p))] = songs;
    }
  };
  walk(base, 0);
  return found;
}

function dirsUnder(base) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 12) return;
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { out.push(JSON.stringify(relative(base, p))); walk(p, depth + 1); }
    }
  };
  walk(base, 0);
  return out;
}

async function startServer(cwd, extraEnv) {
  const env = { PATH: process.env.PATH, HOME: join(ROOT, 'home'), PORT: String(PORT), LUMAKEYS_TRUST_UPSTREAM_AUTH: '1', ...extraEnv };
  const child = spawn(process.execPath, [SERVER], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const exited = new Promise((r) => child.once('exit', (code, signal) => r({ code, signal })));
  let up = false;
  for (let i = 0; i < 80 && child.exitCode === null; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/access`); if (r.status) { up = true; break; } } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return { child, up, exited, log: () => log };
}

async function bridge(method, args = [], headers = {}) {
  const r = await fetch(`http://127.0.0.1:${PORT}/api/bridge/${method}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ args }) });
  const body = await r.json().catch(() => null);
  return { status: r.status, body };
}

async function runCase(id, description, setup, env, extra) {
  const caseRoot = join(ROOT, id);
  rmSync(caseRoot, { recursive: true, force: true });
  const cwd = join(caseRoot, 'cwd');
  mkdirSync(cwd, { recursive: true });
  const ctx = { caseRoot, cwd };
  setup?.(ctx);
  const resolvedEnv = typeof env === 'function' ? env(ctx) : env;
  const before = dbMap(caseRoot);
  const srv = await startServer(cwd, resolvedEnv);
  const result = { id, description, env: resolvedEnv, before, serverUp: srv.up };
  if (srv.up) {
    const songs = await bridge('getAllSongs');
    result.apiSongs = songs.status === 200 ? songs.body.result.map((s) => s.id) : songs;
    if (extra) result.extra = await extra(ctx);
    srv.child.kill('SIGTERM');
  }
  const exit = await Promise.race([srv.exited, new Promise((r) => setTimeout(() => { srv.child.kill('SIGKILL'); r('killed'); }, 5000))]);
  result.exit = exit;
  result.after = dbMap(caseRoot);
  result.dirsAfter = dirsUnder(caseRoot);
  if (!srv.up) result.logError = srv.log().split('\n').filter((l) => /Error/.test(l)).slice(0, 2);
  // Slice 21 (ADR 0002 item 4): the startup line and the legacy-name warning, never a value.
  result.startupLog = srv.log().split('\n').filter((l) => l.startsWith('LumaKeys data directory:') || l.includes('PianoHero names'));
  console.log('CASE ' + JSON.stringify(result));
}

const legacyCwd = ({ cwd }) => seed(join(cwd, '.pianohero-data'), 'pianohero.db', 'song-in-cwd-pianohero-data');
const newCwd = ({ cwd }) => seed(join(cwd, '.lumakeys-data'), 'lumakeys.db', 'song-in-cwd-lumakeys-data');

// Question 1: legacy fallback scope.
await runCase('S1', 'only cwd/.pianohero-data exists, no env', legacyCwd, {});
await runCase('S2', 'cwd holds .lumakeys-data with a db and .pianohero-data with a db, no env', (c) => { legacyCwd(c); newCwd(c); }, {});
await runCase('S3', 'cwd holds an empty .lumakeys-data directory and .pianohero-data with a db', (c) => { legacyCwd(c); mkdirSync(join(c.cwd, '.lumakeys-data')); }, {});
await runCase('S4', 'LUMAKEYS_DATA_DIR points at an empty directory while cwd/.pianohero-data has a db', legacyCwd, ({ caseRoot }) => ({ LUMAKEYS_DATA_DIR: join(caseRoot, 'explicit') }));
await runCase('S5', 'only PIANOHERO_DATA_DIR set, pointing at a legacy db', ({ caseRoot }) => seed(join(caseRoot, 'legacy-env'), 'pianohero.db', 'song-in-legacy-env-dir'), ({ caseRoot }) => ({ PIANOHERO_DATA_DIR: join(caseRoot, 'legacy-env') }));
await runCase('S6', 'both env vars set; LUMAKEYS_DATA_DIR empty dir, PIANOHERO_DATA_DIR has data', ({ caseRoot }) => seed(join(caseRoot, 'legacy-env'), 'pianohero.db', 'song-in-legacy-env-dir'), ({ caseRoot }) => ({ LUMAKEYS_DATA_DIR: join(caseRoot, 'explicit'), PIANOHERO_DATA_DIR: join(caseRoot, 'legacy-env') }));
await runCase('S7', 'one directory holds both lumakeys.db and pianohero.db', ({ caseRoot }) => { seed(join(caseRoot, 'both'), 'lumakeys.db', 'song-in-new-db'); seed(join(caseRoot, 'both-tmp'), 'pianohero.db', 'song-in-old-db'); for (const ext of ['', '-wal', '-shm']) if (existsSync(join(caseRoot, 'both-tmp', 'pianohero.db' + ext))) renameSync(join(caseRoot, 'both-tmp', 'pianohero.db' + ext), join(caseRoot, 'both', 'pianohero.db' + ext)); }, ({ caseRoot }) => ({ LUMAKEYS_DATA_DIR: join(caseRoot, 'both') }));
await runCase('S8', 'server started from an unrelated directory that has a stray .pianohero-data; GET / checks the SPA', legacyCwd, {}, async () => ({ getRoot: (await fetch(`http://127.0.0.1:${PORT}/`)).status }));
// PH-DATA-006 state H3: a same-directory rename stopped after the .db, so the WAL-only song sits in pianohero.db-wal.
await runCase('S9', 'interrupted same-directory rename: lumakeys.db beside pianohero.db-wal and -shm holding a WAL-only song', ({ caseRoot }) => { const dir = join(caseRoot, 'h3'); seedWalOnly(dir, 'pianohero.db', ['song-checkpointed', 'song-wal-only']); renameSync(join(dir, 'pianohero.db'), join(dir, 'lumakeys.db')); }, ({ caseRoot }) => ({ LUMAKEYS_DATA_DIR: join(caseRoot, 'h3') }), async ({ caseRoot }) => ({ dataDirEntries: readdirSync(join(caseRoot, 'h3')).sort() }));

// Question 2: environment precedence.
await runCase('V1', 'LUMAKEYS_DATA_DIR is the empty string', null, { LUMAKEYS_DATA_DIR: '' });
await runCase('V2', 'LUMAKEYS_DATA_DIR is three spaces', null, { LUMAKEYS_DATA_DIR: '   ' });
await runCase('V3', 'LUMAKEYS_DATA_DIR is a relative path', null, { LUMAKEYS_DATA_DIR: 'rel/data' });
await runCase('V4', 'LUMAKEYS_DATA_DIR is three spaces, PIANOHERO_DATA_DIR has data', ({ caseRoot }) => seed(join(caseRoot, 'legacy-env'), 'pianohero.db', 'song-in-legacy-env-dir'), ({ caseRoot }) => ({ LUMAKEYS_DATA_DIR: '   ', PIANOHERO_DATA_DIR: join(caseRoot, 'legacy-env') }));
await runCase('V5', 'LUMAKEYS_DATA_DIR is an absolute path with one leading space', null, ({ caseRoot }) => ({ LUMAKEYS_DATA_DIR: ' ' + join(caseRoot, 'abs') }));
await runCase('V6', 'LUMAKEYS_DATA_DIR empty string, cwd/.pianohero-data has data', legacyCwd, { LUMAKEYS_DATA_DIR: '' });
await runCase('V7', 'access token: LUMAKEYS_WEB_ACCESS_TOKEN empty, PIANOHERO_WEB_ACCESS_TOKEN set', null, ({ caseRoot }) => ({ LUMAKEYS_DATA_DIR: join(caseRoot, 'd'), LUMAKEYS_WEB_ACCESS_TOKEN: '', PIANOHERO_WEB_ACCESS_TOKEN: 'legacy-secret' }), async () => ({ noTokenStatus: (await bridge('getAllSongs')).status }));
await runCase('V8', 'access token: only PIANOHERO_WEB_ACCESS_TOKEN set', null, ({ caseRoot }) => ({ LUMAKEYS_DATA_DIR: join(caseRoot, 'd'), PIANOHERO_WEB_ACCESS_TOKEN: 'legacy-secret' }), async () => ({ noTokenStatus: (await bridge('getAllSongs')).status, legacyTokenStatus: (await bridge('getAllSongs', [], { 'x-lumakeys-access-token': 'legacy-secret' })).status }));
// PH-PAR-003 web half: a supported legacy song-metadata.json is migrated into app-owned storage at startup.
{
  const { Midi } = require('@tonejs/midi');
  const midi = new Midi();
  midi.addTrack().addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });
  const bytes = Buffer.from(midi.toArray());
  const id = createHash('sha256').update(bytes).digest('hex');
  await runCase('J1', 'legacy song-metadata.json with an external source MIDI (PH-PAR-003)', ({ caseRoot }) => {
    mkdirSync(join(caseRoot, 'data'), { recursive: true });
    writeFileSync(join(caseRoot, 'source.mid'), bytes);
    writeFileSync(join(caseRoot, 'data', 'song-metadata.json'), JSON.stringify({ songs: { [id]: { title: 'Legacy JSON song', sourcePath: join(caseRoot, 'source.mid'), trackAssignments: {}, updatedAt: '2026-07-30T00:00:00.000Z' } } }));
  }, ({ caseRoot }) => ({ LUMAKEYS_DATA_DIR: join(caseRoot, 'data') }), async ({ caseRoot }) => {
    const songs = await bridge('getAllSongs');
    const song = songs.body?.result?.find((s) => s.id === id);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/midi/${id}`);
    const served = Buffer.from(await r.arrayBuffer());
    return { songTitle: song?.title, filePathUnderDataDir: song ? song.filePath.startsWith(join(caseRoot, 'data', 'midi-files')) : null, midiGetStatus: r.status, servedBytesMatch: served.equals(bytes), dataDirEntries: readdirSync(join(caseRoot, 'data')).sort() };
  });
}
rmSync(join(ROOT, '.inspect'), { recursive: true, force: true });
