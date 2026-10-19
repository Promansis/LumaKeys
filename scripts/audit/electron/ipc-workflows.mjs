// Desktop halves of WF-003, WF-007, WF-008, WF-011, WF-012, WF-013, WF-014, WF-017 and
// WF-018: each change goes through the preload IPC bridge, then a relaunch checks what
// survived. Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE (under $TMPDIR) set.
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
const profile = process.env.PROFILE;
const CUR = path.join(REPO, 'public/curriculum-midis');
const bridge = (page, m, args = []) => page.evaluate(([m, a]) => window.appBridge[m](...a).then((r) => r, (e) => ({ error: String(e) })), [m, args]);
const isMain = async (page) => (await text(page)).includes('Training and Setup');
const toMain = async (page) => { if (!(await isMain(page))) { await page.getByRole('button', { name: /^(Back to Main Menu|Main Menu|Main)$/ }).filter({ visible: true }).first().click().catch(() => {}); await page.waitForTimeout(600); } };
const ctl = (page, tab, label) => page.locator(`#settings-panel-${tab} label`).filter({ hasText: new RegExp(label, 'i') }).locator('select, input').first();
const openSettings = async (page, tab) => { await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(700); await page.locator(`#settings-tab-${tab}`).click(); await page.waitForTimeout(250); };
const vis = (page) => page.$$eval('button', (b) => [...new Set(b.filter((x) => x.offsetParent && !x.closest('nav')).map((x) => (x.getAttribute('aria-label') || x.textContent.trim()).slice(0, 40)).filter(Boolean))]);
const openTrainer = async (page, i) => { await toMain(page); await page.getByRole('button', { name: 'Theory Trainer', exact: true }).click(); await page.waitForTimeout(700); await page.getByRole('button', { name: /^Start/ }).nth(i).click(); await page.waitForTimeout(900); };

