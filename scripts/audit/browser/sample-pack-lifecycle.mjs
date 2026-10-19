// WF-019: web instrument sample pack (IndexedDB): list, install, select, reload, remove, reset interaction, failures, corrupt record recovery.
// Env: DATA
import { withServer, text } from './harness.mjs';
import { firstLoad, rpc } from './setup-common.mjs';
const data = process.env.DATA;
const out = (...a) => console.log(...a);
const DB = 'lumakeys-instrument-sample-packs';
const ctl = (page, label) => page.locator('#settings-panel-audio label').filter({ hasText: new RegExp(label, 'i') }).locator('select, input').first();
const status = (page) => page.locator('.settings-status-message').innerText().catch(() => '?');
const toasts = (page) => page.locator('.toast, [role="alert"], [role="status"]').allInnerTexts();
async function openAudio(page, instrument) {
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700);
  await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(250);
  if (instrument) { await ctl(page, '^Instrument').selectOption(instrument); await page.waitForTimeout(800); }
  const adv = page.getByRole('button', { name: /show advanced options/i });
  if (await adv.count()) { await adv.click(); await page.waitForTimeout(300); }
}
const packCard = (page) => page.locator('.settings-note-card').filter({ hasText: /Selected Instrument/ }).first().innerText().then((t) => t.replace(/\n+/g, ' | ')).catch(() => 'no card');
const idbState = (page) => page.evaluate((name) => new Promise((resolve) => {
  indexedDB.databases().then((dbs) => {
    if (!dbs.some((d) => d.name === name)) return resolve('database absent');
    const req = indexedDB.open(name);
    req.onsuccess = () => { const db = req.result; const tx = db.transaction('packs', 'readonly'); const all = tx.objectStore('packs').getAll();
      all.onsuccess = () => { db.close(); resolve(all.result.map((r) => ({ id: r.instrumentId, label: r.packLabel, version: r.version, assets: Array.isArray(r.assets) ? r.assets.length : String(r.assets), bytes: Array.isArray(r.assets) ? r.assets.reduce((n, a) => n + (a.blob?.size ?? 0), 0) : null }))); };
      all.onerror = () => { db.close(); resolve('read error'); }; };
    req.onerror = () => resolve('open error');
  });
}), DB);
const idbPut = (page, record) => page.evaluate(([name, rec]) => new Promise((resolve, reject) => {
  const req = indexedDB.open(name, 1);
  req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('packs')) req.result.createObjectStore('packs', { keyPath: 'instrumentId' }); };
  req.onsuccess = () => { const db = req.result; const tx = db.transaction('packs', 'readwrite');
    const r = JSON.parse(rec.json); if (rec.badBlob) r.assets = r.assets.map((a) => ({ ...a, blob: new Blob([new Uint8Array(64).fill(7)], { type: 'audio/mpeg' }) }));
    tx.objectStore('packs').put(r); tx.oncomplete = () => { db.close(); resolve(true); }; tx.onerror = () => reject(tx.error); };
}), [DB, record]);

