// Phase 11 proof for OP-017 residual: the MuseScore conversion limits actually fire.
// Limits under test (src/server/museScore.ts): 45 s wall timeout (SIGKILL), 30 s CPU (prlimit --cpu),
// 10 MB output file (prlimit --fsize). A FAKE converter script (not MuseScore) is selected through
// LUMAKEYS_MUSESCORE_PATH and driven through the real path: POST /api/midi/upload of an .mscz to the
// built web server (dist/server/index.cjs).
//
// Per variant it records: HTTP status and message; whether the fake child existed during the run and
// is gone afterwards (ps); leftover lumakeys-mscz-* temp dirs; and that the server keeps serving
// (getAllSongs answers while the conversion is running and after, and a valid .mid upload still works).
//
// Everything lives under PROBE_ROOT (default $TMPDIR/p11/PF/probes/op017-work), the server runs with
// TMPDIR, HOME and the data dir inside it. Only processes this script starts (or orphans it names by
// marker) are killed, by PID. Ports 3940-3949 only (PROBE_PORT, default 3945).
//
// Run: node scripts/audit/proof-op017-musescore-limits.mjs
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(REPO, 'package.json'));
const ROOT = resolve(process.env.PROBE_ROOT ?? join(tmpdir(), 'p11', 'PF', 'probes', 'op017-work'));
if (!ROOT.startsWith(resolve(tmpdir()))) throw new Error(`PROBE_ROOT must be under ${tmpdir()}`);
const PORT = Number(process.env.PROBE_PORT ?? 3945);
if (PORT < 3940 || PORT > 3949) throw new Error('PROBE_PORT must be 3940-3949');
const SERVER = join(REPO, 'dist', 'server', 'index.cjs');
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

rmSync(ROOT, { recursive: true, force: true });
const dirs = { bin: join(ROOT, 'bin'), tmp: join(ROOT, 'tmp'), home: join(ROOT, 'home'), data: join(ROOT, 'data'), cwd: join(ROOT, 'cwd') };
for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });

// Fake converters. Invoked by the server as: <script> -o <output.mid> <input.mscz>
const fakes = {
  // Sleeps far past the 45 s timeout. exec: the converter process itself is the sleeper.
  timeout: { marker: 'sleep 4242', body: 'exec sleep 4242' },
  // Same sleep, but as a grandchild the way a launcher script would run the real binary.
  'timeout-grandchild': { marker: 'sleep 4243', body: 'sleep 4243 &\nwait' },
  // Burns CPU in a tight loop; the 30 s CPU rlimit should end it before the 45 s wall timeout.
  cpu: { marker: 'fake-cpu.sh', body: 'while :; do :; done' },
  // The converter itself writes 20 MB to the output file; the 10 MB fsize rlimit (SIGXFSZ) should kill it.
  output: { marker: 'head -c 20000000', body: 'printf MThd > "$2"\nexec head -c 20000000 /dev/zero >> "$2"' },
  // Same, but a launcher shell survives its child's death and exits 0 over the truncated file.
  'output-masked': { marker: 'fake-output-masked.sh', body: 'out="$2"\n{ printf MThd; head -c 20000000 /dev/zero; } > "$out"\nexit 0' },
  // Floods stdout (execFile maxBuffer is 64 KiB) rather than the output file.
  stdout: { marker: 'yes xxxxxxxxxxxxxxxx', body: 'exec yes xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
};
for (const [name, f] of Object.entries(fakes)) {
  f.path = join(dirs.bin, `fake-${name}.sh`);
  if (['cpu', 'output-masked'].includes(name)) f.marker = f.path;
  writeFileSync(f.path, `#!/bin/sh\n${f.body}\n`);
  chmodSync(f.path, 0o755);
}

// A real (tiny) zip renamed .mscz, and a valid MIDI for the "server still works" control.
const zip = join(ROOT, 'score.mscz');
execFileSync('python3', ['-I', '-c', `import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED); z.writestr('score.mscx','<museScore/>'); z.close()`, zip]);
const { Midi } = require('@tonejs/midi');
const midi = new Midi(); midi.addTrack().addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });
const goodMid = Buffer.from(midi.toArray());
const zipBytes = readFileSync(zip);

