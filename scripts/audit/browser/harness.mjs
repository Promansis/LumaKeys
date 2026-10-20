import { spawn } from 'node:child_process';
import * as playwright from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

// BROWSER picks the engine (chromium, firefox or webkit; default chromium). BROWSER_PATH
// points it at another executable of that engine, for example an unpacked Edge.
export const browserName = process.env.BROWSER ?? 'chromium';
export function launchBrowser(extra = {}) {
  const exe = process.env.BROWSER_PATH;
  return playwright[browserName].launch({ ...(exe ? { executablePath: exe } : {}), ...extra });
}

export async function withServer(dataDir, fn, opts = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const port = opts.port ?? 3777;
  const env = { ...process.env, PORT: String(port), LUMAKEYS_DATA_DIR: dataDir, ...(opts.env ?? {}) };
  const log = fs.createWriteStream(path.join(dataDir, 'server.log'), { flags: 'a' });
  let srv = spawn('node', ['/media/storage/LumaKeys/dist/server/index.cjs'], { env, stdio: ['ignore', 'pipe', 'pipe'], cwd: '/media/storage/LumaKeys' });
  srv.stdout.pipe(log); srv.stderr.pipe(log);
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(base + '/'); if (r.ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const browser = await launchBrowser(opts.launch);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, ...(opts.context ?? {}) });
  const page = await ctx.newPage();
  page.setDefaultTimeout(opts.timeout ?? 10000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message.slice(0, 300)}`));
  page.on('requestfailed', (r) => errors.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
  const restart = async () => {
    if (srv.exitCode === null && srv.signalCode === null) { srv.kill('SIGTERM'); await new Promise((r) => srv.once('exit', r)); }
    const s2 = spawn('node', ['/media/storage/LumaKeys/dist/server/index.cjs'], { env, stdio: ['ignore', 'pipe', 'pipe'], cwd: '/media/storage/LumaKeys' });
    s2.stdout.pipe(log); s2.stderr.pipe(log);
    for (let i = 0; i < 50; i++) { try { const r = await fetch(base + '/'); if (r.ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    srv = s2;
    return s2;
  };
  try {
    await fn({ page, ctx, browser, base, errors, get srv() { return srv; }, restart, dataDir });
  } finally {
    await browser.close();
    srv.kill('SIGTERM');
  }
  return errors;
}
export const text = (page) => page.evaluate(() => document.body.innerText);
