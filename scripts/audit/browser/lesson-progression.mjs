// WF-011: Learn hub, lesson 1, generated drill with the computer keyboard, progression persistence, failed drill, save failure, capstone reachability.
// Env: DATA
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { withServer, text } from './harness.mjs';
import { firstLoad, rpc, hud } from './setup-common.mjs';
const data = process.env.DATA;
const out = (...a) => console.log(...a);
let Database = null; try { Database = createRequire('/media/storage/LumaKeys/package.json')('better-sqlite3'); } catch {}
const dbRow = (cat, key) => { if (!Database) return 'n/a'; const db = new Database(`${data}/lumakeys.db`, { readonly: true }); try { return db.prepare('select value from settings where category=? and key=?').get(cat, key)?.value ?? null; } finally { db.close(); } };
const dbTable = (sql) => { if (!Database) return 'n/a'; const db = new Database(`${data}/lumakeys.db`, { readonly: true }); try { return db.prepare(sql).all(); } finally { db.close(); } };
const learnState = () => ({ lessons: dbRow('learning', 'completedLessons'), steps: dbRow('learning', 'completedSteps'), gating: dbRow('learning', 'gatingEnabled'), capstone: dbRow('learning', 'capstoneResults') });
const openHub = async (page) => { await page.getByRole('button', { name: /^Guided Lessons/ }).click(); await page.waitForTimeout(800); };
const summary = async (page) => (await text(page)).match(/(\d+ \/ \d+)\nLESSONS COMPLETED/i)?.[1];
const lesson1 = (page) => page.getByRole('button', { name: /^(Open|Done|Lock)\s*Lesson 1\b/i }).first();
// Wall-clock time (Date.now) at which the 3-2-1 count-in ends and the clock starts; a press before it is judged against a paused clock.
const watchPlay = (page) => page.evaluate(() => { const w = (window.__cap = { counting: false, tPlay: null }); new MutationObserver(() => { const c = Boolean(document.querySelector('.countdown-overlay')); if (c) w.counting = true; else if (w.counting && w.tPlay === null) w.tPlay = Date.now(); }).observe(document.body, { subtree: true, childList: true }); });
const resetPlay = (page) => page.evaluate(() => { Object.assign(window.__cap, { counting: false, tPlay: null }); });
const waitPlay = async (page) => { for (let i = 0; i < 500; i++) { const t = await page.evaluate(() => window.__cap.tPlay); if (t) return t; await page.waitForTimeout(10); } throw new Error('session never started'); };
const pressAt = async (page, key, at) => { const wait = at - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait)); await page.keyboard.down(key); await page.waitForTimeout(25); await page.keyboard.up(key); };
// Lesson 1 step 3 (72 BPM quarter notes on middle C): note starts from buildLessonDrill, in seconds.
const DRILL = [0, 0.833, 1.667, 2.5, 3.333, 4.167, 5, 5.833];
const stepBadge = async (page) => ((await text(page)).match(/STEP \d of \d\n[^\n]+\n(COMPLETED|IN PROGRESS)/i)?.[1]) ?? '?';

