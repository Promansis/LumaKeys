// Owed proof for PH-ARCH-002 (Electron): force a settings write to fail and check the UI
// says "Save failed" and that the controls then read back the value that is stored.
// Env: PROFILE (empty dir under $TMPDIR), LK_SQLITE_MODULE (Electron-ABI better-sqlite3),
//      METHOD = ipc | trigger.
//   ipc     overrides the main-process 'settings:set' handler through electronApp.evaluate.
//   trigger adds SQLite triggers on the settings table while the app is closed
//           (BEFORE INSERT and BEFORE UPDATE raise ABORT), then drops them for the retry run.
//           The insert trigger skips the fingering.handSize seed that AppDatabase runs at start-up
//           as INSERT OR IGNORE: a BEFORE INSERT trigger fires even when the row exists, and
//           without the exception the app never opens a window.
// Run from $TMPDIR/pw (needs the Playwright install next to it).
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const Database = createRequire(path.join(REPO, 'package.json'))('better-sqlite3');
const profile = process.env.PROFILE;
const method = process.env.METHOD;
if (!['ipc', 'trigger'].includes(method)) throw new Error('METHOD must be ipc or trigger');
const shots = path.join(profile, 'shots');
fs.mkdirSync(shots, { recursive: true });
const dbPath = path.join(profile, '.config', 'lumakeys', 'lumakeys.db');
const stored = (cat, key) => {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try { return db.prepare('select value from settings where category=? and key=?').get(cat, key)?.value ?? null; } finally { db.close(); }
};
const sql = (q) => { const db = new Database(dbPath, { fileMustExist: true }); try { db.exec(q); } finally { db.close(); } };
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} :: ${JSON.stringify(detail)}`); };
const bridge = (page, m, args = []) => page.evaluate(([m, a]) => window.appBridge[m](...a).then((r) => r, (e) => ({ error: String(e) })), [m, args]);
const ctl = (page, tab, label) => page.locator(`#settings-panel-${tab} label`).filter({ hasText: new RegExp(label, 'i') }).locator('select, input').first();
const openSettings = async (page, tab) => {
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700);
  await page.locator(`#settings-tab-${tab}`).click(); await page.waitForTimeout(250);
};
const status = (page) => page.locator('.settings-status-message').innerText().catch(() => '?');
const toasts = (page) => page.locator('.toast-item').allInnerTexts();
const setRange = (c, v) => c.evaluate((el, v) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
}, v);
const backToMain = async (page) => {
  await page.getByRole('button', { name: /^(Back to Main Menu|Main Menu|Main)$/ }).filter({ visible: true }).first().click().catch(() => {});
  await page.waitForTimeout(600);
};
const c4 = (page) => page.locator('.keyboard-bind-key[aria-label^="Bind C4 to "]').first();
const c4Label = async (page) => (await c4(page).getAttribute('aria-label'))?.replace('Bind C4 to ', '');
const openKeyboardSetup = async (page) => {
  await openSettings(page, 'input');
  await page.getByRole('button', { name: /Edit Key Layout/ }).click(); await page.waitForTimeout(700);
};
const kbStatus = (page) => page.locator('.keyboard-setup-hero .song-title').innerText().catch(() => '?');
const skipGuide = async (page) => {
  await page.waitForTimeout(2500);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForTimeout(400);
};
const theme = (page) => page.evaluate(() => document.documentElement.dataset.theme);

