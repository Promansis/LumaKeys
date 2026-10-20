// Web half of PH-SEC-001's runtime proof: with the Flute and Cello packs in IndexedDB,
// crafted ids sent to removeInstrumentSamplePack remove nothing, and removing Flute leaves
// Cello. The server must not dispatch the pack methods at all.
// Env: DATA (empty, under $TMPDIR). Run from $TMPDIR/pw with PLAYWRIGHT_BROWSERS_PATH set.
import { withServer } from './harness.mjs';
import { firstLoad } from './setup-common.mjs';
const data = process.env.DATA;
const j = JSON.stringify;
const DB = 'lumakeys-instrument-sample-packs';

await withServer(data, async ({ page, base, errors }) => {
  await firstLoad(page, base);
  const call = (m, args) => page.evaluate(([m, a]) => window.appBridge[m](...a).then(
    (r) => (Array.isArray(r) ? r.filter((s) => s.isInstalled).map((s) => s.instrumentId) : r),
    (e) => ({ rejected: String(e.message ?? e) }),
  ), [m, args]);
  const idb = () => page.evaluate((name) => new Promise((resolve) => {
    const req = indexedDB.open(name);
    req.onsuccess = () => { const db = req.result;
      if (!db.objectStoreNames.contains('packs')) { db.close(); return resolve('no store'); }
      const all = db.transaction('packs', 'readonly').objectStore('packs').getAll();
      all.onsuccess = () => { db.close(); resolve(all.result.map((r) => `${r.instrumentId}:${Array.isArray(r.assets) ? r.assets.length : '?'}`)); }; };
    req.onerror = () => resolve('open error');
  }), DB);

  for (const m of ['removeInstrumentSamplePack', 'installInstrumentSamplePack']) {
    const r = await fetch(`${base}/api/bridge/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: j({ args: ['../../etc'] }) });
    console.log('server', m, r.status, await r.text());
  }
  console.log('install flute', j(await call('installInstrumentSamplePack', ['flute'])));
  console.log('install cello', j(await call('installInstrumentSamplePack', ['cello'])), 'IDB', j(await idb()));
  for (const id of ['../cello', 'cello/../flute', '', '..', 'flu', 'FLUTE', '__proto__', 'constructor', 'flute\u0000cello']) {
    console.log('crafted', j(id), j(await call('removeInstrumentSamplePack', [id])), 'IDB', j(await idb()));
  }
  console.log('valid flute', j(await call('removeInstrumentSamplePack', ['flute'])), 'IDB', j(await idb()));
  await page.reload({ waitUntil: 'networkidle' });
  console.log('after reload', j(await call('getInstrumentSamplePackStatuses', [])), 'IDB', j(await idb()));
  console.log('ERRORS', j(errors.filter((e) => !e.includes('mainmenu-neon')).slice(0, 10)));
}, { port: 3812, timeout: 15000 });
console.log('DONE');
