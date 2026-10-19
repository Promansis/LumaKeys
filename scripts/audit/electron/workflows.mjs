// Desktop halves of WF-001, WF-004, WF-005, WF-009, WF-010, WF-024 and the PH-MUS-005
// check (keys after clicking Resume). Fixtures are generated under PROFILE.
// Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE (under $TMPDIR) set.
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire(path.join(REPO, 'package.json'));
const { Midi } = req('@tonejs/midi');
const Database = req('better-sqlite3');
const profile = process.env.PROFILE;
const CUR = path.join(REPO, 'public/curriculum-midis');
const fx = path.join(profile, 'fx');
const folder = path.join(fx, 'folder');
fs.mkdirSync(path.join(folder, 'sub', 'deeper'), { recursive: true });
const short = new Midi(); short.header.setTempo(120);
const tr = short.addTrack();
[60, 62, 64, 65].forEach((m, i) => tr.addNote({ midi: m, time: 1 + i * 0.6, duration: 0.4, velocity: 0.8 }));
fs.writeFileSync(path.join(fx, 'short-4-notes.mid'), Buffer.from(short.toArray()));
fs.copyFileSync(path.join(CUR, 'mary-had-a-little-lamb.mid'), path.join(fx, 'mary.mid'));
fs.writeFileSync(path.join(fx, 'empty.mid'), Buffer.alloc(0));
fs.writeFileSync(path.join(fx, 'corrupt.mid'), Buffer.from('MThd this is not a midi file at all'));
fs.writeFileSync(path.join(fx, 'notes.txt'), 'hello');
fs.copyFileSync(path.join(CUR, 'ode-to-joy.mid'), path.join(folder, 'a.mid'));
fs.copyFileSync(path.join(CUR, 'minuet-in-g.mid'), path.join(folder, 'sub', 'B.MIDI'));
fs.copyFileSync(path.join(CUR, 'prelude-in-c.mid'), path.join(folder, 'sub', 'deeper', 'c.mid'));
fs.copyFileSync(path.join(CUR, 'ode-to-joy.mid'), path.join(folder, 'sub', 'dup-of-a.mid'));
fs.copyFileSync(path.join(fx, 'corrupt.mid'), path.join(folder, 'bad.mid'));
fs.writeFileSync(path.join(folder, 'readme.txt'), 'x');
try { fs.symlinkSync(folder, path.join(folder, 'sub', 'loop')); } catch {}

const bridge = (page, m, args = []) => page.evaluate(([m, a]) => window.appBridge[m](...a).then((r) => r, (e) => ({ error: String(e) })), [m, args]);
const statusLine = async (page, re) => JSON.stringify((await text(page)).match(re));
const hud = async (page) => (await text(page)).match(/SCORE\n(\d+)\nCOMBO\n([^\n]+)/)?.slice(1).join(' | ') ?? 'n/a';
const isMain = async (page) => (await text(page)).includes('Training and Setup');

