// PH-DATA-002 proof, web runtime: capture the Delete User Data confirmation copy, then compare a
// before/after inventory (database tables, data dir, localStorage, IndexedDB, pack status) with what
// the copy says is removed. A second browser context stands in for "another device" on the same server.
// Env: REPO, DATA (empty dir under $TMPDIR), EVID, PORT (3910-3919), PLAYWRIGHT_BROWSERS_PATH.
import fs from 'node:fs';
import path from 'node:path';
import * as playwright from 'playwright';
import { REPO, startServer, inventory, summarize, dbDiff, fsDiff, ls, text, visibleStatus, seedRich, browserState } from './proof-data-common.mjs';

const DATA = process.env.DATA; const EVID = process.env.EVID; const PORT = Number(process.env.PORT ?? 3911);
if (!DATA || !EVID) throw new Error('set DATA and EVID');
if (!process.env.TMPDIR || !DATA.startsWith(process.env.TMPDIR)) throw new Error('DATA must be under $TMPDIR');
fs.mkdirSync(EVID, { recursive: true });
const DBF = path.join(DATA, 'lumakeys.db');
const MIDI = path.join(REPO, 'public/curriculum-midis');
const log = (...a) => console.log(...a);
const save = (name, obj) => fs.writeFileSync(path.join(EVID, name + '.json'), JSON.stringify(obj, null, 1));

const server = await startServer(DATA, PORT);
if (!server.ok) throw new Error('server did not start');
const browser = await playwright.chromium.launch();
log('versions: node', process.version, '| chromium', browser.version());
const mk = async () => { const c = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const p = await c.newPage(); p.setDefaultTimeout(10000); return { c, p }; };
const A = await mk(); const B = await mk();
const page = A.p;
const call = (m, args = []) => page.evaluate(([m, a]) => window.appBridge[m](...a), [m, args]);
const skipGuide = async (p) => { const skip = p.getByRole('button', { name: /Skip for now/i }); if (await skip.count()) { await skip.click(); await p.waitForTimeout(400); } };
const bridgeState = async (p) => p.evaluate(async () => ({
  songs: (await window.appBridge.getAllSongs()).length,
  folders: (await window.appBridge.getAllFolders()).length,
  playlists: (await window.appBridge.getAllPlaylists()).length,
  installedPacks: (await window.appBridge.getInstrumentSamplePackStatuses()).filter((s) => s.isInstalled).map((s) => s.instrumentId),
}));

// ---- seed through the UI where it exists, the bridge for the rest
await page.goto(server.base + '/', { waitUntil: 'networkidle' }); await skipGuide(page);
await page.getByRole('button', { name: 'Play' }).first().click();
await page.getByRole('heading', { name: 'Your Library' }).waitFor();
const mids = fs.readdirSync(MIDI).filter((f) => f.endsWith('.mid')).slice(0, 3).map((f) => path.join(MIDI, f));
{ const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Upload MIDI/ }).click()]); await ch.setFiles(mids); await page.waitForTimeout(2500); }
const songs = await call('getAllSongs');
await seedRich(call, songs);
await page.evaluate(() => localStorage.setItem('lumakeys-filter-presets', JSON.stringify({ proof: { text: 'x' } })));
// install the Flute pack from Settings > Audio (IndexedDB on the web)
await page.goto(server.base + '/', { waitUntil: 'networkidle' }); await skipGuide(page);
await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700);
await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(250);
await page.locator('#settings-panel-audio label').filter({ hasText: /^Instrument/i }).locator('select').first().selectOption('flute'); await page.waitForTimeout(1000);
const adv = page.getByRole('button', { name: /show advanced options/i }); if (await adv.count()) { await adv.first().click(); await page.waitForTimeout(250); }
await page.getByRole('button', { name: /Install Better Sounds/ }).click(); await page.waitForTimeout(3500);
log('pack status after install:', JSON.stringify(await bridgeState(page)));

