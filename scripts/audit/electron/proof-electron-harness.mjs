// Playwright driver helper for the headless desktop app, for the PH-DATA proofs. Like
// electron-harness.mjs but takes the repository root from REPO, exposes launchRaw for
// a launch that may fail, and keeps the launch timeout short. Copy next to the Playwright
// install ($TMPDIR/pw). Needs LK_SQLITE_MODULE (Electron-ABI better-sqlite3 directory).
import { _electron as electron } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const REPO = process.env.REPO;
if (!REPO) throw new Error('set REPO to the repository root');
const ELECTRON = path.join(REPO, 'node_modules/electron/dist/electron');

export async function launchRaw(profile, timeout = 30000) {
  const sqlite = process.env.LK_SQLITE_MODULE;
  if (!sqlite) throw new Error('set LK_SQLITE_MODULE to the Electron-ABI better-sqlite3 directory');
  fs.mkdirSync(profile, { recursive: true });
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [path.join(REPO, 'scripts/audit/electron'), '--no-sandbox', '--disable-gpu', '--ozone-platform=headless'],
    env: { ...process.env, HOME: profile, XDG_CONFIG_HOME: path.join(profile, '.config'), LK_PROFILE: profile, LK_SQLITE_MODULE: sqlite },
    timeout,
  });
  const log = fs.createWriteStream(path.join(profile, 'main.log'), { flags: 'a' });
  app.process().stdout?.pipe(log, { end: false }); app.process().stderr?.pipe(log, { end: false });
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message.slice(0, 300)}`));
  await page.waitForLoadState('domcontentloaded');
  return { app, page, errors };
}

export async function withElectron(profile, fn) {
  let cur = await launchRaw(profile);
  const userData = path.join(profile, '.config', 'lumakeys');
  const relaunch = async ({ kill = false } = {}) => {
    const proc = cur.app.process();
    const exited = new Promise((r) => (proc.exitCode !== null || proc.signalCode !== null) ? r() : proc.once('exit', r));
    if (kill) proc.kill('SIGKILL'); else await cur.app.close();
    await exited;
    cur = await launchRaw(profile);
    return cur;
  };
  // Replace native dialogs in the main process. paths: array for open, string for save.
  const stubOpen = (paths) => cur.app.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: p.length === 0, filePaths: p }); }, paths);
  const stubSave = (file) => cur.app.evaluate(({ dialog }, f) => { dialog.showSaveDialog = async () => ({ canceled: !f, filePath: f ?? undefined }); }, file);
  try {
    await fn({ get app() { return cur.app; }, get page() { return cur.page; }, get errors() { return cur.errors; }, relaunch, stubOpen, stubSave, userData, profile });
  } finally {
    try { await cur.app.close(); } catch {}
  }
}
