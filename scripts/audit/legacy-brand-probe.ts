// Phase 11 lane B probe: half-finished legacy brand migration and restart.
// Imports the real migrateLegacyBrand and AppDatabase from src/. Writes only under
// PROBE_ROOT (default $TMPDIR/p11/B/legacy-brand). Never point it at real data.
//
// Run: node --import file:///media/storage/LumaKeys/node_modules/tsx/dist/loader.mjs \
//        scripts/audit/legacy-brand-probe.ts
import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { AppDatabase } from '../../src/persistence/database';
import { migrateLegacyBrand } from '../../src/persistence/legacyBrandMigration';

const ROOT = resolve(process.env.PROBE_ROOT ?? join(tmpdir(), 'p11', 'B', 'legacy-brand'));
if (!ROOT.startsWith(resolve(tmpdir()))) throw new Error(`PROBE_ROOT must be under ${tmpdir()}`);
const SELF = fileURLToPath(import.meta.url);
const LOADER = process.execArgv.find((a) => a.includes('tsx')) ?? '';

/** Child mode: build a legacy db whose last commits live only in the WAL, then die without checkpoint. */
function seedChild(dir: string, dbName: string): never {
  mkdirSync(join(dir, 'midi-files'), { recursive: true });
  writeFileSync(join(dir, 'midi-files', 'legacy-song.mid'), 'MThd-legacy-bytes');
  const tmpName = 'seed-tmp.db';
  const db = new AppDatabase(join(dir, tmpName));
  db.addSong({ id: 'legacy-song', title: 'Legacy Song', artist: 'Seed', genre: '', filePath: join(dir, 'midi-files', 'legacy-song.mid'), difficulty: 1, durationSec: 10, bpm: 120, noteCount: 4, tags: [], trackAssignments: {} });
  db.saveTheoryResult({ type: 'quiz' as never, score: 7, totalQuestions: 10, accuracy: 70 });
  db.setSetting('audit', 'marker', 'checkpointed');
  const raw = (db as unknown as { db: Database.Database }).db;
  raw.pragma('wal_checkpoint(TRUNCATE)');
  raw.pragma('wal_autocheckpoint = 0');
  db.setSetting('audit', 'marker', 'wal-only');
  db.saveTheoryResult({ type: 'quiz' as never, score: 9, totalQuestions: 10, accuracy: 90 });
  for (const ext of ['', '-wal', '-shm']) {
    if (existsSync(join(dir, tmpName + ext))) renameSync(join(dir, tmpName + ext), join(dir, dbName + ext));
  }
  process.kill(process.pid, 'SIGKILL');
  throw new Error('unreachable');
}

function seedWalOnly(dir: string, dbName = 'pianohero.db'): void {
  mkdirSync(dir, { recursive: true });
  const r = spawnSync(process.execPath, [...(LOADER ? ['--import', LOADER] : []), SELF, 'seed-child', dir, dbName], { encoding: 'utf8' });
  if (r.signal !== 'SIGKILL') throw new Error(`seed child did not die by SIGKILL: ${r.status} ${r.stderr}`);
}

/** Read a db set from a scratch copy so inspection never changes the evidence. */
function inspect(dir: string, dbName = 'lumakeys.db') {
  const out: Record<string, unknown> = { entries: existsSync(dir) ? readdirSync(dir).sort() : 'missing' };
  const dbPath = join(dir, dbName);
  if (!existsSync(dbPath)) return out;
  const scratch = join(ROOT, '.inspect', String(Math.random()).slice(2));
  mkdirSync(scratch, { recursive: true });
  for (const ext of ['', '-wal', '-shm']) if (existsSync(dbPath + ext)) copyFileSync(dbPath + ext, join(scratch, 'x.db' + ext));
  const db = new Database(join(scratch, 'x.db'));
  out.marker = (db.prepare("select value from settings where category='audit' and key='marker'").get() as { value?: string } | undefined)?.value;
  out.theoryScores = (db.prepare('select score from theory_results').all() as { score: number }[]).map((r) => r.score).sort();
  out.songs = (db.prepare('select id from songs').all() as { id: string }[]).map((r) => r.id);
  out.integrity = (db.prepare('pragma integrity_check').get() as Record<string, string>).integrity_check;
  db.close();
  return out;
}

function attempt(fn: () => unknown) {
  try { return { ok: true, result: fn() }; } catch (e) { return { ok: false, error: (e as Error).message }; }
}