await withElectron(profile, async (h) => {
  let { page } = h;
  await page.waitForTimeout(2500);
  // WF-001 first run
  console.log('WF-001 first launch shows setup guide', /FIRST PRACTICE SETUP/i.test(await text(page)));
  await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForTimeout(500);
  console.log('WF-001 after skip on main menu', await isMain(page));
  ({ page } = await h.relaunch());
  await page.waitForTimeout(2500);
  console.log('WF-001 relaunch shows guide again', /FIRST PRACTICE SETUP/i.test(await text(page)), 'on main menu', await isMain(page));

  // WF-004 Upload MIDI
  await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(800);
  const upload = async (files, label) => {
    await h.stubOpen(files);
    await page.getByRole('button', { name: 'Upload MIDI', exact: true }).click(); await page.waitForTimeout(1800);
    console.log(`WF-004 ${label}:`, await statusLine(page, /[^\n]*(Imported|import|skipped|failed|already|corrupt|empty|No MIDI|canceled)[^\n]{0,200}/i), 'songs', (await bridge(page, 'getAllSongs')).length);
  };
  await upload([path.join(fx, 'short-4-notes.mid'), path.join(fx, 'mary.mid')], 'two valid files');
  await upload([path.join(fx, 'mary.mid')], 'duplicate');
  await upload([path.join(fx, 'empty.mid'), path.join(fx, 'corrupt.mid'), path.join(fx, 'notes.txt')], 'empty, corrupt, txt');
  await upload([], 'cancel');
  console.log('WF-004 midi-files on disk', fs.readdirSync(path.join(h.userData, 'midi-files')).length);

  // WF-005 Import Folder
  await h.stubOpen([folder]);
  await page.getByRole('button', { name: 'Import Folder', exact: true }).click(); await page.waitForTimeout(2500);
  console.log('WF-005 folder import:', await statusLine(page, /[^\n]*(Imported|import|skipped|failed|corrupt)[^\n]{0,240}/i), 'songs', JSON.stringify((await bridge(page, 'getAllSongs')).map((s) => s.title).sort()));
  await h.stubOpen([]);
  await page.getByRole('button', { name: 'Import Folder', exact: true }).click(); await page.waitForTimeout(800);
  console.log('WF-005 folder cancel:', await statusLine(page, /[^\n]*(Imported|import|canceled|cancelled)[^\n]{0,160}/i));
  await h.stubOpen([path.join(fx, 'no-such-dir')]);
  await page.getByRole('button', { name: 'Import Folder', exact: true }).click(); await page.waitForTimeout(800);
  console.log('WF-005 missing folder:', await statusLine(page, /[^\n]*(Imported|import|No MIDI|canceled|failed)[^\n]{0,160}/i));

  // WF-009 / WF-010 play the short song in each mode with computer keys
  const song = (await bridge(page, 'getAllSongs')).find((s) => s.title === 'short-4-notes');
  const card = () => page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: /^short-4-notes$/ }) }).first();
  for (const MODE of ['Learn', 'Play']) {
    await card().getByRole('button', { name: MODE, exact: true }).click(); await page.waitForTimeout(1200);
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Space');
    const t0 = Date.now(); const log = [];
    for (const k of ['Comma', 'Period', 'Slash', 'KeyQ']) {
      const start = await hud(page); let changed = false;
      for (let i = 0; i < 40 && !changed; i++) { await page.keyboard.down(k); await page.waitForTimeout(60); await page.keyboard.up(k); await page.waitForTimeout(90); const now = await hud(page); if (now !== start) { changed = true; log.push(`${k}@${Date.now() - t0}ms -> ${now}`); } }
      if (!changed) log.push(`${k} never scored (${start})`);
    }
    let done = false;
    for (let i = 0; i < 15 && !done; i++) { await page.waitForTimeout(1000); done = (await text(page)).includes('FINAL SCORE'); }
    console.log(`WF-009 ${MODE}`, JSON.stringify(log));
    console.log(`WF-010 ${MODE} results screen`, done, JSON.stringify((await text(page)).match(/FINAL SCORE\n\d+|[\d.]+% accuracy|PERFECT\n\d+|GOOD\n\d+|OK\n\d+|MISS\n\d+/g)));
    await page.screenshot({ path: path.join(profile, `results-${MODE}.png`) });
    await page.getByRole('button', { name: /Library|Back to Library/ }).first().click().catch(async () => { await page.getByRole('button', { name: /Main Menu/ }).first().click(); await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); });
    await page.waitForTimeout(800);
    if (!(await card().count())) { await page.getByRole('button', { name: 'Play Songs', exact: true }).click().catch(() => {}); await page.waitForTimeout(800); }
  }
  console.log('WF-010 rows', JSON.stringify((await bridge(page, 'getGameResults', [song.id])).map((r) => [r.mode, r.score, r.perfectHits, r.goodHits, r.okHits, r.misses])));

  // PH-MUS-005, same sequence as the web evidence: Learning run, hit C4, Escape, click
  // Resume, press D4 30 times, then click the canvas and press D4 again.
  const press = async (k, tries) => { const start = await hud(page); for (let i = 0; i < tries; i++) { await page.keyboard.down(k); await page.waitForTimeout(60); await page.keyboard.up(k); await page.waitForTimeout(90); if ((await hud(page)) !== start) return `${start} -> ${await hud(page)}`; } return `unchanged (${start})`; };
  await card().getByRole('button', { name: 'Learn', exact: true }).click(); await page.waitForTimeout(1200);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space');
  console.log('PH-MUS-005 C4 before pausing', await press('Comma', 40));
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Resume' }).click(); await page.waitForTimeout(500);
  const focus = await page.evaluate(() => `${document.activeElement?.tagName} ${(document.activeElement?.textContent || '').trim().slice(0, 30)}`);
  console.log('PH-MUS-005 focus after Resume', JSON.stringify(focus), 'D4 x30 after Resume', await press('Period', 30));
  await page.locator('canvas').first().click({ position: { x: 300, y: 200 } }); await page.waitForTimeout(300);
  console.log('PH-MUS-005 D4 after clicking the canvas', await press('Period', 30));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Main Menu/ }).first().click().catch(() => {}); await page.waitForTimeout(800);

  // WF-024 every main-menu destination has an exit
  const NAV = ['Guided Lessons', 'Free Play', 'Soundboard', 'Theory Trainer', 'Progress', 'Settings', 'Keyboard Setup', 'Play Songs', 'Start Song'];
  for (const nav of NAV) {
    if (!(await isMain(page))) { await page.getByRole('button', { name: /^(Back to Main Menu|Main Menu)$/ }).first().click().catch(() => {}); await page.waitForTimeout(600); }
    await page.getByRole('button', { name: nav, exact: true }).first().click(); await page.waitForTimeout(1500);
    let how = 'none';
    const back = page.getByRole('button', { name: /^(Back to Main Menu|Back|Main Menu)$/ }).filter({ visible: true }).first();
    if (await back.count()) { how = 'back button'; await back.click(); }
    else if (await page.getByRole('button', { name: 'HUD' }).count()) {
      how = 'HUD then Main';
      await page.getByRole('button', { name: 'HUD' }).click(); await page.waitForTimeout(400);
      await page.getByRole('button', { name: 'Main', exact: true }).filter({ visible: true }).first().click().catch(() => { how += ' (Main not clickable)'; });
    }
    else if (await page.getByRole('button', { name: 'Main', exact: true }).filter({ visible: true }).count()) {
      how = 'top-nav Main'; await page.getByRole('button', { name: 'Main', exact: true }).filter({ visible: true }).first().click();
    } else await page.screenshot({ path: path.join(profile, `no-exit-${nav.replace(/ /g, '-')}.png`) });
    await page.waitForTimeout(700);
    console.log(`WF-024 ${nav} via ${how} -> main menu: ${await isMain(page)}`);
  }
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 12)));
});
const db = new Database(path.join(profile, '.config/lumakeys/lumakeys.db'), { readonly: true });
console.log('PH-ARCH-003 Electron settings with "off"', JSON.stringify(db.prepare("select category, key, value from settings where value = 'off'").all()));
db.close();
console.log('DONE');
