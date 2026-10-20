// Sitting 3: thin wrapper around harness.mjs for the Firefox/Edge runs. Firefox's boot sits on "Loading services..." for
// 8-12 s (requestMIDIAccess rejects late), so every page.goto to the app root also waits for the first real control.
// Also: long default timeouts and the port taken from PORT. Same exports as harness.mjs.
import * as H from './harness.mjs';
export const { text, browserName, launchBrowser } = H;
const BOOT = /Skip for now|^Play Songs$/;
function patch(page) {
  if (page.__s3) return page; page.__s3 = true;
  page.setDefaultTimeout(30000);
  const goto = page.goto.bind(page);
  page.goto = async (url, o) => { const r = await goto(url, o); if (/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(url)) await page.getByRole('button', { name: BOOT }).first().waitFor({ timeout: 60000 }); return r; };
  return page;
}
export function withServer(dataDir, fn, opts = {}) {
  return H.withServer(dataDir, (a) => {
    patch(a.page);
    const np = a.ctx.newPage.bind(a.ctx); a.ctx.newPage = async () => patch(await np());
    return fn(a);
  }, { ...opts, port: Number(process.env.PORT ?? opts.port), timeout: 60000 });
}
