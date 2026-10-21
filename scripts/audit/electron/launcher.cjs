// Headless audit launcher for the built desktop app (out/main/index.js).
// Forces offscreen windows (normal windows crash Electron 30 without a display) and
// loads better-sqlite3 from an Electron-ABI copy so the repo's Node build stays intact.
// Refuses to run unless the profile lives under $TMPDIR, so real user data is never opened.
const { register } = require('node:module');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { app } = require('electron');

const repo = path.resolve(__dirname, '../../..');
const profile = process.env.LK_PROFILE;
const tmp = process.env.TMPDIR;
if (!profile || !tmp || !path.resolve(profile).startsWith(path.resolve(tmp) + path.sep)) {
  console.error('LK_PROFILE must be a directory under $TMPDIR');
  process.exit(2);
}
// Electron would report this launcher directory as the app path; the unpackaged app
// expects the repo root (getDesktopAssetRoot reads <appPath>/public).
app.getAppPath = () => repo;
// The agent sandbox denies AF_UNIX sockets, which the single-instance lock needs; the product keeps the lock.
app.requestSingleInstanceLock = () => true;
app.setPath('appData', path.join(profile, '.config'));
app.setPath('userData', path.join(profile, '.config', 'lumakeys'));

const sqlite = process.env.LK_SQLITE_MODULE;
if (!sqlite) { console.error('LK_SQLITE_MODULE must point at an Electron-ABI better-sqlite3 directory'); process.exit(2); }

const target = pathToFileURL(path.join(repo, 'out/main/index.js')).href;
register(pathToFileURL(path.join(__dirname, 'hooks.mjs')).href, {
  data: {
    target,
    shim: pathToFileURL(path.join(__dirname, 'electron-shim.mjs')).href,
    sqlite: pathToFileURL(path.join(sqlite, 'lib/index.js')).href,
  },
});
console.log(`LK_LAUNCH electron=${process.versions.electron} userData=${app.getPath('userData')}`);
import(target).catch((e) => { console.error('LK_IMPORT_FAIL', e && e.stack); process.exit(3); });