// Phase 1: baseline writes with no failure.
await withElectron(profile, async (h) => {
  const { page } = h;
  await skipGuide(page);
  console.log('ELECTRON', await h.app.evaluate(({ app }) => process.versions.electron + ' chrome ' + process.versions.chrome), 'METHOD', method);
  await openSettings(page, 'visual');
  await ctl(page, 'visual', 'Theme').selectOption('light'); await page.waitForTimeout(700);
  check('baseline theme save', (await status(page)) === 'Changes saved.' && stored('visual', 'theme') === 'light', { status: await status(page), stored: stored('visual', 'theme') });
  await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(200);
  await setRange(ctl(page, 'audio', 'Master Volume'), '55'); await page.waitForTimeout(1000);
  check('baseline volume save', stored('audio', 'masterVolume') === '55', { status: await status(page), stored: stored('audio', 'masterVolume') });
  await backToMain(page);
  await openKeyboardSetup(page);
  const defaultC4 = await c4Label(page);
  await c4(page).click(); await page.waitForTimeout(150);
  await page.keyboard.press('KeyK'); await page.waitForTimeout(700);
  check('baseline keyboard bind save', (await kbStatus(page)) === 'C4 set to K.' && /KeyK/.test(stored('input', 'keyboardMapping') ?? ''), { default: defaultC4, status: await kbStatus(page), c4: await c4Label(page) });
  await backToMain(page); await backToMain(page);
  fs.writeFileSync(path.join(profile, 'baseline.json'), JSON.stringify({ defaultC4, mapping: stored('input', 'keyboardMapping') }));
});

if (method === 'trigger') {
  sql(`CREATE TRIGGER inj_settings_ins BEFORE INSERT ON settings WHEN NOT (NEW.category = 'fingering' AND NEW.key = 'handSize') BEGIN SELECT RAISE(ABORT,'injected write failure'); END;
       CREATE TRIGGER inj_settings_upd BEFORE UPDATE ON settings BEGIN SELECT RAISE(ABORT,'injected write failure'); END;`);
  console.log('INJECTED sqlite triggers on settings (app closed)');
}

