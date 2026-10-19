// Audit probe for coverage row MOD-014 / lead L-11-008.
//
// Question: when the renderer opens a link with target="_blank" (the soundboard's
// "source" links do this), does the child window inherit the preload bridge, giving
// the remote page window.appBridge and therefore IPC access to the database?
//
// The probe mirrors the webPreferences in src/main/index.ts, loads the REAL built
// preload (out/preload/preload.js, so run `npm run build` first), serves two local
// pages, clicks the link, and reports what the child page can see. It registers no
// IPC handlers and touches no database; it uses a throwaway profile.
//
// Run on a machine with a display or Xvfb (it cannot run inside the Claude sandbox):
//   npm run build && xvfb-run -a node_modules/.bin/electron --no-sandbox scripts/audit/electron-window-open-probe.cjs
// or, with a desktop session:
//   npm run build && node_modules/.bin/electron scripts/audit/electron-window-open-probe.cjs
//
// Read the single PROBE_RESULT line. preloadInherited=true means the boundary is
// crossed; invoke beginning with "rejected:" or "resolved:" means the child's calls
// reached the main process IPC layer.
const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const REPO = path.resolve(__dirname, '..', '..');
const PRELOAD = path.join(REPO, 'out', 'preload', 'preload.js');
if (!fs.existsSync(PRELOAD)) {
  console.error(`Missing ${PRELOAD}. Run "npm run build" first.`);
  process.exit(2);
}
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lumakeys-probe-profile-'));
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-gpu');

const CHILD_HTML = `<!doctype html><title>child</title><script>
  const out = { hasBridge: typeof window.appBridge, keys: [] };
  try { out.keys = Object.keys(window.appBridge || {}).slice(0, 8); } catch (e) { out.keys = ['err:' + e.message]; }
  window.__probe = out;
</script>`;
const PARENT_HTML = (childUrl) => `<!doctype html><title>parent</title>
<a href="${childUrl}" target="_blank" rel="noreferrer">source</a>`;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  if (req.url === '/child') return res.end(CHILD_HTML);
  res.end(PARENT_HTML(`http://127.0.0.1:${server.address().port}/child`));
});

let finished = false;
function finish(result) {
  if (finished) return;
  finished = true;
  console.log('PROBE_RESULT ' + JSON.stringify(result));
  server.close();
  fs.rmSync(profile, { recursive: true, force: true });
  setTimeout(() => app.exit(0), 100);
}

app.whenReady().then(() => {
  server.listen(0, '127.0.0.1', async () => {
    const parentUrl = `http://127.0.0.1:${server.address().port}/`;
    app.on('web-contents-created', (_event, contents) => {
      contents.on('did-finish-load', async () => {
        const url = contents.getURL();
        if (!url.endsWith('/child')) return;
        try {
          const probe = await contents.executeJavaScript('window.__probe');
          let invoke = 'not attempted';
          try {
            invoke = await contents.executeJavaScript(
              'window.appBridge && window.appBridge.getAllSongs ? window.appBridge.getAllSongs().then(r => "resolved:" + JSON.stringify(r)).catch(e => "rejected:" + e.message) : "no getAllSongs"',
            );
          } catch (e) { invoke = 'threw:' + e.message; }
          finish({ electron: process.versions.electron, childUrl: url, hasBridge: probe.hasBridge, keys: probe.keys, invoke, preloadInherited: probe.hasBridge === 'object' });
        } catch (e) {
          finish({ childUrl: url, error: e.message });
        }
      });
    });

    const win = new BrowserWindow({
      show: false,
      webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false },
    });
    await win.loadURL(parentUrl);
    const parentBridge = await win.webContents.executeJavaScript('typeof window.appBridge');
    console.log('PARENT_BRIDGE ' + parentBridge);
    await win.webContents.executeJavaScript('document.querySelector("a").click(); true');
    setTimeout(() => finish({ error: 'timeout: no child window loaded within 15s' }), 15000);
  });
});