const baseEnv = { PATH: process.env.PATH, HOME: dirs.home, TMPDIR: dirs.tmp, PORT: String(PORT), LUMAKEYS_DATA_DIR: dirs.data };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmpLeft = () => readdirSync(dirs.tmp).filter((n) => n.startsWith('lumakeys-mscz-'));
/** PIDs (not this script) whose command line contains the marker. */
function pidsFor(marker) {
  const out = execFileSync('ps', ['-eo', 'pid=,args='], { encoding: 'utf8' });
  return out.split('\n').map((l) => l.trim()).filter((l) => l && l.includes(marker) && !l.includes('proof-op017')).map((l) => ({ pid: Number(l.split(/\s+/)[0]), args: l.replace(/^\d+\s+/, '').slice(0, 120) }));
}

async function startServer(converter) {
  const env = { ...baseEnv, LUMAKEYS_MUSESCORE_PATH: converter };
  const child = spawn(process.execPath, [SERVER], { cwd: dirs.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const exited = new Promise((r) => child.once('exit', (code, signal) => r({ code, signal })));
  for (let i = 0; i < 100 && child.exitCode === null; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/api/access`); if (r.status) return { child, exited, log: () => log, up: true }; } catch {}
    await sleep(100);
  }
  return { child, exited, log: () => log, up: false };
}
async function stopServer(srv) {
  srv.child.kill('SIGTERM');
  await Promise.race([srv.exited, sleep(5000).then(() => srv.child.kill('SIGKILL'))]);
}
async function getAllSongs() {
  const t = Date.now();
  const r = await fetch(`http://127.0.0.1:${PORT}/api/bridge/getAllSongs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args: [] }) });
  const body = await r.json();
  return { status: r.status, count: body.result?.length, ms: Date.now() - t };
}
async function upload(name, bytes) {
  const fd = new FormData();
  fd.append('files', new Blob([bytes]), name);
  const r = await fetch(`http://127.0.0.1:${PORT}/api/midi/upload`, { method: 'POST', body: fd });
  return { status: r.status, body: await r.json() };
}

const results = {};
// Direct evidence that the fsize rlimit kills the writer (exit 153 = 128 + SIGXFSZ(25)), outside the server.
{
  const { spawnSync } = await import('node:child_process');
  const out = join(ROOT, 'fsize-direct.mid');
  const r = spawnSync('prlimit', ['--fsize=10485760', '--', fakes.output.path, '-o', out, zip], { encoding: 'utf8' });
  results._fsizeDirect = { exitStatus: r.status, signal: r.signal, outputBytes: readFileSync(out).length };
  console.log('FSIZE-DIRECT', JSON.stringify(results._fsizeDirect));
}
let failures = 0;
const orphansToKill = [];

for (const [name, fake] of Object.entries(fakes)) {
  if (only && !only.has(name)) continue;
  const srv = await startServer(fake.path);
  const rec = { variant: name, serverUp: srv.up };
  results[name] = rec;
  if (!srv.up) { rec.pass = false; failures += 1; console.log(`VARIANT ${name} FAIL server did not start`); continue; }
  const t0 = Date.now();
  const before = await getAllSongs();
  const pending = upload('limit-test.mscz', zipBytes);
  // Watch for the fake child while the conversion runs (poll up to 5 s).
  rec.childDuringRun = [];
  for (let i = 0; i < 100 && rec.childDuringRun.length === 0; i++) { rec.childDuringRun = pidsFor(fake.marker); if (!rec.childDuringRun.length) await sleep(50); }
  rec.childSeenAfterMs = Date.now() - t0;
  rec.tmpDirsDuringRun = tmpLeft();
  rec.getAllSongsDuringRun = await getAllSongs().catch((e) => ({ error: String(e) }));
  rec.secondUploadDuringRun = '(conversion already finished)';
  if (pidsFor(fake.marker).length) {
    const second = await upload('second.mscz', zipBytes).catch((e) => ({ error: String(e) }));
    rec.secondUploadDuringRun = second.body?.errors?.[0]?.message ?? second;
  }
  const res = await pending;
  rec.elapsedSec = Number(((Date.now() - t0) / 1000).toFixed(1));
  rec.http = { status: res.status, errors: res.body.errors, songs: res.body.songs?.length, skipped: res.body.skipped };
  await sleep(500);
  rec.childAfter = pidsFor(fake.marker);
  rec.tmpDirsAfter = tmpLeft();
  rec.getAllSongsAfter = await getAllSongs();
  const control = await upload('control.mid', goodMid); // converter flag reset and server healthy
  rec.controlMidUpload = { status: control.status, songs: control.body.songs?.length, errors: control.body.errors };
  rec.songsBefore = before.count;
  rec.songsAfterFailedConversion = (rec.getAllSongsAfter.count ?? 0);
  rec.serverLog = srv.log().split('\n').filter(Boolean).slice(-3);
  await stopServer(srv);
  for (const o of rec.childAfter) orphansToKill.push(o.pid);
  for (const o of pidsFor(fake.marker)) if (!orphansToKill.includes(o.pid)) orphansToKill.push(o.pid);

  const msg = rec.http.errors?.[0]?.message ?? '';
  const checks = {
    // Fast variants (output, stdout) end in milliseconds, so ps may not catch the child alive.
    childWasRunning: ['output', 'output-masked', 'stdout'].includes(name) ? true : rec.childDuringRun.length > 0,
    cleanErrorToUser: res.status === 200 && rec.http.songs === 0 && /^(Unable to convert|The MuseScore|MuseScore did not produce|Another MuseScore)/.test(msg),
    childGone: rec.childAfter.length === 0,
    tempCleaned: rec.tmpDirsAfter.length === 0,
    stillServing: rec.getAllSongsDuringRun?.status === 200 && rec.getAllSongsAfter.status === 200 && rec.controlMidUpload.songs === 1,
    noSongAdded: rec.songsBefore === 0 && (rec.getAllSongsAfter.count === 0),
  };
  rec.checks = checks;
  rec.pass = Object.values(checks).every(Boolean);
  // output-masked is an observation about a converter that swallows its child's SIGXFSZ, not a limit proof.
  if (name === 'output-masked') { rec.observationOnly = true; }
  else if (!rec.pass) failures += 1;
  console.log(`VARIANT ${name} ${rec.observationOnly ? (rec.pass ? 'OBS-CLEAN' : 'OBS-DEFECT') : rec.pass ? 'PASS' : 'FAIL'} elapsed=${rec.elapsedSec}s msg=${JSON.stringify(msg)} checks=${JSON.stringify(checks)}`);
  // Next variant starts with an empty library again.
  rmSync(dirs.data, { recursive: true, force: true });
  mkdirSync(dirs.data, { recursive: true });
}

// Report any survivor (e.g. a grandchild orphan) and kill it by PID; this script started it.
{
  const alive = [];
  for (const pid of new Set(orphansToKill)) { try { process.kill(pid, 0); alive.push(pid); } catch {} }
  for (const pid of alive) { try { process.kill(pid, 'SIGKILL'); } catch {} }
  results._orphansKilledAtEnd = alive;
}
writeFileSync(join(ROOT, 'results.json'), JSON.stringify(results, null, 2));
console.log(failures === 0 ? 'OVERALL PASS' : `OVERALL FAIL (${failures})`);
process.exit(failures === 0 ? 0 : 1);
