// Shared helpers for the PH-DATA-001 / PH-DATA-002 proof drivers (web and Electron).
// Copy next to the Playwright install ($TMPDIR/pw) with the drivers. Paths come from the
// environment: REPO (the repository root) and a data dir or profile under $TMPDIR.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

export const REPO = process.env.REPO;
if (!REPO) throw new Error('set REPO to the repository root');
const Database = createRequire(path.join(REPO, 'package.json'))('better-sqlite3');

export const ls = (dir) => { try { return fs.readdirSync(dir).sort(); } catch (e) { return `ERR ${e.code}`; } };

// Walk a directory; one entry per path with type, octal mode and size. Skips names in `skip`.
export function walk(root, skip = []) {
  const out = [];
  const rec = (dir, rel) => {
    let names;
    try { names = fs.readdirSync(dir).sort(); } catch (e) { out.push({ p: rel || '.', err: e.code }); return; }
    for (const n of names) {
      const r = rel ? `${rel}/${n}` : n;
      if (skip.includes(r)) continue;
      const full = path.join(dir, n);
      let st;
      try { st = fs.lstatSync(full); } catch (e) { out.push({ p: r, err: e.code }); continue; }
      const mode = (st.mode & 0o777).toString(8);
      if (st.isDirectory()) { out.push({ p: r + '/', t: 'd', mode }); rec(full, r); }
      else out.push({ p: r, t: 'f', mode, size: st.size });
    }
  };
  rec(root, '');
  return out;
}

// Read-only look at lumakeys.db: row counts per table, song ids and paths, setting keys, durable operations.
export function dbInventory(dbFile) {
  if (!fs.existsSync(dbFile)) return { missing: true };
  const db = new Database(dbFile, { readonly: true, fileMustExist: true });
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name);
    const counts = {};
    for (const t of tables) counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
    const songs = tables.includes('songs') ? db.prepare('SELECT id, title, file_path FROM songs ORDER BY title').all().map((r) => ({ id: r.id.slice(0, 8), title: r.title, file: path.basename(r.file_path || '') })) : [];
    const settings = tables.includes('settings') ? db.prepare('SELECT category, key FROM settings ORDER BY category, key').all().map((r) => `${r.category}.${r.key}`) : [];
    const ops = tables.includes('durable_operations') ? db.prepare('SELECT id, type, state FROM durable_operations').all().map((r) => `${r.type}:${r.state}:${r.id.slice(0, 8)}`) : [];
    const unlocked = tables.includes('achievements') ? db.prepare('SELECT COUNT(*) AS n FROM achievements WHERE unlocked_at IS NOT NULL').get().n : 0;
    const integrity = db.pragma('integrity_check', { simple: true });
    return { counts, unlockedAchievements: unlocked, songs, settings, ops, integrity };
  } finally { db.close(); }
}

// The database file and its WAL change size on every write, so they are compared through their rows instead.
// opts.keep: regex a top-level name must match to be listed (Electron keeps Chromium's own files out).
export function inventory(root, dbFile, opts = {}) {
  const skip = opts.skip ?? ['server.log', 'main.log'];
  const dbName = path.basename(dbFile);
  const top = (e) => e.p.split('/')[0];
  return {
    db: dbInventory(dbFile),
    fs: walk(root, skip).filter((e) => !(e.p.startsWith(dbName) && !e.p.includes('/')) && (!opts.keep || opts.keep.test(top(e)))),
    topLevel: ls(root),
  };
}

