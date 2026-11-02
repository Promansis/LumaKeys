// WF-011 desktop, pass paths: lesson 1's drill played on time passes and the lesson can be
// completed; the novice capstone played in full records its accuracy and, with gating on,
// unlocks the Beginner tier. Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE set.
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire(path.join(REPO, 'package.json'));
const { Midi } = req('@tonejs/midi');
const Database = req('better-sqlite3');
const profile = process.env.PROFILE;
fs.rmSync(profile, { recursive: true, force: true });

// Lesson 1 step 3 ("Tap middle C in steady quarter notes", 72 BPM): note starts printed by
// buildLessonDrill (src/lib/learning/drillGenerator.ts) for that step.
const DRILL = [0, 0.833, 1.667, 2.5, 3.333, 4.167, 5, 5.833];
const KEY = { 55: 'KeyB', 60: 'Comma', 62: 'Period', 64: 'Slash', 65: 'KeyQ', 67: 'KeyW' };
const ode = new Midi(fs.readFileSync(path.join(REPO, 'public/curriculum-midis/ode-to-joy.mid')));
// The capstone filters to the right hand, but the file's single track is assigned 'right', so
// every note stays, including the bridge's low G3 (midi 55, KeyB) at 38.3 s. Learning mode
// waits on that note, so leaving it out stalls the run there.
const CAP = ode.tracks.flatMap((t) => t.notes).sort((a, b) => a.time - b.time || a.midi - b.midi).map((n) => ({ key: KEY[n.midi], t: n.time }));
if (CAP.some((n) => !n.key)) throw new Error('capstone note without a key mapping');
const NOVICE = ['novice-01-keyboard-map', 'novice-02-finger-numbers', 'novice-03-posture-and-shape', 'novice-04-first-c-pattern', 'novice-05-rhythm-values', 'novice-06-first-song'];

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const learning = (userData) => {
  const db = new Database(path.join(userData, 'lumakeys.db'), { readonly: true, fileMustExist: true });
  try { return Object.fromEntries(db.prepare("SELECT key, value FROM settings WHERE category = 'learning'").all().map((r) => [r.key, r.value])); } finally { db.close(); }
};
const tap = async (page, key) => { await page.keyboard.down(key); await sleep(25); await page.keyboard.up(key); };
// In-page watcher: wall-clock time (Date.now, shared with this process) when the count-in
// ends and the session starts playing, and every HUD score change. A press during the count-in would be judged
// against the paused clock (see paused-input.mjs), so nothing is pressed before tPlay.
const watch = (page) => page.evaluate(() => {
  const w = (window.__w = { tPlay: null, sawCountdown: false, scores: [] });
  const read = () => {
    // runCountdown clears the 3-2-1 overlay immediately before game.play(now).
    const counting = Boolean(document.querySelector('.countdown-overlay'));
    if (counting) w.sawCountdown = true;
    else if (w.sawCountdown && w.tPlay === null) w.tPlay = Date.now();
    const item = [...document.querySelectorAll('.immersive-hud-item')].find((el) => el.querySelector('span')?.textContent === 'Score');
    const score = item?.querySelector('strong')?.textContent ?? null;
    if (score !== null && score !== w.scores.at(-1)?.score) w.scores.push({ t: Date.now(), score });
  };
  new MutationObserver(read).observe(document.body, { subtree: true, childList: true, characterData: true });
});
const resetWatch = (page) => page.evaluate(() => { Object.assign(window.__w, { tPlay: null, sawCountdown: false, scores: [] }); });
const waitPlay = async (page) => {
  for (let i = 0; i < 500; i++) { const t = await page.evaluate(() => window.__w.tPlay); if (t) return t; await sleep(10); }
  throw new Error('session never started');
};
const scoreCount = (page) => page.evaluate(() => window.__w.scores.filter((x) => x.score !== '0').length);
const toHub = async (page) => {
  await page.getByRole('button', { name: 'Guided Lessons', exact: true }).click();
  await page.waitForTimeout(800);
};

