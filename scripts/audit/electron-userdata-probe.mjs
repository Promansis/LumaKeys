// Phase 11 lane B probe: which userData directory does the desktop app use, and does
// the legacy brand migration find a pre-rename profile there?
//
// Part 1 runs a throwaway Electron app that repeats the startup sequence of
// src/main/index.ts (pin userData before ready -> setName -> whenReady -> migrateLegacyBrand
// over legacyProfileDirs) with the real code bundled from src/, once per package name.
// Case E6 runs the startup error boundary (runDesktopStartup) against a refusal and checks the exit code.
// Part 2 (optional, --packaged) launches dist/linux-unpacked/lumakeys against seeded profiles. The packaged
// app takes the single-instance lock, which needs a Unix socket; a sandbox that blocks socket() aborts it.
// --harness runs the same cases against the built out/ through scripts/audit/electron/launcher.cjs,
// which stubs that lock and keeps windows offscreen.
// Before the PH-DATA-005 fix part 1 repeated the old sequence (setName inside whenReady,
// one legacy directory, `<appData>/PianoHero`); its output is kept in the Phase 11 lane B
// evidence.
//
// Every Electron run gets its own HOME and XDG_* under PROBE_ROOT, so ~/.config is never
// read or written. Requires a headless-capable Electron (uses --ozone-platform=headless).
// Part 1 loads better-sqlite3 inside Electron, so LK_SQLITE_MODULE must point at an
// Electron-ABI copy (see scripts/audit/electron/README.md).
//
// Run: LK_SQLITE_MODULE=<dir> PROBE_ROOT=<dir under $TMPDIR> node scripts/audit/electron-userdata-probe.mjs
//        [--packaged | --packaged-only] [--harness | --harness-only]
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
  // TMPDIR keeps Chromium's single-instance socket directory out of the shared /tmp.
  const env = { PATH: process.env.PATH, TMPDIR: tmpdir(), HOME: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_CACHE_HOME: join(home, '.cache'), XDG_DATA_HOME: join(home, '.local', 'share') };
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

/** The real AppDatabase bundled from src/, loading the repository's Node-ABI better-sqlite3. */
function loadAppDatabase() {
  const esbuild = require('esbuild');
  const out = join(ROOT, 'database.cjs');
  esbuild.buildSync({ entryPoints: [join(REPO, 'src/persistence/database.ts')], bundle: true, platform: 'node', format: 'cjs', outfile: out, external: ['better-sqlite3'], nodePaths: [join(REPO, 'node_modules')], logLevel: 'silent' });
  writeFileSync(out, readFileSync(out, 'utf8').replaceAll('require("better-sqlite3")', `require(${JSON.stringify(join(REPO, 'node_modules', 'better-sqlite3'))})`));
  return require(out).AppDatabase;
}

/** A legacy profile whose database holds one song and theory score 7, plus score 9 committed only in the WAL. */
function seedWalOnlyLegacyProfile(dir) {
  const AppDatabase = loadAppDatabase();
  mkdirSync(join(dir, 'midi-files'), { recursive: true });
  writeFileSync(join(dir, 'midi-files', 'legacy-song.mid'), 'MThd-legacy');
  const seed = join(dir, 'seed.db');
  const db = new AppDatabase(seed);
  db.addSong({ id: 'legacy-song', title: 'Legacy Song', artist: '', genre: '', filePath: join(dir, 'midi-files', 'legacy-song.mid'), difficulty: 1, durationSec: 10, bpm: 120, noteCount: 4, tags: [], trackAssignments: {} });
  db.saveTheoryResult({ type: 'quiz', score: 7, totalQuestions: 10, accuracy: 70 });
  db.db.pragma('wal_checkpoint(TRUNCATE)');
  db.db.pragma('wal_autocheckpoint = 0');
  db.saveTheoryResult({ type: 'quiz', score: 9, totalQuestions: 10, accuracy: 90 });
  for (const ext of ['', '-wal', '-shm']) copyFileSync(seed + ext, join(dir, 'pianohero.db' + ext));
  db.close();
  for (const ext of ['', '-wal', '-shm']) rmSync(seed + ext, { force: true });
}

