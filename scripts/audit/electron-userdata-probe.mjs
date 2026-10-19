// Phase 11 lane B probe: which userData directory does the desktop app use, and does
// the legacy brand migration find a pre-rename profile there?
//
// Part 1 runs a throwaway Electron app that repeats the exact startup sequence of
// src/main/index.ts (whenReady -> setName -> getPath('userData') -> migrateLegacyBrand)
// with the real migration bundled from src/, once per package name. Part 2 (optional,
// --packaged) launches dist/linux-unpacked/lumakeys against a seeded legacy profile.
//
// Every Electron run gets its own HOME and XDG_* under PROBE_ROOT, so ~/.config is never
// read or written. Requires a headless-capable Electron (uses --ozone-platform=headless).
//
// Run: node scripts/audit/electron-userdata-probe.mjs [--packaged]
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(REPO, 'package.json'));
const ROOT = resolve(process.env.PROBE_ROOT ?? join(tmpdir(), 'p11', 'B', 'electron-userdata'));
if (!ROOT.startsWith(resolve(tmpdir()))) throw new Error(`PROBE_ROOT must be under ${tmpdir()}`);
const ELECTRON = join(REPO, 'node_modules', 'electron', 'dist', 'electron');
const FLAGS = ['--no-sandbox', '--disable-gpu', '--ozone-platform=headless'];

