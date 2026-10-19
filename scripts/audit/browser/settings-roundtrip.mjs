// WF-018: one setting per Settings tab: apply, save, reload, server restart, read-back from UI and the settings table; default after reset; save and load failures.
// Env: DATA
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { withServer, text } from './harness.mjs';
import { firstLoad, rpc } from './setup-common.mjs';
const data = process.env.DATA;
const out = (...a) => console.log(...a);
let Database = null;
try { Database = createRequire('/media/storage/LumaKeys/package.json')('better-sqlite3'); } catch (e) { out('better-sqlite3 unavailable:', e.message.slice(0, 80)); }
const dbRow = (cat, key) => { if (!Database) return 'n/a'; const db = new Database(`${data}/lumakeys.db`, { readonly: true }); try { return db.prepare('select value from settings where category=? and key=?').get(cat, key)?.value ?? null; } finally { db.close(); } };
const dbCount = () => { if (!Database) return 'n/a'; const db = new Database(`${data}/lumakeys.db`, { readonly: true }); try { return db.prepare('select count(*) c from settings').get().c; } finally { db.close(); } };

// [tab, label shown in the panel, kind, new value, category, key]
const CHANGES = [
  ['audio', 'Metronome Sound', 'select', 'wood', 'audio', 'metronomeSound'],
  ['audio', 'Master Volume', 'range', '55', 'audio', 'masterVolume'],
  ['visual', 'Theme', 'select', 'light', 'visual', 'theme'],
  ['gameplay', 'Timing Leniency', 'select', '', 'gameplay', 'hitWindowMs'], // option chosen at run time
  ['input', 'Play Notes With', 'select', 'computer-keyboard', 'input', 'mode'],
  ['practice', 'Daily Goal', 'number', '25', 'practice', 'dailyGoalMinutes'],
];
const ctl = (page, tab, label) => page.locator(`#settings-panel-${tab} label`).filter({ hasText: new RegExp(label, 'i') }).locator('select, input').first();
const openSettings = async (page, tab) => { await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700); await page.locator(`#settings-tab-${tab}`).click(); await page.waitForTimeout(250); };
const readUi = async (page) => {
  const res = {};
  await openSettings(page, 'audio');
  for (const [tab, label, kind, , cat, key] of CHANGES) {
    await page.locator(`#settings-tab-${tab}`).click(); await page.waitForTimeout(150);
    res[`${cat}.${key}`] = await ctl(page, tab, label).inputValue();
  }
  return res;
};
const statusLine = async (page) => page.locator('.settings-status-message').innerText().catch(() => '?');
async function setValue(page, [tab, label, kind, value]) {
  await page.locator(`#settings-tab-${tab}`).click(); await page.waitForTimeout(150);
  const c = ctl(page, tab, label);
  if (kind === 'select') await c.selectOption(value);
  else if (kind === 'range') await c.evaluate((el, v) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, value);
  else { await c.fill(value); await c.blur(); }
}
const stored = async (base) => Object.fromEntries(await Promise.all(CHANGES.map(async ([, , , , cat, key]) => [`${cat}.${key}`, await rpc(base, 'getSetting', [cat, key])])));

