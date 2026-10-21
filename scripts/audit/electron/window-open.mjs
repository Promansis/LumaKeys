// MOD-014 / PH-SEC-005 against the real app: click a Soundboard source link (its href
// pointed at a local page standing in for the remote site).
// Default: the app as shipped. Expects no child window, one shell.openExternal call
// (stubbed here) for an https: link and none for an http: link, and the main window
// staying on the app after a navigation attempt. Prints PASS or FAIL lines.
// ALLOW_OFFSCREEN=1: the Phase 11 baseline for a build with no window-open handler. The
// driver installs a handler that keeps Electron's default "allow" but renders offscreen,
// and reports what the child window is and what it can reach. NO_HANDLER=1 skips that
// handler and shows the headless crash instead.
// Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE set.
import { withElectron, text } from './electron-harness.mjs';
import http from 'node:http';
const profile = process.env.PROFILE;
const CHILD = `<!doctype html><title>remote stand-in</title><script>window.__probe = { bridge: typeof window.appBridge, keys: Object.keys(window.appBridge || {}).length, node: typeof require, opener: window.opener === null ? 'null' : typeof window.opener };</script><p>remote</p>`;
const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(req.url === '/next' ? '<title>navigated</title><p>moved</p>' : CHILD); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

async function guardedRun({ page, app, errors }, origin) {
  await app.evaluate(({ shell }) => { globalThis.__opened = []; shell.openExternal = async (u) => { globalThis.__opened.push(u); }; });
  const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  const sawWindow = app.waitForEvent('window', { timeout: 3000 }).then(() => true, () => false);
  await page.evaluate(() => document.querySelector('a[target=_blank]').click());
  const httpUrl = origin + '/child';
  await page.evaluate((u) => { const a = document.createElement('a'); a.href = u; a.target = '_blank'; document.body.appendChild(a); a.click(); a.remove(); }, httpUrl);
  const child = await sawWindow;
  const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  const opened = await app.evaluate(() => globalThis.__opened);
  console.log('windows before', before, 'after', after, 'child window event', child);
  console.log('shell.openExternal calls', JSON.stringify(opened));
  await page.evaluate((u) => { location.href = u; }, `${origin}/next`).catch(() => {});
  await page.waitForTimeout(800);
  const parentUrl = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getURL());
  console.log('after navigation attempt parent url', parentUrl, 'bridge', await page.evaluate(() => typeof window.appBridge));
  const sandbox = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences().sandbox);
  console.log('main window sandbox', sandbox);
  const verdicts = [
    ['no child window', !child && after === before],
    ['https link reached shell.openExternal once, http link did not', opened.length === 1 && opened[0].startsWith('https://')],
    ['main window stayed on the app', parentUrl.startsWith('file://') && !parentUrl.startsWith(origin)],
    ['main window sandbox is true', sandbox === true],
  ];
  for (const [name, ok] of verdicts) console.log(ok ? 'PASS' : 'FAIL', name);
  console.log('ERRORS', JSON.stringify(errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 8)));
}

await withElectron(profile, async (h) => {
  const { page, app } = h;
  await page.waitForTimeout(2500);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Soundboard', exact: true }).click(); await page.waitForTimeout(1200);
  if (!(await page.getByRole('button', { name: 'Show Credits' }).count())) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
  await page.getByRole('button', { name: 'Show Credits' }).click(); await page.waitForTimeout(500);
  const links = await page.$$eval('a[target=_blank]', (a) => a.map((x) => x.href));
  console.log('source links with target=_blank', links.length, JSON.stringify(links.slice(0, 2)));
  // Credit links are https: in the app; keep that scheme for the default run by pointing
  // at a fake host (never fetched: the stub receives the URL, nothing is opened).
  const target = process.env.ALLOW_OFFSCREEN || process.env.NO_HANDLER ? `${origin}/child` : 'https://credits.invalid/page';
  await page.evaluate((u) => { document.querySelectorAll('a[target=_blank]').forEach((a) => { a.href = u; }); }, target);
  if (process.env.ALLOW_OFFSCREEN) {
    // Harness only: a normal child window crashes headless Electron, so keep Electron's
    // default "allow" and only add offscreen rendering. This replaces the app's handler.
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { show: false, webPreferences: { offscreen: true } } })); });
  } else if (!process.env.NO_HANDLER) {
    await guardedRun(h, origin);
    return;
  }
  const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  const childPromise = app.waitForEvent('window', { timeout: 10000 }).catch((e) => ({ error: e.message }));
  await page.evaluate(() => document.querySelector('a[target=_blank]').click());
  const child = await childPromise;
  if (child.error) { console.log('no child window:', child.error); return; }
  await child.waitForLoadState('domcontentloaded').catch(() => {});
  await child.waitForTimeout(500);
  const info = await app.evaluate(({ BrowserWindow, webContents }) => BrowserWindow.getAllWindows().map((w) => ({ id: w.id, url: w.webContents.getURL(), offscreen: w.webContents.isOffscreen(), prefs: (() => { const p = w.webContents.getLastWebPreferences?.() ?? {}; return { preload: p.preload ?? null, contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, sandbox: p.sandbox }; })() })));
  console.log('windows before', before, 'after', JSON.stringify(info));
  console.log('child probe', JSON.stringify(await child.evaluate(() => window.__probe)));
  const invoke = await child.evaluate(() => (window.appBridge?.getAllSongs ? window.appBridge.getAllSongs().then((r) => 'resolved:' + r.length, (e) => 'rejected:' + e.message) : 'no bridge'));
  console.log('child appBridge.getAllSongs', invoke);
  await child.evaluate((u) => { location.href = u; }, `${origin}/next`).catch(() => {});
  await child.waitForTimeout(800);
  console.log('child navigates itself to another URL:', child.url(), JSON.stringify(await child.title().catch(() => '?')));
  console.log('parent still on app:', page.url().startsWith('file://'), 'parent bridge', await page.evaluate(() => typeof window.appBridge));
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 8)));
});
server.close();
console.log('DONE');
