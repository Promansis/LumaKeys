// MOD-014 / PH-SEC-005 against the real app: click a Soundboard source link (its href
// pointed at a local page standing in for the remote site) and report what the new
// window is and what it can reach. Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE set.
import { withElectron, text } from './electron-harness.mjs';
import http from 'node:http';
const profile = process.env.PROFILE;
const CHILD = `<!doctype html><title>remote stand-in</title><script>window.__probe = { bridge: typeof window.appBridge, keys: Object.keys(window.appBridge || {}).length, node: typeof require, opener: window.opener === null ? 'null' : typeof window.opener };</script><p>remote</p>`;
const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(req.url === '/next' ? '<title>navigated</title><p>moved</p>' : CHILD); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

await withElectron(profile, async (h) => {
  const { page, app } = h;
  await page.waitForTimeout(2500);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Soundboard', exact: true }).click(); await page.waitForTimeout(1200);
  if (!(await page.getByRole('button', { name: 'Show Credits' }).count())) { await page.keyboard.press('Escape'); await page.waitForTimeout(500); }
  await page.getByRole('button', { name: 'Show Credits' }).click(); await page.waitForTimeout(500);
  const links = await page.$$eval('a[target=_blank]', (a) => a.map((x) => x.href));
  console.log('source links with target=_blank', links.length, JSON.stringify(links.slice(0, 2)));
  await page.evaluate((u) => { document.querySelectorAll('a[target=_blank]').forEach((a) => { a.href = u; }); }, `${origin}/child`);
  // Harness only: a normal child window crashes headless Electron, so keep Electron's
  // default "allow" and only add offscreen rendering. The app itself sets no handler.
  // NO_HANDLER=1 skips this and shows the crash (the app process exits on the click).
  console.log('app registered a window-open handler?', 'unknown from outside; source has none (grep setWindowOpenHandler)');
  if (!process.env.NO_HANDLER) await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { show: false, webPreferences: { offscreen: true } } })); });
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