async function partOne() {
  const esbuild = require('esbuild');
  const sqlite = process.env.LK_SQLITE_MODULE;
  if (!sqlite) throw new Error('LK_SQLITE_MODULE must point at an Electron-ABI better-sqlite3 directory');
  const bundle = join(ROOT, 'startup.cjs');
  esbuild.buildSync({
    stdin: { contents: "export { migrateLegacyBrand, legacyProfileDirs } from './src/persistence/legacyBrandMigration'; export { desktopProfileDir, runDesktopStartup } from './src/main/desktopStartup';", resolveDir: REPO, loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle, external: ['better-sqlite3', 'electron'], logLevel: 'silent',
  });
  writeFileSync(bundle, readFileSync(bundle, 'utf8').replaceAll('require("better-sqlite3")', `require(${JSON.stringify(resolve(sqlite))})`));
  const main = `
const { app } = require('electron');
const fs = require('node:fs');
const { migrateLegacyBrand, legacyProfileDirs, desktopProfileDir } = require(${JSON.stringify(bundle)});
const nameAtLoad = app.name;
app.setPath('userData', desktopProfileDir(app.getPath('appData')));   // src/main/index.ts, module top level
app.setName('LumaKeys');
app.whenReady().then(() => {
  const out = { packageName: require('./package.json').name, nameAtLoad, nameAtReady: app.name };
  app.setAppUserModelId('com.lumakeys.app');
  const userData = app.getPath('userData');
  out.userData = userData;
  out.userDataBefore = fs.readdirSync(userData).sort();
  out.legacyDirsChecked = legacyProfileDirs(app.getPath('appData'));
  try { out.migration = migrateLegacyBrand({ destinationDir: userData, legacyDirs: out.legacyDirsChecked }); }
  catch (e) { out.migration = { error: e.message }; }
  out.userDataAfter = fs.readdirSync(userData).sort();
  out.appDataAfter = fs.readdirSync(app.getPath('appData')).sort();
  out.wouldOpen = require('node:path').join(userData, 'lumakeys.db');
  out.wouldOpenExists = fs.existsSync(out.wouldOpen);
  console.log('PROBE_RESULT ' + JSON.stringify(out));
  app.quit();
});`;
  // E6 (PH-OPS-006): the startup error boundary of src/main/index.ts with a real refusal and the real
  // app.exit. Headless Electron has no display for dialog.showErrorBox, so the dialog is replaced by a log line.
  const failureMain = `
const { app } = require('electron');
const { migrateLegacyBrand, legacyProfileDirs, desktopProfileDir, runDesktopStartup } = require(${JSON.stringify(bundle)});
app.setPath('userData', desktopProfileDir(app.getPath('appData')));
app.setName('LumaKeys');
app.whenReady().then(() => runDesktopStartup(async () => {
  migrateLegacyBrand({ destinationDir: app.getPath('userData'), legacyDirs: legacyProfileDirs(app.getPath('appData')) });
  console.log('PROBE_UNEXPECTED startup continued');
}, {
  showError: (title, content) => console.log('PROBE_SHOW_ERROR ' + JSON.stringify({ title, content })),
  exit: (code) => app.exit(code),
}));`;
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
    { id: 'E6', pkg: 'lumakeys', seed: ['luma-keys', 'piano-hero'], main: failureMain },
  ];
  for (const c of cases) {
    const caseRoot = join(ROOT, c.id);
    rmSync(caseRoot, { recursive: true, force: true });
    const appDir = join(caseRoot, 'app');
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, 'package.json'), JSON.stringify({ name: c.pkg, version: '0.1.0', main: 'main.cjs' }));
    writeFileSync(join(appDir, 'main.cjs'), c.main ?? main);
    const env = isolatedEnv(join(caseRoot, 'home'));
    for (const s of c.seed) seedLegacyProfile(join(env.XDG_CONFIG_HOME, s));
    const r = await run(ELECTRON, [...FLAGS, appDir], env, { killAfterMs: 30000, until: () => false });
    const line = r.out.split('\n').find((l) => l.startsWith('PROBE_RESULT '));
    const res = { case: c.id, seededLegacyProfiles: c.seed, exit: r.code ?? r.signal, result: line ? JSON.parse(line.slice(13)) : r.out.slice(-800) };
    if (c.main) {
      const shown = r.out.split('\n').find((l) => l.startsWith('PROBE_SHOW_ERROR '));
      Object.assign(res, {
        elapsedMs: r.elapsedMs, stillRunningWhenProbeSentSigterm: r.killedByProbe,
        shownError: shown ? JSON.parse(shown.slice(17)) : null,
        startupContinued: r.out.includes('PROBE_UNEXPECTED'),
        loggedFailure: r.out.includes('LumaKeys startup failed:'),
        result: undefined,
      });
    }
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

