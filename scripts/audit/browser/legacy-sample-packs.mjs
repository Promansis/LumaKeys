// PH-DATA-004: are sample packs installed before the PianoHero -> LumaKeys rename still offered
// after it? The rename changed the IndexedDB name from 'pianohero-instrument-sample-packs' to
// 'lumakeys-instrument-sample-packs' (commit 489fe45). Real Chromium IndexedDB, so it also checks
// that probing for a missing legacy database does not create one.
//
// Cases: P legacy only; E current exists but is empty; B both hold packs; N neither; R reset with both.
// Oracle: P and E list the legacy pack and delete the legacy database; B keeps the current pack and
// leaves the legacy database; N creates no legacy database; R leaves neither database.
//
// Run from $TMPDIR/pw: DATA=$TMPDIR/p11-s15/packs PORT=3250 PLAYWRIGHT_BROWSERS_PATH=$TMPDIR/pw/browsers node legacy-sample-packs.mjs
import { withServer } from './harness.mjs';
import fs from 'node:fs';

const data = process.env.DATA;
const port = Number(process.env.PORT || 3250);
if (!data || !data.startsWith(process.env.TMPDIR || '/tmp/')) throw new Error('DATA must be under TMPDIR');
fs.rmSync(data, { recursive: true, force: true });

const CURRENT = 'lumakeys-instrument-sample-packs';
const LEGACY = 'pianohero-instrument-sample-packs';
const results = [];

await withServer(data, async ({ page, base, errors }) => {
  // A same-origin page that does not run the app, so nothing holds the databases open while seeding.
  const blank = () => page.goto(base + '/api/midi/none', { waitUntil: 'domcontentloaded' });
  const deleteDb = (name) => page.evaluate((n) => new Promise((resolve, reject) => {
    const r = indexedDB.deleteDatabase(n);
    r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); r.onblocked = () => reject(new Error('blocked'));
  }), name);
  const seed = (name, packs) => page.evaluate(([n, ids]) => new Promise((resolve, reject) => {
    const r = indexedDB.open(n, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('packs', { keyPath: 'instrumentId' });
    r.onsuccess = () => {
      const db = r.result; const tx = db.transaction('packs', 'readwrite');
      for (const [id, version] of ids) {
        tx.objectStore('packs').put({ instrumentId: id, packLabel: id, version, installedAt: '2026-05-01T00:00:00.000Z', sourceName: 's', licenseLabel: 'l', attributionUrl: 'https://example.test', assets: [{ note: 'C4', fileName: 'c4.mp3', blob: new Blob([new Uint8Array(2048)]) }] });
      }
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
    r.onerror = () => reject(r.error);
  }), [name, packs]);
  const reset = async () => { await blank(); await deleteDb(CURRENT); await deleteDb(LEGACY); };
  const names = () => page.evaluate(() => indexedDB.databases().then((d) => d.map((x) => x.name).sort()));
  const installed = () => page.evaluate(() => window.appBridge.getInstrumentSamplePackStatuses().then((s) => s.filter((x) => x.isInstalled).map((x) => `${x.instrumentId}`)));
  const open = async () => { await page.goto(base + '/', { waitUntil: 'networkidle' }); };
  const record = async (label) => results.push({ case: label, installed: await installed(), databases: await names() });

  await reset(); await seed(LEGACY, [['flute', '1'], ['cello', '1']]); await open(); await record('P');
  const sizes = await page.evaluate(() => window.appBridge.resolveInstrumentSampleSource('flute').then((s) => (s ? fetch(Object.values(s.urls)[0]).then((r) => r.blob()).then((b) => b.size) : null)));
  results.push({ case: 'P', copiedBlobBytes: sizes });
  await reset(); await seed(CURRENT, []); await seed(LEGACY, [['flute', '1']]); await open(); await record('E');
  await reset(); await seed(CURRENT, [['flute', '2']]); await seed(LEGACY, [['cello', '1']]); await open(); await record('B');
  await reset(); await open(); await record('N');
  await reset(); await seed(CURRENT, [['flute', '2']]); await seed(LEGACY, [['cello', '1']]);
  await open(); await page.evaluate(() => window.appBridge.resetUserData()); results.push({ case: 'R', databases: await names() });
  console.log('ERRORS ' + JSON.stringify(errors.filter((e) => !e.includes('mainmenu-neon')).slice(0, 10)));
}, { port, timeout: 15000 });

for (const r of results) console.log('RESULT ' + JSON.stringify(r));