await withElectron(profile, async (h) => {
  let { page } = h;
  await page.waitForTimeout(2500);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.waitForTimeout(500);

  // 1. Drill pass
  await toHub(page);
  await page.getByRole('button', { name: /Lesson 1\b/ }).first().click(); await page.waitForTimeout(600);
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: /Complete Tip/ }).click(); await page.waitForTimeout(400); }
  await watch(page);
  await page.getByRole('button', { name: 'Start Drill' }).click(); await page.waitForTimeout(1200);
  await page.evaluate(() => document.activeElement?.blur());
  await resetWatch(page);
  await page.keyboard.press('Space');
  const tPlay = await waitPlay(page);
  for (const startSec of DRILL) {
    await sleep(tPlay + startSec * 1000 - Date.now());
    await tap(page, 'Comma');
  }
  const drillLog = (await page.evaluate(() => window.__w.scores)).map((x) => `${x.score}@${x.t - tPlay}ms`);
  for (let i = 0; i < 40 && !/Lesson Steps/i.test(await text(page)); i++) await sleep(250);
  const afterDrill = await text(page);
  console.log('WF-011 drill presses', JSON.stringify(drillLog));
  console.log('WF-011 back on lesson', /Lesson Steps/i.test(afterDrill), 'counter', JSON.stringify(afterDrill.match(/\d+ \/ \d+ STEPS/i)?.[0]), 'stored steps', learning(h.userData).completedSteps);
  const complete = page.getByRole('button', { name: 'Complete Lesson' });
  console.log('WF-011 Complete Lesson enabled', await complete.isEnabled().catch(() => 'absent'));
  await complete.click().catch((e) => console.log('complete click failed', e.message.slice(0, 80)));
  await page.waitForTimeout(800);
  console.log('WF-011 after Complete Lesson: screen', JSON.stringify((await text(page)).match(/(\d+ \/ \d+)\nLESSONS COMPLETED/i)?.[1] ?? (await text(page)).slice(0, 80).replace(/\n/g, ' | ')), 'stored lessons', learning(h.userData).completedLessons);

  // 2. Capstone pass with gating on
  await page.evaluate((ids) => Promise.all([
    window.appBridge.setSetting('learning', 'completedLessons', JSON.stringify(ids)),
    window.appBridge.setSetting('learning', 'gatingEnabled', 'true'),
  ]), NOVICE);
  ({ page } = await h.relaunch());
  await page.waitForTimeout(2500);
  await toHub(page);
  const beginner = async () => {
    if (!/Progressive piano curriculum/i.test(await text(page))) return { onHub: false };
    const header = page.locator('.learn-tier-header', { hasText: 'Beginner' });
    if ((await header.getAttribute('aria-expanded')) !== 'true') { await header.click(); await page.waitForTimeout(300); }
    const first = header.locator('xpath=..').locator('.learn-lesson-card').first();
    return { disabled: await first.isDisabled(), label: (await first.innerText()).replace(/\n+/g, ' | ').slice(0, 90) };
  };
  console.log('WF-011 before capstone: gating stored', learning(h.userData).gatingEnabled, 'first Beginner lesson', JSON.stringify(await beginner()));
  const cap = page.locator('.learn-capstone-card').first();
  console.log('WF-011 capstone Attempt enabled', await cap.locator('button').isEnabled());
  await watch(page);
  await cap.locator('button').click(); await page.waitForTimeout(1500);
  await page.evaluate(() => document.activeElement?.blur());
  await resetWatch(page);
  await page.keyboard.press('Space');
  const tStart = await waitPlay(page);
  // The capstone is a Play-mode run: the clock keeps moving and a press is judged against
  // it, so every note is pressed at its scheduled time (note time / capstone tempo 0.9)
  // after the count-in ends. Nothing waits for a late or missing press.
  const TEMPO = 0.9;
  let retried = 0;
  const pressLog = [];
  for (const [k, note] of CAP.entries()) {
    await sleep(tStart + (note.t / TEMPO) * 1000 + Number(process.env.CAPSTONE_LEAD_MS ?? 0) - Date.now());
    const pressedAt = Date.now();
    await tap(page, note.key);
    pressLog.push(`${k + 1}:${note.key}@${pressedAt - tStart}`);
  }
  const scoreLog = (await page.evaluate(() => window.__w?.scores ?? []).catch(() => [])).map((x) => `${x.score}@${x.t - tStart}`);
  console.log('WF-011 capstone presses (note:key@ms after count-in)', pressLog.join(' '));
  console.log('WF-011 capstone score changes (score@ms)', scoreLog.join(' '));
  const unscored = CAP.length - (await scoreCount(page));
  for (let i = 0; i < 40 && !/Progressive piano curriculum/i.test(await text(page)); i++) await sleep(250);
  const onHub = /Progressive piano curriculum/i.test(await text(page));
  console.log(`WF-011 capstone: ${CAP.length} notes in ${Date.now() - tStart} ms, score changes short by ${unscored}, extra presses ${retried}, back on hub ${onHub}, stored capstoneResults`, learning(h.userData).capstoneResults);
  console.log('WF-011 after capstone: card', JSON.stringify((await cap.innerText().catch(() => '?')).replace(/\n+/g, ' | ').slice(0, 120)), 'first Beginner lesson', JSON.stringify(await beginner()));
  ({ page } = await h.relaunch());
  await page.waitForTimeout(2500);
  await toHub(page);
  console.log('WF-011 after relaunch: first Beginner lesson', JSON.stringify(await beginner()), 'stored', JSON.stringify(learning(h.userData)));
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 10)));
});
console.log('DONE');