/** The packaged build in dist/linux-unpacked, launched as a user would. */
function packagedLauncher() {
  const bin = join(REPO, 'dist', 'linux-unpacked', 'lumakeys');
  if (!existsSync(bin)) return { label: 'PACKAGED', skip: 'no dist/linux-unpacked build' };
  const asar = require('@electron/asar');
  const pkg = JSON.parse(asar.extractFile(join(REPO, 'dist/linux-unpacked/resources/app.asar'), 'package.json').toString());
  return { label: 'PACKAGED', pkg, launch: (env, _home, opts) => run(bin, FLAGS, env, opts) };
}

/**
 * The built out/ through the audit launcher (scripts/audit/electron/launcher.cjs), which
 * stubs the single-instance lock where the sandbox denies its Unix socket. Headless
 * Electron has no display for native dialogs, so a preload replaces them with log lines
 * (the question dialog answers Quit, its cancel button).
 */
function harnessLauncher() {
  if (!existsSync(join(REPO, 'out', 'main', 'index.js'))) return { label: 'HARNESS', skip: 'no out/ build' };
  const sqlite = process.env.LK_SQLITE_MODULE;
  if (!sqlite) throw new Error('LK_SQLITE_MODULE must point at an Electron-ABI better-sqlite3 directory');
  const preload = join(ROOT, 'harness-dialogs.cjs');
  writeFileSync(preload, `const { dialog } = require('electron');
dialog.showErrorBox = (title, content) => console.log('PROBE_SHOW_ERROR ' + JSON.stringify({ title, content }));
dialog.showMessageBoxSync = (options) => {
  console.log('PROBE_QUESTION ' + JSON.stringify({ message: options.message, buttons: options.buttons }));
  return options.cancelId ?? 0;
};
`);
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'));
  const app = join(REPO, 'scripts', 'audit', 'electron');
  return {
    label: 'HARNESS', pkg,
    launch: (env, home, opts) => run(ELECTRON, ['-r', preload, app, ...FLAGS], { ...env, LK_PROFILE: home, LK_SQLITE_MODULE: resolve(sqlite) }, opts),
  };
}

function shownError(out) {
  const line = out.split('\n').find((l) => l.startsWith('PROBE_SHOW_ERROR '));
  return line ? JSON.parse(line.slice(17)) : null;
}