function isolatedEnv(home) {
  const env = { PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_CACHE_HOME: join(home, '.cache'), XDG_DATA_HOME: join(home, '.local', 'share') };
  for (const k of ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME']) mkdirSync(env[k], { recursive: true });
  return env;
}

function run(cmd, args, env, { killAfterMs, until } = {}) {
  return new Promise((done) => {
    const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const t0 = Date.now();
    let out = '';
    let killedByProbe = false;
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    let timer;
    if (killAfterMs) {
      const started = Date.now();
      timer = setInterval(() => {
        if ((until && until()) || Date.now() - started > killAfterMs) { clearInterval(timer); setTimeout(() => { killedByProbe = true; child.kill('SIGTERM'); }, until ? 3000 : 0); }
      }, 250);
    }
    const hard = setTimeout(() => child.kill('SIGKILL'), (killAfterMs ?? 30000) + 15000);
    child.on('exit', (code, signal) => { clearInterval(timer); clearTimeout(hard); done({ code, signal, out, elapsedMs: Date.now() - t0, killedByProbe }); });
  });
}

function seedLegacyProfile(dir) {
  // Minimal legacy profile: a SQLite file under the legacy name plus one MIDI file.
  const Database = require('better-sqlite3');
  mkdirSync(join(dir, 'midi-files'), { recursive: true });
  writeFileSync(join(dir, 'midi-files', 'legacy-song.mid'), 'MThd-legacy');
  const db = new Database(join(dir, 'pianohero.db'));
  db.exec("create table audit_marker (v text); insert into audit_marker values ('legacy-practice-history')");
  db.close();
}

function listTree(dir) {
  if (!existsSync(dir)) return 'missing';
  return Object.fromEntries(readdirSync(dir).sort().map((n) => [n, existsSync(join(dir, n)) ? readdirSync(join(dir, n), { withFileTypes: true }).length >= 0 && (existsSync(join(dir, n, '.')) ? 'dir-or-file' : 'file') : '?']));
}

async function partOne() {
  const esbuild = require('esbuild');
  const bundle = join(ROOT, 'legacyBrandMigration.cjs');
  esbuild.buildSync({ entryPoints: [join(REPO, 'src/persistence/legacyBrandMigration.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: bundle, logLevel: 'silent' });
  const main = `
const { app } = require('electron');
const fs = require('node:fs');
const { migrateLegacyBrand, defaultLegacyProfileDir } = require(${JSON.stringify(bundle)});
app.whenReady().then(() => {
  const out = { packageName: require('./package.json').name, nameAtReady: app.name };
  app.setName('LumaKeys');                         // src/main/index.ts, inside whenReady
  app.setAppUserModelId('com.lumakeys.app');
  out.nameAfterSetName = app.name;
  const userData = app.getPath('userData');
  out.userData = userData;
  out.userDataBefore = fs.readdirSync(userData).sort();
  out.legacyDirChecked = defaultLegacyProfileDir(app.getPath('appData'));
  try { out.migration = migrateLegacyBrand({ destinationDir: userData, legacyDir: out.legacyDirChecked }); }
  catch (e) { out.migration = { error: e.message }; }
  out.userDataAfter = fs.readdirSync(userData).sort();
  out.appDataAfter = fs.readdirSync(app.getPath('appData')).sort();
  out.wouldOpen = require('node:path').join(userData, 'lumakeys.db');
  out.wouldOpenExists = fs.existsSync(out.wouldOpen);
  console.log('PROBE_RESULT ' + JSON.stringify(out));
  app.quit();
});`;
  const results = [];
  // Package names shipped by released builds, from git history of package.json:
  //   piano-hero (to 2026-04-27), luma-keys (2026-04-29 to 2026-08-07), lumakeys (current).
  // Legacy profiles are seeded where each earlier build would have written them.
  const cases = [
    { id: 'E1', pkg: 'lumakeys', seed: ['luma-keys'] },
    { id: 'E2', pkg: 'lumakeys', seed: ['piano-hero'] },
    { id: 'E3', pkg: 'lumakeys', seed: ['PianoHero'] },
    { id: 'E4', pkg: 'luma-keys', seed: [] },
    { id: 'E5', pkg: 'piano-hero', seed: [] },
  ];
  for (const c of cases) {
    const caseRoot = join(ROOT, c.id);
    rmSync(caseRoot, { recursive: true, force: true });
    const appDir = join(caseRoot, 'app');
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: c.pkg, version: '0.1.0', main: 'main.cjs' }));
    writeFileSync(join(appDir, 'main.cjs'), main);
    const env = isolatedEnv(join(caseRoot, 'home'));
    for (const s of c.seed) seedLegacyProfile(join(env.XDG_CONFIG_HOME, s));
    const r = await run(ELECTRON, [...FLAGS, appDir], env, { killAfterMs: 30000, until: () => false });
    const line = r.out.split('\n').find((l) => l.startsWith('PROBE_RESULT '));
    const res = { case: c.id, seededLegacyProfiles: c.seed, exit: r.code ?? r.signal, result: line ? JSON.parse(line.slice(13)) : r.out.slice(-800) };
    for (const s of c.seed) res[`legacy:${s}`] = readdirSync(join(env.XDG_CONFIG_HOME, s)).sort();
    console.log('CASE ' + JSON.stringify(res));
    results.push(res);
  }
  return results;
}

function inspectDb(file, scratchRoot) {
  const require2 = createRequire(join(REPO, 'package.json'));
  const Database = require2('better-sqlite3');
  if (!existsSync(file)) return 'missing';
  const scratch = join(scratchRoot, 'inspect-' + Math.random().toString(36).slice(2));
  mkdirSync(scratch);
  for (const ext of ['', '-wal', '-shm']) if (existsSync(file + ext)) copyFileSync(file + ext, join(scratch, 'x.db' + ext));
  const db = new Database(join(scratch, 'x.db'), { readonly: true });
  const tables = db.prepare("select name from sqlite_master where type='table' order by name").all().map((t) => t.name);
  const counts = {};
  for (const t of ['songs', 'game_results', 'theory_results', 'audit_marker']) if (tables.includes(t)) counts[t] = db.prepare(`select count(*) n from ${t}`).get().n;
  db.close();
  return { tables: tables.length, counts };
}

async function partTwo() {
  const bin = join(REPO, 'dist', 'linux-unpacked', 'lumakeys');
  if (!existsSync(bin)) { console.log('PACKAGED skipped: no dist/linux-unpacked build'); return; }
  const asar = require('@electron/asar');
  const pkg = JSON.parse(asar.extractFile(join(REPO, 'dist/linux-unpacked/resources/app.asar'), 'package.json').toString());

  // P1: a profile written by the pre-rename build (package name luma-keys) and a first launch of the current build.
  {
    const caseRoot = join(ROOT, 'P1');
    rmSync(caseRoot, { recursive: true, force: true });
    const env = isolatedEnv(join(caseRoot, 'home'));
    const legacy = join(env.XDG_CONFIG_HOME, 'luma-keys');
    seedLegacyProfile(legacy);
    const newDb = join(env.XDG_CONFIG_HOME, 'lumakeys', 'lumakeys.db');
    const r = await run(bin, FLAGS, env, { killAfterMs: 40000, until: () => existsSync(newDb) });
    console.log('PACKAGED ' + JSON.stringify({
      case: 'P1', asarPackageName: pkg.name, asarProductName: pkg.productName ?? null, exit: r.code ?? r.signal,
      configDirs: readdirSync(env.XDG_CONFIG_HOME).sort(),
      newProfile: readdirSync(join(env.XDG_CONFIG_HOME, 'lumakeys')).sort(),
      newDb: inspectDb(newDb, caseRoot),
      legacyProfile: readdirSync(legacy).sort(),
      legacyDb: inspectDb(join(legacy, 'pianohero.db'), caseRoot),
    }));
  }

  // P2: the migration refuses (both database names in the profile). What does the desktop user see?
  {
    const caseRoot = join(ROOT, 'P2');
    rmSync(caseRoot, { recursive: true, force: true });
    const env = isolatedEnv(join(caseRoot, 'home'));
    const profile = join(env.XDG_CONFIG_HOME, 'lumakeys');
    seedLegacyProfile(profile);
    const Database = require('better-sqlite3');
    const db = new Database(join(profile, 'lumakeys.db'));
    db.exec('create table audit_marker (v text)');
    db.close();
    const r = await run(bin, FLAGS, env, { killAfterMs: 12000 });
    console.log('PACKAGED ' + JSON.stringify({
      case: 'P2', exit: r.code ?? r.signal, elapsedMs: r.elapsedMs, stillRunningWhenProbeSentSigterm: r.killedByProbe,
      profileAfter: readdirSync(profile).sort(),
      rendererStarted: existsSync(join(profile, 'Local Storage')),
      relevantOutput: r.out.split('\n').filter((l) => /Both|Unhandled|unhandled|Error: /.test(l) && !/bus\.cc/.test(l)).slice(0, 4),
    }));
  }

  // P3: PH-PAR-003 desktop half. A supported legacy song-metadata.json in the profile is migrated at startup.
  {
    const caseRoot = join(ROOT, 'P3');
    rmSync(caseRoot, { recursive: true, force: true });
    const env = isolatedEnv(join(caseRoot, 'home'));
    const profile = join(env.XDG_CONFIG_HOME, 'lumakeys');
    mkdirSync(profile, { recursive: true });
    const { Midi } = require('@tonejs/midi');
    const midi = new Midi();
    midi.addTrack().addNote({ midi: 62, time: 0, duration: 0.5, velocity: 0.8 });
    const bytes = Buffer.from(midi.toArray());
    const id = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(join(caseRoot, 'source.mid'), bytes);
    writeFileSync(join(profile, 'song-metadata.json'), JSON.stringify({ songs: { [id]: { title: 'Legacy JSON song', sourcePath: join(caseRoot, 'source.mid'), trackAssignments: {}, updatedAt: '2026-07-30T00:00:00.000Z' } } }));
    const newDb = join(profile, 'lumakeys.db');
    const r = await run(bin, FLAGS, env, { killAfterMs: 40000, until: () => existsSync(newDb) });
    const Database = require('better-sqlite3');
    const scratch = join(caseRoot, 'inspect');
    mkdirSync(scratch);
    for (const ext of ['', '-wal', '-shm']) if (existsSync(newDb + ext)) copyFileSync(newDb + ext, join(scratch, 'x.db' + ext));
    const db = new Database(join(scratch, 'x.db'), { readonly: true });
    const row = db.prepare('select id, title, file_path from songs where id = ?').get(id);
    db.close();
    const stored = join(profile, 'midi-files', `${id}.mid`);
    console.log('PACKAGED ' + JSON.stringify({
      case: 'P3', exit: r.code ?? r.signal, songTitle: row?.title ?? null,
      filePathIsAppOwned: row ? row.file_path === stored : null,
      storedBytesMatch: existsSync(stored) ? readFileSync(stored).equals(bytes) : false,
      profileAfter: readdirSync(profile).sort(),
    }));
  }
}

mkdirSync(ROOT, { recursive: true });
await partOne();
if (process.argv.includes('--packaged')) await partTwo();