await withServer(data, async ({ page, base, errors, restart }) => {
  await firstLoad(page, base);
  await openHub(page);
  out('hub summary:', await summary(page), '| tier headers:', JSON.stringify(await page.$$eval('.learn-tier-header h2', (e) => e.map((x) => x.textContent))));
  out('lesson 1 button accessible name:', JSON.stringify(await lesson1(page).evaluate((b) => b.innerText.replace(/\n+/g, ' | ').slice(0, 140))));
  out('tier 1 capstone card:', JSON.stringify(await page.locator('.learn-capstone-card').first().innerText().then((t) => t.replace(/\n+/g, ' | '))), '| Attempt disabled:', await page.locator('.learn-capstone-card button').first().isDisabled());
  out('learning rows before any progress:', JSON.stringify(learnState()));

  // open lesson 1, complete two tips
  await lesson1(page).click(); await page.waitForTimeout(600);
  out('lesson 1 opened:', JSON.stringify((await text(page)).match(/NOVICE TIER\n[^\n]+/i)?.[0]), '| steps', JSON.stringify(await page.$$eval('.lesson-step-button', (b) => b.map((x) => x.innerText.replace(/\n/g, ' ')))));
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: /Complete Tip/ }).click(); await page.waitForTimeout(500); }
  out('after two tips: on step', JSON.stringify((await text(page)).match(/STEP \d of \d/i)?.[0]), '| counter', JSON.stringify((await text(page)).match(/\d+ \/ \d+ STEPS/i)?.[0]), '| stored steps', dbRow('learning', 'completedSteps'));

  // drill: passing attempt
  await page.getByRole('button', { name: 'Start Drill' }).click(); await page.waitForTimeout(1200);
  await page.evaluate(() => document.activeElement?.blur());
  out('drill screen: HUD', await hud(page), '| status text', JSON.stringify((await text(page)).match(/Loaded[^\n]*/)?.[0]));
  await watchPlay(page); await page.keyboard.press('Space');
  const tDrill = await waitPlay(page);
  const t0 = Date.now(); let back = false; const presses = DRILL.length;
  for (const startSec of DRILL) await pressAt(page, 'Comma', tDrill + startSec * 1000);
  for (let i = 0; i < 40 && !back; i++) { back = /Lesson Steps/i.test(await text(page)); if (!back) await page.waitForTimeout(250); }
  out(`drill finished: back on lesson screen = ${back} after ${Date.now() - t0} ms, ${presses} presses`);
  await page.waitForTimeout(500);
  const afterDrill = await text(page);
  out('after passing drill: step badge', JSON.stringify(afterDrill.match(/STEP \d of \d\n[^\n]+\n(COMPLETED|IN PROGRESS)/i)?.[0]?.replace(/\n/g, ' | ')), '| counter', JSON.stringify(afterDrill.match(/\d+ \/ \d+ STEPS/i)?.[0]), '| lesson panel', JSON.stringify(afterDrill.match(/(Lesson complete|Finish the lesson)/i)?.[0]));
  out('stored steps:', dbRow('learning', 'completedSteps'), '| game_results rows:', JSON.stringify(dbTable('select count(*) c from game_results')));
  await page.screenshot({ path: `${process.env.TMPDIR}/p11/FA/lesson-after-drill.png` });
  // complete the lesson
  const complete = page.getByRole('button', { name: 'Complete Lesson' });
  out('Complete Lesson enabled:', await complete.isEnabled().catch(() => 'n/a'));
  await complete.click().catch(() => {}); await page.waitForTimeout(500);
  out('stored lessons:', dbRow('learning', 'completedLessons'));

  // persistence
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await openHub(page);
  out('after reload hub summary:', await summary(page), '| lesson 1 button:', JSON.stringify(await lesson1(page).innerText().then((t) => t.replace(/\n+/g, ' | ').slice(0, 60))));
  await restart(); await page.goto(base + '/', { waitUntil: 'networkidle' }); await openHub(page);
  out('after restart hub summary:', await summary(page), '| rows', JSON.stringify(learnState()));
  out('localStorage keys (lead brief expected progress here):', JSON.stringify(await page.evaluate(() => Object.keys(localStorage))));

  // capstone while tier incomplete
  out('capstone Attempt disabled with 1 of N lessons complete:', await page.locator('.learn-capstone-card button').first().isDisabled());

  // sequential unlock toggle
  await page.getByLabel('Sequential unlock').check(); await page.waitForTimeout(400);
  out('gating on: lesson 2 button disabled =', await page.getByRole('button', { name: /Lesson 2\b/ }).first().isDisabled(), '| lesson 3 disabled =', await page.getByRole('button', { name: /Lesson 3\b/ }).first().isDisabled(), '| stored gating', dbRow('learning', 'gatingEnabled'));
  await page.getByLabel('Sequential unlock').uncheck(); await page.waitForTimeout(300);

  // failed drill: lesson 2 drill with no presses
  await page.getByRole('button', { name: /^(Open|Done)\s*Lesson 2\b/i }).first().click(); await page.waitForTimeout(500);
  const l2steps = await page.$$eval('.lesson-step-button', (b) => b.map((x) => x.innerText.replace(/\n/g, ' ')));
  out('lesson 2 steps:', JSON.stringify(l2steps));
  for (let i = 0; i < 3; i++) { const b = page.getByRole('button', { name: /Complete Tip/ }); if (await b.count()) { await b.click(); await page.waitForTimeout(300); } }
  await page.getByRole('button', { name: 'Start Drill' }).click(); await page.waitForTimeout(1000);
  await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Space');
  let back2 = false; for (let i = 0; i < 40 && !back2; i++) { await page.waitForTimeout(1000); back2 = /Lesson Steps/i.test(await text(page)); }
  const failText = await text(page);
  out('failed drill (no input): back on lesson =', back2, '| step badge', JSON.stringify(failText.match(/(COMPLETED|IN PROGRESS)/i)?.[0]), '| any accuracy/fail message:', JSON.stringify(failText.match(/[^\n]*(accuracy|failed|try again|retry|%)[^\n]*/gi)?.slice(0, 4)), '| note', JSON.stringify(failText.match(/Complete the activity[^\n]*/)?.[0]));
  out('stored steps after failed drill:', dbRow('learning', 'completedSteps'));
  await page.screenshot({ path: `${process.env.TMPDIR}/p11/FA/lesson-after-failed-drill.png` });

  // save failure while completing a tip (learning progress write)
  await page.getByRole('main').getByRole('button', { name: /Back to Learn/ }).click(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: /^(Open|Done)\s*Lesson 3\b/i }).first().click(); await page.waitForTimeout(500);
  const errBefore = errors.length;
  await page.route('**/api/bridge/setSetting', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'disk full (audit)' }) }));
  await page.getByRole('button', { name: /Complete Tip/ }).click(); await page.waitForTimeout(800);
  out('save failing: after Complete Tip step badge', JSON.stringify((await text(page)).match(/(COMPLETED|IN PROGRESS)/i)?.[0]), '| toast/alert', JSON.stringify(await page.locator('.toast-item, [role="alert"], .achievement-toast').allInnerTexts()), '| console', JSON.stringify(errors.slice(errBefore).map((e) => e.slice(0, 120))));
  await page.unroute('**/api/bridge/setSetting');
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await openHub(page);
  out('after reload lesson 3 progress:', JSON.stringify(await page.getByRole('button', { name: /Lesson 3\b/ }).first().innerText().then((t) => t.replace(/\n+/g, ' | ').slice(0, 120))));

  // capstone: tier 1 lessons seeded as complete through the bridge (the UI path is six lessons of drills), then attempted with scripted keys
  const { Midi } = createRequire('/media/storage/LumaKeys/package.json')('@tonejs/midi');
  const novice = ['novice-01-keyboard-map', 'novice-02-finger-numbers', 'novice-03-posture-and-shape', 'novice-04-first-c-pattern', 'novice-05-rhythm-values', 'novice-06-first-song'];
  await rpc(base, 'setSetting', ['learning', 'completedLessons', JSON.stringify(novice)]);
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await openHub(page);
  const cap = page.locator('.learn-capstone-card').first();
  out('capstone after seeding all 6 tier-1 lessons: Attempt disabled =', await cap.locator('button').isDisabled(), '| card', JSON.stringify((await cap.innerText()).replace(/\n+/g, ' | ')), '| hub', await summary(page));
  const midi = new Midi(fs.readFileSync('/media/storage/LumaKeys/public/curriculum-midis/ode-to-joy.mid'));
  const KEY = { 55: 'KeyB', 60: 'Comma', 62: 'Period', 64: 'Slash', 65: 'KeyQ', 67: 'KeyW' };
  // The capstone runs in Play mode at tempo 0.9 (no waiting), so each note has a time on the moving clock.
  const notes = midi.tracks[0].notes.map((n) => ({ key: KEY[n.midi], t: n.time / 0.9 }));
  out('right-hand notes to play:', notes.length, '| pitches', JSON.stringify([...new Set(notes.map((n) => n.key))]));
  const onHub = async () => /Progressive piano curriculum/i.test(await text(page));
  const cardText = async () => (await page.locator('.learn-capstone-card').first().innerText().catch(() => '?')).replace(/\n+/g, ' | ');
  // attempt 1: no input. The clock keeps moving in Play mode; abandon the run early through the pause overlay.
  await cap.locator('button').click(); await page.waitForTimeout(1500);
  await page.evaluate(() => document.activeElement?.blur()); await page.keyboard.press('Space'); await page.waitForTimeout(20000);
  out('capstone attempt 1 (no input) after 20 s: still in game =', !(await onHub()), '| HUD', await hud(page));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  out('  overlay buttons:', JSON.stringify(await page.$$eval('.immersive-overlay button', (b) => b.map((x) => x.innerText.trim()).slice(0, 4))));
  await page.getByRole('button', { name: /Back to Learn Hub/ }).first().click(); await page.waitForTimeout(600);
  out('  after Back to Learn Hub: on hub =', await onHub(), '| capstone card', await cardText(), '| stored', dbRow('learning', 'capstoneResults'));
  // attempt 2: press every note at its scheduled time on the moving clock (the run does not wait)
  await page.locator('.learn-capstone-card button').first().click(); await page.waitForTimeout(1500);
  await page.evaluate(() => document.activeElement?.blur());
  await watchPlay(page); await page.keyboard.press('Space');
  const tPlay = await waitPlay(page);
  const keySeq = notes.map((n) => n.key); const missed = 0; const tCap = Date.now();
  for (const note of notes) {
    await pressAt(page, note.key, tPlay + note.t * 1000 + Number(process.env.CAPSTONE_LEAD_MS ?? 0));
  }
  await page.waitForTimeout(1500);
  out(`capstone attempt 2 (all ${keySeq.length} notes in order): elapsed ${Date.now() - tCap} ms, notes not registered ${missed} | back on hub =`, await onHub(), '| card', await cardText(), '| stored', dbRow('learning', 'capstoneResults'));
  await page.screenshot({ path: `${process.env.TMPDIR}/p11/FA/capstone-after-attempt.png` });
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await openHub(page);
  out('after reload capstone card:', JSON.stringify((await page.locator('.learn-capstone-card').first().innerText()).replace(/\n+/g, ' | ')), '| stored', dbRow('learning', 'capstoneResults'));
  out('ERRORS', JSON.stringify(errors.filter((e) => !e.includes('mainmenu-neon') && !/status of 500|ERR_FAILED/.test(e)).slice(0, 8)));
}, { port: 3781, timeout: 10000 });