// Short, stable text summary of an inventory for the log.
export function summarize(inv, midiDirRel = 'midi-files') {
  const c = inv.db.counts ?? {};
  const nonzero = Object.entries(c).filter(([, n]) => n > 0).map(([t, n]) => `${t}=${n}`).join(' ');
  const mid = inv.fs.filter((e) => e.p.startsWith(midiDirRel + '/') && e.p.replace(/\/$/, '').split('/').length === 2 && e.p !== midiDirRel + '/').map((e) => e.p.slice(midiDirRel.length + 1).replace(/\/$/, '') + (e.t === 'd' ? '(dir ' + e.mode + ')' : '')).map((n) => n.replace(/^(.{8})[0-9a-f]{56}/, '$1..'));
  const top = inv.fs.filter((e) => e.p.replace(/\/$/, '').split('/').length === 1).map((e) => e.p + (e.t === 'd' ? `(${e.mode})` : ''));
  return `rows{${nonzero}} songs=${inv.db.songs?.length ?? '?'} ops=${JSON.stringify(inv.db.ops)} midi=${JSON.stringify(mid)} top=${JSON.stringify(top)}`;
}

// Entries in a that differ from b (by path, type, mode, size).
export function fsDiff(a, b) {
  const key = (e) => `${e.p}|${e.t ?? ''}|${e.mode ?? ''}|${e.size ?? ''}|${e.err ?? ''}`;
  const sa = new Set(a.map(key)); const sb = new Set(b.map(key));
  return { removed: a.filter((e) => !sb.has(key(e))).map((e) => e.p), added: b.filter((e) => !sa.has(key(e))).map((e) => e.p) };
}
export function dbDiff(a, b) {
  const out = {};
  for (const t of new Set([...Object.keys(a.counts ?? {}), ...Object.keys(b.counts ?? {})])) {
    if ((a.counts?.[t] ?? 0) !== (b.counts?.[t] ?? 0)) out[t] = `${a.counts?.[t] ?? 0} -> ${b.counts?.[t] ?? 0}`;
  }
  return out;
}
export function compare(label, a, b) {
  const f = fsDiff(a.fs, b.fs); const d = dbDiff(a.db, b.db);
  const same = !f.removed.length && !f.added.length && !Object.keys(d).length && JSON.stringify(a.db.ops) === JSON.stringify(b.db.ops);
  return `${label}: ${same ? 'UNCHANGED' : 'CHANGED'} dbRows=${JSON.stringify(d)} fsRemoved=${JSON.stringify(f.removed)} fsAdded=${JSON.stringify(f.added)} ops ${JSON.stringify(a.db.ops)} -> ${JSON.stringify(b.db.ops)}`;
}

// Permission helpers. lock = read-only (no create, rename-in or unlink inside a directory).
export const lock = (p) => fs.chmodSync(p, 0o555);
export const unlock = (p) => fs.chmodSync(p, 0o755);
export function unlockTree(root) {
  const rec = (p) => {
    let st; try { st = fs.lstatSync(p); } catch { return; }
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) { try { fs.chmodSync(p, 0o755); } catch {} for (const n of fs.readdirSync(p)) rec(path.join(p, n)); }
    else { try { fs.chmodSync(p, 0o644); } catch {} }
  };
  rec(root);
}
// A directory standing where a song file should be, with a file inside, read-only. Renaming a
// directory to another parent needs write permission on the directory itself, so a rename fails.
export function plantLockedDir(p) {
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, 'blocker.txt'), 'x');
  fs.chmodSync(p, 0o555);
}