await withElectron(profile, async (h) => {
  let { page } = h;
  await page.waitForTimeout(2500);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  // seed two songs through the real dialog path
  await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(800);
  await h.stubOpen(['ode-to-joy.mid', 'minuet-in-g.mid'].map((f) => path.join(CUR, f)));
  await page.getByRole('button', { name: 'Upload MIDI', exact: true }).click(); await page.waitForTimeout(2000);
  const songs = await bridge(page, 'getAllSongs');
  const [s1, s2] = songs;
  await toMain(page);

  // WF-018 settings through the Settings screen
  await openSettings(page, 'visual');
  await ctl(page, 'visual', 'Theme').selectOption('light'); await page.waitForTimeout(600);
  await page.locator('#settings-tab-audio').click(); await page.waitForTimeout(250);
  await ctl(page, 'audio', 'Master Volume').fill('55').catch(async () => { await ctl(page, 'audio', 'Master Volume').evaluate((e) => { e.value = '55'; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }); });
  await page.waitForTimeout(600);
  console.log('WF-018 status', JSON.stringify(await page.locator('.settings-status-message').innerText().catch(() => '?')), 'data-theme', await page.evaluate(() => document.documentElement.dataset.theme));
  await toMain(page);

  // WF-003 remap C4 to K
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await page.waitForTimeout(600);
  await page.getByRole('tab', { name: /input/i }).click();
  await page.getByRole('button', { name: /Edit Key Layout/ }).click(); await page.waitForTimeout(600);
  await page.locator('.keyboard-bind-key[aria-label^="Bind C4 to "]').first().click(); await page.waitForTimeout(150);
  await page.keyboard.press('KeyK'); await page.waitForTimeout(600);
  console.log('WF-003 remap status', JSON.stringify(await page.locator('.keyboard-setup-hero .song-title').innerText().catch(() => '?')));
  await toMain(page);

  // WF-007 / WF-008 library organisation and track assignment through IPC
  const folder = await bridge(page, 'createFolder', ['Audit Folder']);
  await bridge(page, 'moveSongToFolder', [s1.id, folder.id ?? folder]);
  const pl = await bridge(page, 'createPlaylist', ['Audit Playlist']);
  await bridge(page, 'addSongToPlaylist', [pl.id ?? pl, s2.id]);
  await bridge(page, 'bulkAddTag', [[s1.id, s2.id], 'audit-tag']);
  await bridge(page, 'toggleFavorite', [s2.id]);
  const full = await bridge(page, 'getSong', [s1.id]);
  const ta = Object.fromEntries(Object.entries(full.trackAssignments ?? { 'track-0': 'right' }).map(([k, v]) => [k, v === 'right' ? 'left' : 'right']));
  console.log('WF-008 track assignments before', JSON.stringify(full.trackAssignments));
  console.log('WF-008 update', String(JSON.stringify(await bridge(page, 'updateSong', [s1.id, { trackAssignments: ta }]))).slice(0, 160), 'requested', JSON.stringify(ta));

  // WF-011 lessons: two tips, then the curriculum MIDI bridge used by song steps and capstones
  await page.getByRole('button', { name: 'Guided Lessons', exact: true }).click(); await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Lesson 1\b/ }).first().click(); await page.waitForTimeout(600);
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: /Complete Tip/ }).click(); await page.waitForTimeout(500); }
  console.log('WF-011 counter after two tips', JSON.stringify((await text(page)).match(/\d+ \/ \d+ STEPS/i)?.[0]));
  const cm = await bridge(page, 'loadCurriculumMidi', ['ode-to-joy.mid']);
  console.log('WF-011 loadCurriculumMidi bytes', cm?.length ?? cm?.byteLength ?? JSON.stringify(cm).slice(0, 200), 'disk bytes', fs.statSync(path.join(CUR, 'ode-to-joy.mid')).size);
  console.log('WF-011 loadCurriculumMidi traversal', JSON.stringify(await bridge(page, 'loadCurriculumMidi', ['../../package.json'])).slice(0, 200));
  await toMain(page);

  // WF-014, WF-013, WF-012 trainers
  await openTrainer(page, 0);
  await page.getByRole('button', { name: 'Start Drill' }).click(); await page.waitForTimeout(600);
  await page.evaluate(() => document.activeElement?.blur());
  for (const k of ['Comma', 'Period', 'Slash', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT']) { await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k); await page.waitForTimeout(450); }
  await page.waitForTimeout(1200);
  console.log('WF-014 scale (C4 is now on K, so Comma plays nothing)', JSON.stringify((await text(page)).match(/PROGRESS\n[^\n]+|(complete|Complete|accuracy)[^\n]{0,80}/g)));
  await openTrainer(page, 1);
  await page.getByRole('button', { name: 'Start Session' }).click(); await page.waitForTimeout(800);
  for (let q = 0; q < 12; q++) { const c = page.locator('.theory-choice-button'); if (!(await c.count())) break; await c.first().click(); await page.waitForTimeout(1600); if (/SUMMARY|Session complete|Play Again|New Session/i.test(await text(page))) break; }
  console.log('WF-013 interval summary', JSON.stringify((await text(page)).match(/[^\n]*(correct|Score|Accuracy|\d+ ?\/ ?\d+)[^\n]*/gi)?.slice(0, 4)));
  await openTrainer(page, 2);
  await page.getByRole('button', { name: 'Chord ID' }).click(); await page.waitForTimeout(800);
  for (let q = 0; q < 14; q++) {
    const btns = (await vis(page)).filter((t) => !/Back|Chord ID|Scale ID|Interval ID|Mixed|Replay|Listen|Hear|HUD|Menu/i.test(t));
    if (!btns.length || /SUMMARY|Final|Review/i.test((await text(page)).slice(-400))) break;
    await page.getByRole('button', { name: btns[0], exact: true }).first().click(); await page.waitForTimeout(500);
    const next = page.getByRole('button', { name: /^(Next|Continue|Finish)/ }); if (await next.count()) { await next.first().click(); await page.waitForTimeout(400); }
  }
  console.log('WF-012 theory rows', JSON.stringify((await bridge(page, 'getTheoryResults', [])).map((r) => [r.type ?? r.quizType, r.score, r.totalQuestions])));
  await toMain(page);

  // WF-017 dashboard after one stored game result
  await bridge(page, 'saveGameResult', [{ songId: s1.id, score: 900, accuracy: 0.8, maxCombo: 5, perfectHits: 4, goodHits: 1, okHits: 0, misses: 1, tempo: 100, mode: 'both', durationSec: 40, measureAccuracy: [{ measure: 0, accuracy: 50 }, { measure: 1, accuracy: 100 }] }]);
  await page.getByRole('button', { name: 'Progress', exact: true }).click(); await page.waitForTimeout(1500);
  console.log('WF-017 dashboard', JSON.stringify((await text(page)).replace(/\n+/g, ' | ').slice(0, 500)));
  await toMain(page);

  // relaunch and read everything back
  ({ page } = await h.relaunch());
  await page.waitForTimeout(2500);
  console.log('after relaunch: data-theme', await page.evaluate(() => document.documentElement.dataset.theme), 'theme/volume', JSON.stringify(await Promise.all([bridge(page, 'getSetting', ['visual', 'theme']), bridge(page, 'getSetting', ['audio', 'masterVolume'])])));
  const map = JSON.parse(await bridge(page, 'getSetting', ['input', 'keyboardMapping']));
  console.log('after relaunch: mapping C4', map['note-12']);
  await page.getByRole('button', { name: 'Free Play', exact: true }).click(); await page.waitForTimeout(1200);
  await page.keyboard.down('KeyK'); await page.waitForTimeout(150);
  console.log('after relaunch: Free Play K lights', JSON.stringify(await page.$$eval('.white-key.active, .black-key.active', (e) => e.map((x) => x.getAttribute('title')))));
  await page.keyboard.up('KeyK');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Back to Main Menu/ }).first().click().catch(() => {}); await page.waitForTimeout(600);
  const folders = await bridge(page, 'getAllFolders');
  const s1b = await bridge(page, 'getSong', [s1.id]);
  const s2b = await bridge(page, 'getSong', [s2.id]);
  console.log('after relaunch: folders', JSON.stringify(folders.map((f) => f.name)), 's1 folder ok', s1b.folderId === folders[0]?.id, 'tags', JSON.stringify([s1b.tags, s2b.tags]), 'fav', s2b.isFavorite, 'playlist songs', JSON.stringify((await bridge(page, 'getPlaylistSongs', [pl.id ?? pl])).map((s) => s.title ?? s.songId ?? s.id)));
  console.log('after relaunch: track assignments', JSON.stringify(s1b.trackAssignments));
  await page.getByRole('button', { name: 'Guided Lessons', exact: true }).click(); await page.waitForTimeout(800);
  console.log('after relaunch: lesson 1 card', JSON.stringify((await page.getByRole('button', { name: /Lesson 1\b/ }).first().innerText()).replace(/\n+/g, ' | ').slice(0, 140)));
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 12)));
});
console.log('DONE');