await withServer(data, async ({ page, base, errors, restart }) => {
  const errStart = () => errors.length;
  await firstLoad(page, base);
  const man = await (await fetch(`${base}/instrument-packs/flute/manifest.json`)).json();
  out('manifest served by the same web server: assets =', man.assets.length, '| version', man.version);
  await openAudio(page, 'flute');
  out('1 fresh, Flute selected: card =', await packCard(page), '| IDB =', JSON.stringify(await idbState(page)));
  out('  instrument saved in settings table:', JSON.stringify(await rpc(base, 'getSetting', ['audio', 'instrumentId'])));
  // list of pack-capable instruments
  const opts = await ctl(page, '^Instrument').evaluate((s) => [...s.options].map((o) => o.value + (o.disabled ? '(disabled)' : '')));
  out('  instrument options:', JSON.stringify(opts));

  // 2 install
  const e0 = errStart();
  await page.getByRole('button', { name: /Install Better Sounds/ }).click();
  out('2 install clicked: status immediately =', JSON.stringify(await status(page)));
  await page.waitForTimeout(2500);
  out('  after install: status =', JSON.stringify(await status(page)), '| card =', await packCard(page));
  out('  IDB =', JSON.stringify(await idbState(page)));
  out('  console errors during install:', JSON.stringify(errors.slice(e0)));

  out('  sampler errors after install (count of "undefinedblob:" URLs):', errors.filter((e) => e.includes('undefinedblob')).length, '| "Failed to load custom sampler":', errors.filter((e) => e.includes('Failed to load custom sampler')).length);
  // 3 reload
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
  const e3a = errStart();
  await page.mouse.click(400, 300); await page.waitForTimeout(2500); // first pointer-down initialises audio
  out('  after reload and one click, sampler errors:', JSON.stringify(errors.slice(e3a).map((e) => e.slice(0, 110))));
  await openAudio(page);
  out('3 after reload: instrument select =', await ctl(page, '^Instrument').inputValue(), '| card =', await packCard(page));
  await restart(); await page.goto(base + '/', { waitUntil: 'networkidle' }); await openAudio(page);
  out('  after server restart: card =', await packCard(page), '| IDB =', JSON.stringify(await idbState(page)));

  // 4 remove
  await page.getByRole('button', { name: /Use Built-in Sounds/ }).first().click(); await page.waitForTimeout(1200);
  out('4 remove: status =', JSON.stringify(await status(page)), '| card =', await packCard(page), '| IDB =', JSON.stringify(await idbState(page)));
  out('  instrument still selected:', await ctl(page, '^Instrument').inputValue());

  // 5 failures: manifest 404, one asset 404, network abort, offline
  const tryInstall = async (label, setup, teardown) => {
    await setup();
    const e1 = errStart();
    await page.getByRole('button', { name: /Install Better Sounds/ }).click(); await page.waitForTimeout(2500);
    out(`5 ${label}: status =`, JSON.stringify(await status(page)), '| toast', JSON.stringify(await toasts(page)), '| card =', await packCard(page), '| IDB =', JSON.stringify(await idbState(page)));
    await teardown();
    await page.waitForTimeout(300);
  };
  await tryInstall('manifest 404', () => page.route('**/instrument-packs/flute/manifest.json', (r) => r.fulfill({ status: 404, body: 'nope' })), () => page.unroute('**/instrument-packs/flute/manifest.json'));
  await tryInstall('manifest not JSON', () => page.route('**/instrument-packs/flute/manifest.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '<html>' })), () => page.unroute('**/instrument-packs/flute/manifest.json'));
  await tryInstall('manifest invalid shape', () => page.route('**/instrument-packs/flute/manifest.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ instrumentId: 'flute' }) })), () => page.unroute('**/instrument-packs/flute/manifest.json'));
  await tryInstall('one asset 404 (E5.mp3)', () => page.route('**/instrument-packs/flute/assets/E5.mp3', (r) => r.fulfill({ status: 404, body: 'gone' })), () => page.unroute('**/instrument-packs/flute/assets/E5.mp3'));
  await tryInstall('asset connection aborted', () => page.route('**/instrument-packs/flute/assets/A4.mp3', (r) => r.abort('connectionreset')), () => page.unroute('**/instrument-packs/flute/assets/A4.mp3'));
  await tryInstall('browser offline', async () => { await page.context().setOffline(true); }, async () => { await page.context().setOffline(false); });
  // recovery: retry succeeds
  await page.getByRole('button', { name: /Install Better Sounds/ }).click(); await page.waitForTimeout(2500);
  out('5 retry after failures: status =', JSON.stringify(await status(page)), '| IDB =', JSON.stringify(await idbState(page)));

  // 6 corrupt records (installed pack, then replace with bad data)
  await page.getByRole('button', { name: /Use Built-in Sounds/ }).first().click(); await page.waitForTimeout(800);
  const base1 = { instrumentId: 'flute', packLabel: 'Flute Enhanced Pack', version: '2', installedAt: new Date().toISOString(), sourceName: 'x', licenseLabel: 'MIT', attributionUrl: 'x', assets: man.assets.map((a) => ({ note: a.note, fileName: a.fileName })) };
  // 6a record with undecodable audio bytes
  await idbPut(page, { json: JSON.stringify(base1), badBlob: true });
  // put a stored non-default theme in place first so a failed startup load is visible
  await rpc(base, 'setSetting', ['visual', 'theme', 'warm']);
  const e2 = errStart();
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(2500);
  out('6a data-theme after boot =', await page.evaluate(() => document.documentElement.dataset.theme), '(stored warm)');
  out('6a undecodable audio blobs, instrument=flute: page starts at', JSON.stringify((await text(page)).replace(/\n+/g, ' / ').slice(0, 80)), '| startup error shown:', /Defaults are active/.test(await text(page)), '| console:', JSON.stringify(errors.slice(e2).slice(0, 4)));
  await openAudio(page);
  out('   settings card =', await packCard(page), '| status', JSON.stringify(await status(page)));
  // 6b record with no assets array at all
  await idbPut(page, { json: JSON.stringify({ ...base1, assets: undefined }) });
  const e3 = errStart();
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  const t6b = await text(page);
  out('6b record missing assets, instrument=flute: starts at', JSON.stringify(t6b.replace(/\n+/g, ' / ').slice(0, 80)), '| startup error shown:', /Defaults are active/.test(t6b), '| console:', JSON.stringify(errors.slice(e3).slice(0, 4)));
  out('   data-theme after boot =', await page.evaluate(() => document.documentElement.dataset.theme), '(stored', JSON.stringify(await rpc(base, 'getSetting', ['visual', 'theme'])) + ')');
  await page.screenshot({ path: `${process.env.TMPDIR}/p11/FA/pack-corrupt-6b.png` });
  out('   IDB =', JSON.stringify(await idbState(page)));
  await openAudio(page);
  out('   settings card =', await packCard(page), '| status', JSON.stringify(await status(page)));
  const rem = page.getByRole('button', { name: /Use Built-in Sounds/ }).first();
  if (await rem.count()) { await rem.click(); await page.waitForTimeout(1200); }
  out('   after Use Built-in Sounds: card =', await packCard(page), '| IDB =', JSON.stringify(await idbState(page)));
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  out('   reload after recovery: startup error shown =', /Defaults are active/.test(await text(page)));

  // 7 interaction with user-data reset
  await openAudio(page, 'flute');
  await page.getByRole('button', { name: /Install Better Sounds/ }).click(); await page.waitForTimeout(2500);
  out('7 reinstalled: IDB =', JSON.stringify(await idbState(page)));
  await page.locator('#settings-tab-practice').click();
  await page.getByRole('button', { name: /Delete user data/i }).click(); await page.waitForTimeout(400);
  await page.getByRole('dialog').getByRole('button', { name: /delete/i }).first().click(); await page.waitForTimeout(2000);
  out('  after Delete user data: IDB =', JSON.stringify(await idbState(page)));
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await firstLoad(page, base); await openAudio(page, 'flute');
  out('  card after reset =', await packCard(page));
  out('ERRORS other than undefinedblob (capped)', JSON.stringify(errors.filter((e) => !e.includes('mainmenu-neon') && !e.includes('undefinedblob')).slice(0, 12)));
}, { port: 3784, timeout: 8000 });