function fresh(name: string): string {
  const dir = join(ROOT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

const results: Record<string, unknown> = {};
function record(name: string, value: unknown) { results[name] = value; console.log(`CASE ${name} ${JSON.stringify(value)}`); }

function main() {
  // H0: control. A legacy WAL-bearing set, uninterrupted, in both modes.
  {
    const base = fresh('H0-same-dir');
    seedWalOnly(base);
    const before = inspect(base, 'pianohero.db');
    const run = attempt(() => migrateLegacyBrand({ destinationDir: base }));
    record('H0-same-dir-control', { before, run, after: inspect(base) });
  }
  {
    const base = fresh('H0-profile');
    const legacy = join(base, 'PianoHero');
    const dest = join(base, 'lumakeys');
    seedWalOnly(legacy);
    mkdirSync(join(dest, 'Crashpad'), { recursive: true }); // Electron creates this before ready
    const run = attempt(() => migrateLegacyBrand({ destinationDir: dest, legacyDir: legacy }));
    record('H0-profile-control', { run, dest: inspect(dest), legacy: inspect(legacy, 'pianohero.db') });
  }

  // H1: profile move interrupted after midi-files moved; DB set still in the legacy profile.
  {
    const base = fresh('H1');
    const legacy = join(base, 'PianoHero');
    const dest = join(base, 'lumakeys');
    seedWalOnly(legacy);
    mkdirSync(dest, { recursive: true });
    renameSync(join(legacy, 'midi-files'), join(dest, 'midi-files'));
    const run = attempt(() => migrateLegacyBrand({ destinationDir: dest, legacyDir: legacy }));
    record('H1-after-midi-files', { run, dest: inspect(dest), legacy: inspect(legacy, 'pianohero.db') });
  }

  // H2: profile move interrupted after pianohero.db -> dest/lumakeys.db, before -wal and -shm.
  {
    const base = fresh('H2');
    const legacy = join(base, 'PianoHero');
    const dest = join(base, 'lumakeys');
    seedWalOnly(legacy);
    mkdirSync(dest, { recursive: true });
    renameSync(join(legacy, 'midi-files'), join(dest, 'midi-files'));
    renameSync(join(legacy, 'pianohero.db'), join(dest, 'lumakeys.db'));
    const run = attempt(() => migrateLegacyBrand({ destinationDir: dest, legacyDir: legacy }));
    const second = attempt(() => migrateLegacyBrand({ destinationDir: dest, legacyDir: legacy }));
    // What the app does next: open the destination database.
    const appOpen = attempt(() => { const db = new AppDatabase(join(dest, 'lumakeys.db')); db.close(); return 'opened'; });
    record('H2-after-db-before-wal', { run, second, appOpen, dest: inspect(dest), legacyLeft: readdirSync(legacy).sort() });
  }

  // H3: same-directory rename interrupted after pianohero.db -> lumakeys.db, before -wal and -shm.
  {
    const base = fresh('H3');
    seedWalOnly(base);
    renameSync(join(base, 'pianohero.db'), join(base, 'lumakeys.db'));
    const run = attempt(() => migrateLegacyBrand({ destinationDir: base }));
    // Operator follows the message literally: removes the legacy-named file(s).
    const literal = join(ROOT, 'H3-literal-advice');
    rmSync(literal, { recursive: true, force: true });
    cpSync(base, literal, { recursive: true });
    for (const n of ['pianohero.db-wal', 'pianohero.db-shm']) unlinkSync(join(literal, n));
    const literalRun = attempt(() => migrateLegacyBrand({ destinationDir: literal }));
    // Correct manual recovery: finish the rename.
    const manual = join(ROOT, 'H3-manual-finish');
    rmSync(manual, { recursive: true, force: true });
    cpSync(base, manual, { recursive: true });
    renameSync(join(manual, 'pianohero.db-wal'), join(manual, 'lumakeys.db-wal'));
    renameSync(join(manual, 'pianohero.db-shm'), join(manual, 'lumakeys.db-shm'));
    const manualRun = attempt(() => migrateLegacyBrand({ destinationDir: manual }));
    record('H3-same-dir-after-db', {
      run, stateAfterRefusal: readdirSync(base).sort(),
      literalAdvice: { run: literalRun, db: inspect(literal) },
      manualFinish: { run: manualRun, db: inspect(manual) },
    });
  }

  // H4: same-directory rename interrupted after .db and -wal, before -shm.
  {
    const base = fresh('H4');
    seedWalOnly(base);
    renameSync(join(base, 'pianohero.db'), join(base, 'lumakeys.db'));
    renameSync(join(base, 'pianohero.db-wal'), join(base, 'lumakeys.db-wal'));
    const run = attempt(() => migrateLegacyBrand({ destinationDir: base }));
    record('H4-same-dir-before-shm', { run, entries: readdirSync(base).sort(), dbIfShmRemoved: (() => { const c = join(ROOT, 'H4-copy'); rmSync(c, { recursive: true, force: true }); cpSync(base, c, { recursive: true }); unlinkSync(join(c, 'pianohero.db-shm')); return { run: attempt(() => migrateLegacyBrand({ destinationDir: c })), db: inspect(c) }; })() });
  }

  // H5: profile move where the destination already holds a conflicting entry (Local Storage) but no db.
  {
    const base = fresh('H5');
    const legacy = join(base, 'PianoHero');
    const dest = join(base, 'lumakeys');
    seedWalOnly(legacy);
    mkdirSync(join(legacy, 'Local Storage', 'leveldb'), { recursive: true });
    mkdirSync(join(dest, 'Local Storage', 'leveldb'), { recursive: true });
    const first = attempt(() => migrateLegacyBrand({ destinationDir: dest, legacyDir: legacy }));
    const afterFirst = { dest: readdirSync(dest).sort(), legacy: readdirSync(legacy).sort() };
    const second = attempt(() => migrateLegacyBrand({ destinationDir: dest, legacyDir: legacy }));
    record('H5-conflicting-entry', { first, afterFirst, second, afterSecond: { dest: readdirSync(dest).sort(), legacy: readdirSync(legacy).sort() } });
  }
  rmSync(join(ROOT, '.inspect'), { recursive: true, force: true });
}

if (process.argv[2] === 'seed-child') seedChild(process.argv[3], process.argv[4]);
else main();