await withServer(data, async ({ page, base, errors, restart }) => {
  await firstLoad(page, base);
  await openSettings(page, 'audio');
  // pick a non-default timing leniency option
  const lenOpts = await ctl(page, 'gameplay', 'Timing Leniency').evaluate((s) => [...s.options].map((o) => o.value + ':' + o.textContent)).catch(() => []);
  await page.locator('#settings-tab-gameplay').click();
  const lenOptions = await ctl(page, 'gameplay', 'Timing Leniency').evaluate((s) => [...s.options].map((o) => o.value));
  CHANGES[3][3] = lenOptions.find((v) => v !== '100') ?? '150';
  out('Timing Leniency options', JSON.stringify(lenOptions), '-> using', CHANGES[3][3]);
  out('defaults in UI :', JSON.stringify(await readUi(page)));
  out('defaults in DB : settings rows =', dbCount());

  // 1. apply + save
  await openSettings(page, 'audio');
  for (const ch of CHANGES) { await setValue(page, ch); await page.waitForTimeout(600); out(`set ${ch[4]}.${ch[5]}=${ch[3]} -> status "${await statusLine(page)}"`); }
  await page.waitForTimeout(500);
  out('applied: html data-theme =', await page.evaluate(() => document.documentElement.dataset.theme));
  out('stored via bridge:', JSON.stringify(await stored(base)));
  out('stored in table :', JSON.stringify(Object.fromEntries(CHANGES.map(([, , , , c, k]) => [`${c}.${k}`, dbRow(c, k)]))));

  // 2. reload, 3. restart
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  out('after reload   UI:', JSON.stringify(await readUi(page)), '| data-theme', await page.evaluate(() => document.documentElement.dataset.theme));
  await restart(); await page.goto(base + '/', { waitUntil: 'networkidle' });
  out('after restart  UI:', JSON.stringify(await readUi(page)), '| data-theme', await page.evaluate(() => document.documentElement.dataset.theme));
  out('after restart DB:', JSON.stringify(Object.fromEntries(CHANGES.map(([, , , , c, k]) => [`${c}.${k}`, dbRow(c, k)]))));
  await page.screenshot({ path: `${process.env.TMPDIR}/p11/FA/settings-after-restart.png` });

  // 4. save failures
  for (const mode of ['http500', 'abort']) {
    out(`\n--- save failure: ${mode} ---`);
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await page.route('**/api/bridge/setSetting', (route) => (mode === 'abort' ? route.abort('failed') : route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'disk full (audit)' }) })));
    await openSettings(page, 'visual');
    const target = mode === 'abort' ? 'warm' : 'dark';
    await ctl(page, 'visual', 'Theme').selectOption(target); await page.waitForTimeout(700);
    out(`theme -> ${target}: status "${await statusLine(page)}" | toast`, JSON.stringify(await page.locator('.toast, [role="alert"], [role="status"]').allInnerTexts()), '| select shows', await ctl(page, 'visual', 'Theme').inputValue(), '| data-theme', await page.evaluate(() => document.documentElement.dataset.theme));
    // debounced range
    await page.locator('#settings-tab-audio').click();
    await setValue(page, CHANGES[1].with ? CHANGES[1] : ['audio', 'Master Volume', 'range', mode === 'abort' ? '30' : '35']); await page.waitForTimeout(900);
    out(`master volume -> ${mode === 'abort' ? 30 : 35}: status "${await statusLine(page)}"`);
    // leave and return to Settings in the same session: what does it show?
    await page.getByRole('button', { name: /Back to Main Menu/i }).click(); await page.waitForTimeout(400);
    await openSettings(page, 'visual');
    out('re-opened Settings in the same session: Theme select =', await ctl(page, 'visual', 'Theme').inputValue(), '| data-theme =', await page.evaluate(() => document.documentElement.dataset.theme), '| stored =', await rpc(base, 'getSetting', ['visual', 'theme']));
    await page.unroute('**/api/bridge/setSetting');
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    out('after reload: data-theme =', await page.evaluate(() => document.documentElement.dataset.theme), '| UI', JSON.stringify((await readUi(page))));
  }

  // 5. load failure inside Settings (getSetting fails)
  out('\n--- load failure inside Settings ---');
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.route('**/api/bridge/getSetting', (route) => route.abort('failed'));
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(1500);
  out('status:', JSON.stringify(await statusLine(page)));
  out('values shown while stored values exist:', JSON.stringify(await readUi(page).catch((e) => 'readUi failed ' + e.message.slice(0, 60))));
  await page.unroute('**/api/bridge/getSetting');

  // 6. startup load failure (getSetting fails while the app boots)
  out('\n--- startup load failure ---');
  await page.route('**/api/bridge/getSetting', (route) => route.abort('failed'));
  await page.goto(base + '/', { waitUntil: 'load' }); await page.waitForTimeout(2500);
  const bootText = await text(page);
  out('page after boot with getSetting failing: screen starts', JSON.stringify(bootText.replace(/\n+/g, ' / ').slice(0, 120)), '| shows startup error:', /Defaults are active/.test(bootText), JSON.stringify(bootText.match(/[^\n]*Defaults are active[^\n]*/)?.[0] ?? null));
  await page.screenshot({ path: `${process.env.TMPDIR}/p11/FA/settings-startup-failure.png` });
  await page.unroute('**/api/bridge/getSetting');

  // 7. defaults after "Delete user data"
  out('\n--- defaults after Delete user data ---');
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await openSettings(page, 'practice');
  await page.getByRole('button', { name: /Delete user data/i }).click(); await page.waitForTimeout(400);
  const confirm = page.getByRole('dialog').getByRole('button', { name: /delete|confirm/i }).last();
  out('confirm dialog buttons:', JSON.stringify(await page.getByRole('dialog').getByRole('button').allInnerTexts()));
  await confirm.click(); await page.waitForTimeout(1500);
  out('status after delete:', JSON.stringify(await statusLine(page).catch(() => '?')), '| settings rows =', dbCount());
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await firstLoad(page, base);
  out('defaults restored UI:', JSON.stringify(await readUi(page)), '| data-theme', await page.evaluate(() => document.documentElement.dataset.theme));
  out('ERRORS', JSON.stringify(errors.filter((e) => !e.includes('"off"') && !e.includes('mainmenu-neon') && !/status of 500|ERR_FAILED/.test(e))));
}, { port: 3783, timeout: 8000 });