// Web server lifecycle. Returns the base URL and controls. Spawned in-process so the sandbox keeps it alive.
export async function startServer(dataDir, port, extraEnv = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const env = { ...process.env, PORT: String(port), LUMAKEYS_DATA_DIR: dataDir, ...extraEnv };
  const logFile = path.join(path.dirname(dataDir), `server-${path.basename(dataDir)}.log`);
  const log = fs.createWriteStream(logFile, { flags: 'a' });
  const base = `http://127.0.0.1:${port}`;
  let srv;
  const up = async () => {
    srv = spawn('node', [path.join(REPO, 'dist/server/index.cjs')], { env, stdio: ['ignore', 'pipe', 'pipe'], cwd: REPO });
    srv.stdout.pipe(log, { end: false }); srv.stderr.pipe(log, { end: false });
    for (let i = 0; i < 60; i++) {
      if (srv.exitCode !== null) return false;
      try { const r = await fetch(base + '/'); if (r.ok) return true; } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };
  const down = async () => {
    if (srv && srv.exitCode === null && srv.signalCode === null) { srv.kill('SIGTERM'); await new Promise((r) => srv.once('exit', r)); }
  };
  const ok = await up();
  return { base, logFile, get srv() { return srv; }, ok, down, restart: async () => { await down(); return up(); } };
}

export const rpc = (base, m, args = []) =>
  fetch(`${base}/api/bridge/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) })
    .then((r) => r.json())
    .then((j) => ('result' in j ? j.result : j));

export const text = (page) => page.evaluate(() => document.body.innerText);
// Every visible status line a user could read after an action: library header, settings status, toasts, alerts.
export async function visibleStatus(page) {
  return page.evaluate(() => {
    const pick = (sel) => [...document.querySelectorAll(sel)].map((e) => e.innerText.trim()).filter(Boolean);
    return {
      library: pick('.library-header .song-title'),
      settings: pick('.settings-status-message'),
      toasts: pick('.toast, [role="alert"], [role="status"]'),
    };
  });
}

// Fill every kind of user data the bridge can write. `call(method, args)` runs a bridge method.
export async function seedRich(call, songs) {
  const folder = await call('createFolder', ['Proof folder']);
  const playlist = await call('createPlaylist', ['Proof playlist']);
  await call('moveSongToFolder', [songs[0].id, folder.id]);
  await call('addSongToPlaylist', [playlist.id, songs[1].id]);
  await call('toggleFavorite', [songs[0].id]);
  await call('bulkAddTag', [[songs[0].id], 'proof']);
  await call('saveGameResult', [{ songId: songs[0].id, score: 1234, accuracy: 0.6, maxCombo: 10, perfectHits: 5, goodHits: 3, okHits: 1, misses: 3, tempo: 100, mode: 'learning', durationSec: 30, measureAccuracy: [{ measure: 1, accuracy: 0.9 }, { measure: 2, accuracy: 0.2 }, { measure: 3, accuracy: 0.3 }] }]);
  await call('saveTheoryResult', [{ type: 'quiz', score: 7, totalQuestions: 10, accuracy: 0.7 }]);
  await call('recordPracticeTime', [300, 1, 1]);
  const ach = await call('getAllAchievements');
  await call('unlockAchievement', [ach[0].id]);
  await call('saveCustomFingering', [songs[0].id, 0, 2, 'right']);
  await call('setSetting', ['audio', 'masterVolume', '0.42']);
  await call('setSetting', ['input', 'keyboardMapping', JSON.stringify({ proof: true })]);
  await call('setSetting', ['practice', 'breakReminderMinutes', '25']);
}

// What this browser profile holds for the origin: localStorage, sessionStorage, IndexedDB (database, store, record count), caches, workers, cookies.
export function browserState(page) {
  return page.evaluate(async () => {
    const idb = {};
    const dbs = indexedDB.databases ? await indexedDB.databases() : [];
    for (const d of dbs) {
      idb[d.name] = await new Promise((resolve) => {
        const req = indexedDB.open(d.name);
        req.onerror = () => resolve('open error');
        req.onsuccess = () => {
          const db = req.result; const names = [...db.objectStoreNames]; const out = {}; let left = names.length;
          if (!left) { db.close(); resolve(out); return; }
          for (const n of names) {
            const c = db.transaction(n, 'readonly').objectStore(n).count();
            c.onsuccess = () => { out[n] = c.result; if (--left === 0) { db.close(); resolve(out); } };
            c.onerror = () => { out[n] = 'count error'; if (--left === 0) { db.close(); resolve(out); } };
          }
        };
      });
    }
    return {
      localStorage: Object.keys(localStorage).sort(),
      sessionStorage: Object.keys(sessionStorage).sort(),
      indexedDB: idb,
      caches: 'caches' in self ? await caches.keys() : [],
      serviceWorkers: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
      cookies: document.cookie,
    };
  });
}