// Phase 2: the failing run.
const baseline = JSON.parse(fs.readFileSync(path.join(profile, 'baseline.json'), 'utf8'));
await withElectron(profile, async (h) => {
  let { page } = h;
  await skipGuide(page);
  if (method === 'ipc') {
    await h.app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('settings:set');
      ipcMain.handle('settings:set', async () => { throw new Error('injected write failure'); });
    });
    console.log('INJECTED ipc handler override for settings:set');
  }
  const probe = await bridge(page, 'setSetting', ['audit', 'probe', '1']);
  check('injection active (bridge setSetting rejects/errors)', !!probe?.error, probe);

  // Settings select (immediate write)
  await openSettings(page, 'visual');
  const before = { theme: await ctl(page, 'visual', 'Theme').inputValue(), stored: stored('visual', 'theme') };
  await ctl(page, 'visual', 'Theme').selectOption('warm'); await page.waitForTimeout(900);
  const st = await status(page); const tt = await toasts(page);
  await page.screenshot({ path: path.join(shots, `${method}-01-theme-save-failed.png`) });
  check('theme: UI says Save failed', /Save failed\. The change is active for this session only\./.test(st), { before, status: st, toasts: tt });
  check('theme: toast says not saved', tt.some((t) => /Setting not saved/.test(t)), tt);
  check('theme: stored value unchanged', stored('visual', 'theme') === 'light' && (await bridge(page, 'getSetting', ['visual', 'theme'])) === 'light', { db: stored('visual', 'theme'), bridge: await bridge(page, 'getSetting', ['visual', 'theme']) });
  const live = { select: await ctl(page, 'visual', 'Theme').inputValue(), dataTheme: await theme(page) };
  console.log('INFO theme in-session (session-only) state', JSON.stringify(live));

  // Settings range (debounced write)
  await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(200);
  await setRange(ctl(page, 'audio', 'Master Volume'), '30'); await page.waitForTimeout(1200);
  const st2 = await status(page);
  check('volume: UI says Save failed', /Save failed/.test(st2), { status: st2 });
  check('volume: stored value unchanged', stored('audio', 'masterVolume') === '55', { db: stored('audio', 'masterVolume') });

  // Leave and re-open Settings in the same session: what does each control read back?
  await backToMain(page);
  await openSettings(page, 'visual');
  const reTheme = await ctl(page, 'visual', 'Theme').inputValue();
  await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(200);
  const reVol = await ctl(page, 'audio', 'Master Volume').inputValue();
  await page.screenshot({ path: path.join(shots, `${method}-02-settings-reopened.png`) });
  console.log('INFO settings re-opened same session: theme', reTheme, 'volume', reVol, 'data-theme', await theme(page));
  check('settings re-open: controls read back stored values (theme light, volume 55)', reTheme === 'light' && reVol === '55', { reTheme, reVol, dataTheme: await theme(page) });
  await backToMain(page);

  // Keyboard Setup: bind, clear, reset
  await openKeyboardSetup(page);
  const c4Before = await c4Label(page);
  await c4(page).click(); await page.waitForTimeout(150);
  await page.keyboard.press('KeyJ'); await page.waitForTimeout(800);
  const ks = await kbStatus(page); const kt = await toasts(page);
  await page.screenshot({ path: path.join(shots, `${method}-03-keyboard-save-failed.png`) });
  check('keyboard bind: UI says session only / Save failed', /Mapping active for this session only\. Save failed; try again\./.test(ks), { c4Before, status: ks, c4Now: await c4Label(page), toasts: kt });
  check('keyboard bind: toast', kt.some((t) => /Keyboard mapping not saved/.test(t)), kt);
  check('keyboard bind: stored mapping unchanged', stored('input', 'keyboardMapping') === baseline.mapping, { storedMappingSameAsBaseline: true });
  await page.getByRole('button', { name: 'Reset Mapping' }).first().click().catch(async () => { await page.locator('.keyboard-setup-hero .secondary-button').first().click(); });
  await page.waitForTimeout(800);
  const rs = await kbStatus(page);
  check('keyboard reset: UI says Save failed', /Save failed/.test(rs), { status: rs });
  check('keyboard reset: stored mapping unchanged', stored('input', 'keyboardMapping') === baseline.mapping, {});
  await backToMain(page); await backToMain(page);
  await openKeyboardSetup(page);
  const c4Re = await c4Label(page);
  await page.screenshot({ path: path.join(shots, `${method}-04-keyboard-reopened.png`) });
  check('keyboard re-open: C4 reads back the stored binding (K)', c4Re === 'K', { c4Re, defaultC4: baseline.defaultC4 });
  await backToMain(page); await backToMain(page);

  // Relaunch (injection state: ipc override is gone with the process; the trigger stays)
  ({ page } = await h.relaunch());
  await skipGuide(page);
  await openSettings(page, 'visual');
  const rt = await ctl(page, 'visual', 'Theme').inputValue();
  await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(200);
  const rv = await ctl(page, 'audio', 'Master Volume').inputValue();
  check('relaunch: theme and volume read back stored values', rt === 'light' && rv === '55', { rt, rv, dataTheme: await theme(page) });
  await backToMain(page);
  await openKeyboardSetup(page);
  check('relaunch: C4 reads back K', (await c4Label(page)) === 'K', { c4: await c4Label(page) });
  await backToMain(page); await backToMain(page);
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 10)));
});

if (method === 'trigger') {
  sql('DROP TRIGGER inj_settings_ins; DROP TRIGGER inj_settings_upd;');
  console.log('REMOVED triggers');
}

// Phase 3 (ipc: the injection died with the process): the same change now saves.
await withElectron(profile, async (h) => {
  const { page } = h;
  await skipGuide(page);
  await openSettings(page, 'visual');
  await ctl(page, 'visual', 'Theme').selectOption('warm'); await page.waitForTimeout(900);
  check('retry after failure removed: saved', (await status(page)) === 'Changes saved.' && stored('visual', 'theme') === 'warm', { status: await status(page), stored: stored('visual', 'theme') });
});

const failed = results.filter((r) => !r.ok);
console.log(`SUMMARY ${method}: ${results.length - failed.length}/${results.length} checks passed`, failed.map((f) => f.name));
console.log('DONE');