async function partTwo(launcher) {
  const { label, pkg, launch, skip } = launcher;
  if (skip) { console.log(`${label} skipped: ${skip}`); return; }

  // P1: a profile written by the pre-rename build (package name luma-keys) and a first launch of the current build.
  // The legacy database holds one song and theory scores 7 and 9, the 9 committed only in its WAL.
  {
    const caseRoot = join(ROOT, 'P1');
    rmSync(caseRoot, { recursive: true, force: true });
    const env = isolatedEnv(join(caseRoot, 'home'));
    const legacy = join(env.XDG_CONFIG_HOME, 'luma-keys');
    seedWalOnlyLegacyProfile(legacy);
    const legacyBefore = inspectDb(join(legacy, 'pianohero.db'), caseRoot);
    const newDb = join(env.XDG_CONFIG_HOME, 'lumakeys', 'lumakeys.db');
    const r = await launch(env, join(caseRoot, 'home'), { killAfterMs: 40000, until: () => existsSync(newDb) });
    console.log(`${label} ` + JSON.stringify({
      case: 'P1', packageName: pkg.name, productName: pkg.productName ?? null, exit: r.code ?? r.signal,
      configDirs: readdirSync(env.XDG_CONFIG_HOME).sort(),
      newProfile: readdirSync(join(env.XDG_CONFIG_HOME, 'lumakeys')).sort(),
      newDb: inspectDb(newDb, caseRoot),
      legacyDbBefore: legacyBefore,
      legacyProfile: readdirSync(legacy).sort(),
      legacyDb: inspectDb(join(legacy, 'pianohero.db'), caseRoot),
    }));
  }

  // P2: the migration refuses: two earlier profiles (luma-keys and piano-hero) both hold pianohero.db.
  // What does the desktop user see? (Headless Electron has no display for the error dialog.)
  {
    const caseRoot = join(ROOT, 'P2');
    rmSync(caseRoot, { recursive: true, force: true });
    const env = isolatedEnv(join(caseRoot, 'home'));
    for (const name of ['luma-keys', 'piano-hero']) seedLegacyProfile(join(env.XDG_CONFIG_HOME, name));
    const profile = join(env.XDG_CONFIG_HOME, 'lumakeys');
    const r = await launch(env, join(caseRoot, 'home'), { killAfterMs: 12000 });
    console.log(`${label} ` + JSON.stringify({
      case: 'P2', exit: r.code ?? r.signal, elapsedMs: r.elapsedMs, stillRunningWhenProbeSentSigterm: r.killedByProbe,
      shownError: shownError(r.out),
      profileAfter: existsSync(profile) ? readdirSync(profile).sort() : 'missing',
      legacyAfter: Object.fromEntries(['luma-keys', 'piano-hero'].map((n) => [n, readdirSync(join(env.XDG_CONFIG_HOME, n)).sort()])),
      rendererStarted: existsSync(join(profile, 'Local Storage')),
      relevantOutput: r.out.split('\n').filter((l) => /Both|Unhandled|unhandled|Error: |startup failed|earlier libraries|Gtk-ERROR/.test(l) && !/bus\.cc/.test(l)).slice(0, 4),
    }));
  }

  // P4: the original P2 fixture, the PH-OPS-006 route: an empty lumakeys.db from the current build and a
  // pianohero.db copied in beside it. The empty database is now set aside and replaced.
  {
    const caseRoot = join(ROOT, 'P4');
    rmSync(caseRoot, { recursive: true, force: true });
    const env = isolatedEnv(join(caseRoot, 'home'));
    const profile = join(env.XDG_CONFIG_HOME, 'lumakeys');
    seedLegacyProfile(profile);
    const Database = require('better-sqlite3');
    const db = new Database(join(profile, 'lumakeys.db'));
    db.exec('create table audit_marker (v text)');
    db.close();
    const newDb = join(profile, 'lumakeys.db');
    const r = await launch(env, join(caseRoot, 'home'), { killAfterMs: 40000, until: () => existsSync(join(profile, 'Local Storage')) });
    const backups = readdirSync(profile).filter((n) => n.startsWith('before-legacy-migration-'));
    console.log(`${label} ` + JSON.stringify({
      case: 'P4', exit: r.code ?? r.signal, stillRunningWhenProbeSentSigterm: r.killedByProbe,
      profileAfter: readdirSync(profile).sort(),
      newDb: inspectDb(newDb, caseRoot),
      backups: Object.fromEntries(backups.map((b) => [b, { entries: readdirSync(join(profile, b)).sort(), db: inspectDb(join(profile, b, 'lumakeys.db'), caseRoot) }])),
      relevantOutput: r.out.split('\n').filter((l) => /Both|Unhandled|unhandled|Error: |startup failed/.test(l) && !/bus\.cc/.test(l)).slice(0, 4),
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
    const r = await launch(env, join(caseRoot, 'home'), { killAfterMs: 40000, until: () => existsSync(newDb) });
    const Database = require('better-sqlite3');
    const scratch = join(caseRoot, 'inspect');
    mkdirSync(scratch);
    for (const ext of ['', '-wal', '-shm']) if (existsSync(newDb + ext)) copyFileSync(newDb + ext, join(scratch, 'x.db' + ext));
    const db = new Database(join(scratch, 'x.db'), { readonly: true });
    const row = db.prepare('select id, title, file_path from songs where id = ?').get(id);
    db.close();
    const stored = join(profile, 'midi-files', `${id}.mid`);
    console.log(`${label} ` + JSON.stringify({
      case: 'P3', exit: r.code ?? r.signal, songTitle: row?.title ?? null,
      filePathIsAppOwned: row ? row.file_path === stored : null,
      storedBytesMatch: existsSync(stored) ? readFileSync(stored).equals(bytes) : false,
      profileAfter: readdirSync(profile).sort(),
    }));
  }
}

mkdirSync(ROOT, { recursive: true });
// --packaged-only and --harness-only skip part 1, e.g. to run the P cases against a build from before the fix.
const args = process.argv.slice(2);
if (!args.some((a) => a.endsWith('-only'))) await partOne();
if (args.includes('--packaged') || args.includes('--packaged-only')) await partTwo(packagedLauncher());
if (args.includes('--harness') || args.includes('--harness-only')) await partTwo(harnessLauncher());