// second "device"
await B.p.goto(server.base + '/', { waitUntil: 'networkidle' }); await skipGuide(B.p);
await B.p.evaluate(() => localStorage.setItem('lumakeys-filter-presets', JSON.stringify({ deviceB: true })));

// ---- before inventory
const invBefore = inventory(DATA, DBF);
const brBefore = await browserState(page);
const stBefore = await bridgeState(page);
const brBeforeB = await browserState(B.p);
log('\nBEFORE db:', summarize(invBefore), '\n  unlocked achievements', invBefore.db.unlockedAchievements, 'settings keys', JSON.stringify(invBefore.db.settings));
log('BEFORE browser A:', JSON.stringify(brBefore), '\nBEFORE bridge A:', JSON.stringify(stBefore));
save('before', { invBefore, brBefore, stBefore, brBeforeB });

// ---- the confirmation dialog
await page.goto(server.base + '/', { waitUntil: 'networkidle' }); await skipGuide(page);
await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(600);
await page.getByRole('tab', { name: 'Practice' }).click(); await page.waitForTimeout(300);
const card = await page.locator('.settings-danger-card').filter({ hasText: 'Delete User Data' }).innerText();
const groupCard = await page.locator('.settings-danger-zone').innerText();
await page.getByRole('button', { name: 'Delete User Data' }).click(); await page.waitForTimeout(400);
const dlg = page.getByRole('dialog');
const dialogText = await dlg.innerText();
const dialogAria = await dlg.evaluate((el) => ({ role: el.getAttribute('role'), label: el.getAttribute('aria-label'), labelledby: el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.innerText, describedby: el.getAttribute('aria-describedby') && document.getElementById(el.getAttribute('aria-describedby'))?.innerText }));
await page.screenshot({ path: path.join(EVID, 'confirm-dialog.png') });
log('\nSETTINGS DANGER ZONE TEXT:', JSON.stringify(groupCard));
log('DELETE USER DATA CARD TEXT:', JSON.stringify(card));
log('CONFIRM DIALOG TEXT (exact):', JSON.stringify(dialogText));
log('CONFIRM DIALOG ARIA:', JSON.stringify(dialogAria));
save('dialog', { groupCard, card, dialogText, dialogAria });

// ---- confirm
await dlg.getByRole('button', { name: 'Delete User Data' }).click();
await page.waitForTimeout(2000);
const afterStatus = await visibleStatus(page);
await page.screenshot({ path: path.join(EVID, 'after-reset.png') });
log('\nAFTER reset UI status:', JSON.stringify(afterStatus));

const invAfter = inventory(DATA, DBF);
const brAfter = await browserState(page);
const stAfter = await bridgeState(page);
log('AFTER db:', summarize(invAfter), '\n  unlocked achievements', invAfter.db.unlockedAchievements, 'settings keys', JSON.stringify(invAfter.db.settings));
log('AFTER browser A:', JSON.stringify(brAfter), '\nAFTER bridge A:', JSON.stringify(stAfter));
log('DB row diff:', JSON.stringify(dbDiff(invBefore.db, invAfter.db)));
log('FS diff:', JSON.stringify(fsDiff(invBefore.fs, invAfter.fs)));

// the second device, same server
await B.p.reload({ waitUntil: 'networkidle' });
const brAfterB = await browserState(B.p); const stAfterB = await bridgeState(B.p);
log('AFTER device B: browser', JSON.stringify(brAfterB), 'bridge', JSON.stringify(stAfterB));
// fresh load on A
await page.goto(server.base + '/', { waitUntil: 'networkidle' });
log('A after reload: setup guide shown =', /FIRST PRACTICE SETUP/i.test(await text(page)));
save('after', { afterStatus, invAfter, brAfter, stAfter, brAfterB, stAfterB, rowDiff: dbDiff(invBefore.db, invAfter.db), fsDiff: fsDiff(invBefore.fs, invAfter.fs) });

await browser.close();
await server.down();
log('DONE');
process.exit(0);
