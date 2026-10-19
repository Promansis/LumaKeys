// WF-008: track assignment and starting a one-hand practice session (web runtime).
// Fixture: "Two Hand Study", two named tracks. Melody = F4 G4 A4 B4 C5 C5 (6 notes, above C4);
// Accompaniment = C3 E3 G3 C3 E3 G3 (6 notes, below C4). Track names avoid the LH/RH name patterns,
// so the default hand comes from pitch.
//
// Oracle: the note count each configuration should expect (6 for one hand, 12 for both, 6 for both with
// one track ignored) and the results screen counts. Keys: Comma=C4 Period=D4 Slash=E4 KeyQ=F4 KeyW=G4
// KeyE=A4 KeyR=B4 KeyT=C5; BracketLeft shifts the keyboard octave down.
//
// Run: DATA=$TMPDIR/p11/FB/data-wf008 FIX=$TMPDIR/p11/FB/fx-wf008 PORT=3787 node track-assignment-one-hand.mjs
import { withServer, text } from './harness.mjs';
import { writeTwoTrackFixture } from './midi-fixtures.mjs';
import fs from 'node:fs';
import path from 'node:path';

const data = process.env.DATA;
const fix = process.env.FIX;
const port = Number(process.env.PORT || 3787);
const shots = process.env.SHOTS || path.join(data, 'shots');
fs.rmSync(data, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });
const rpc = (base, m, args = []) => fetch(`${base}/api/bridge/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }).then((r) => r.json()).then((j) => ('result' in j ? j.result : j));
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
const fixture = writeTwoTrackFixture(fix);

await withServer(data, async ({ page, base, errors }) => {
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  const fd = new FormData();
  fd.append('files', new Blob([fs.readFileSync(fixture.file)]), path.basename(fixture.file));
  const up = await fetch(base + '/api/midi/upload', { method: 'POST', body: fd }).then((r) => r.json());
  const song = up.songs[0];
  console.log('uploaded', JSON.stringify({ songId: song.songId?.slice(0, 8), title: song.title, errors: up.errors }));
  const row = async () => (await rpc(base, 'getAllSongs'))[0];
  console.log('stored trackAssignments before any session:', JSON.stringify((await row()).trackAssignments));

  const hud = async () => (await text(page)).match(/SCORE\n(\d+)\nCOMBO\n([^\n]+)/)?.slice(1).join('|') ?? 'n/a';
  const results = async () => {
    const t = await text(page);
    const num = (re) => Number(t.match(re)?.[1] ?? NaN);
    return { final: num(/FINAL SCORE\n(\d+)/), perfect: num(/PERFECT\n(\d+)/), good: num(/GOOD\n(\d+)/), ok: num(/OK\n(\d+)/), miss: num(/MISS\n(\d+)/), mode: t.match(/MODE\n([^\n]+)/)?.[1] };
  };
  const startFromLibrary = async (mode) => {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(page)).includes('FIRST PRACTICE SETUP')) await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(800);
    await page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: /^Two Hand Study$/ }) }).getByRole('button', { name: mode, exact: true }).click();
    await page.waitForTimeout(1500);
  };
  const openOverlay = async () => { await page.keyboard.press('Escape'); await page.waitForSelector('#game-overlay-title'); await page.waitForTimeout(300); };
  const closeOverlay = async () => { await page.getByRole('button', { name: 'Resume' }).click(); await page.waitForTimeout(300); await page.locator('canvas').first().click({ position: { x: 640, y: 250 } }); };
  const assignmentState = () => page.$$eval('.track-row', (rows) => rows.map((r) => `${r.querySelector('strong').textContent}=${r.querySelector('select').selectedOptions[0].textContent} (${r.querySelector('span').textContent})`));
  const handState = () => page.$$eval('.session-toolbar .session-chip-group:nth-child(2) button', (b) => b.find((x) => x.className.includes('primary'))?.textContent);
  const setAssignment = async (track, label) => { await page.locator('.track-row').filter({ hasText: track }).locator('select').selectOption({ label }); await page.waitForTimeout(900); };
  const finish = async (limit = 30) => { for (let i = 0; i < limit; i++) { if ((await text(page)).includes('FINAL SCORE')) return true; await page.waitForTimeout(1000); } return false; };
  const playSeq = async (keys, octaveDown = 0) => {
    for (let i = 0; i < octaveDown; i++) await page.keyboard.press('BracketLeft');
    const log = [];
    for (const k of keys) {
      const start = await hud(); let hit = false;
      for (let i = 0; i < 60 && !hit; i++) {
        await page.keyboard.down(k); await page.waitForTimeout(60); await page.keyboard.up(k); await page.waitForTimeout(110);
        if ((await hud()) !== start) hit = true;
      }
      log.push(`${k}:${hit ? 'hit' : 'no-score'}`);
    }
    return log;
  };

  // ---- A. Baseline: both hands, Play mode, no input -> every note of both tracks is expected ----
  await startFromLibrary('Play');
  await openOverlay();
  console.log('overlay track map:', JSON.stringify(await assignmentState()), '| hand filter shown:', await handState());
  await page.screenshot({ path: `${shots}/01-overlay.png` });
  check('track map lists both named tracks with pitch-based defaults', JSON.stringify(await assignmentState()) === JSON.stringify(['Melody=Right Hand (Default: Right Hand)', 'Accompaniment=Left Hand (Default: Left Hand)']), JSON.stringify(await assignmentState()));
  await closeOverlay(); await page.keyboard.press('Space');
  check('A both hands, no input finishes', await finish(), '');
  let r = await results();
  console.log('A results', JSON.stringify(r));
  check('A both hands expects 12 notes', r.perfect + r.good + r.ok + r.miss === 12 && r.miss === 12, JSON.stringify(r));

  // ---- B. Left hand only, no input -> only the 6 accompaniment notes are expected ----
  await startFromLibrary('Play'); await openOverlay();
  await page.locator('.session-toolbar').getByRole('button', { name: 'Left Hand', exact: true }).click(); await page.waitForTimeout(800);
  console.log('B hand filter shown:', await handState());
  await closeOverlay(); await page.keyboard.press('Space');
  check('B left hand finishes', await finish(), '');
  r = await results(); console.log('B results', JSON.stringify(r));
  check('B left hand only expects 6 notes', r.perfect + r.good + r.ok + r.miss === 6 && r.miss === 6, JSON.stringify(r));

  // ---- C. Right hand only in Learn mode, play only the melody notes -> 6 hits, nothing else expected ----
  await startFromLibrary('Learn'); await openOverlay();
  await page.locator('.session-toolbar').getByRole('button', { name: 'Right Hand', exact: true }).click(); await page.waitForTimeout(800);
  console.log('C hand filter shown:', await handState());
  await page.screenshot({ path: `${shots}/02-right-hand-overlay.png` });
  await closeOverlay(); await page.keyboard.press('Space');
  const logC = await playSeq(['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyT']);
  console.log('C key log', JSON.stringify(logC));
  check('C finishes after only the right-hand keys', await finish(15), '');
  r = await results(); console.log('C results', JSON.stringify(r));
  check('C right hand: 6 judged notes, none missed', r.perfect + r.good + r.ok + r.miss === 6 && r.miss === 0, JSON.stringify(r));
  await page.screenshot({ path: `${shots}/03-results-right-hand.png` });

  // ---- D. Persistence of the hand filter for the next session ----
  await startFromLibrary('Learn'); await openOverlay();
  console.log('D next session: hand filter shown =', await handState(), '| assignments', JSON.stringify(await assignmentState()));
  const handFilterPersists = (await handState()) === 'Right Hand';
  console.log(`D hand filter persists to the next session: ${handFilterPersists}`);

  // ---- E. Reassign: Melody -> Left Hand, Accompaniment -> Right Hand; right hand now means the low notes ----
  await setAssignment('Melody', 'Left Hand');
  await setAssignment('Accompaniment', 'Right Hand');
  console.log('E assignments after change:', JSON.stringify(await assignmentState()), '| status:', JSON.stringify(await page.locator('.status-card.wide strong').last().textContent()));
  const stored = await row();
  console.log('E stored trackAssignments:', JSON.stringify(stored.trackAssignments));
  const vals = Object.values(stored.trackAssignments);
  check('E assignment stored (Melody left, Accompaniment right)', vals.includes('left') && vals.includes('right') && JSON.stringify(vals) !== JSON.stringify(['right', 'left']), JSON.stringify(stored.trackAssignments));
  await page.locator('.session-toolbar').getByRole('button', { name: 'Right Hand', exact: true }).click(); await page.waitForTimeout(800);
  console.log('E hand filter shown:', await handState());
  await closeOverlay(); await page.keyboard.press('Space');
  const logE = await playSeq(['Comma', 'Slash', 'KeyW', 'Comma', 'Slash', 'KeyW'], 1); // C3 E3 G3 C3 E3 G3
  console.log('E key log (octave down once)', JSON.stringify(logE));
  check('E finishes after playing the low notes', await finish(15), '');
  r = await results(); console.log('E results', JSON.stringify(r));
  check('E "right hand" follows the reassigned track (low notes), 6 judged, none missed', r.perfect + r.good + r.ok + r.miss === 6 && r.miss === 0, JSON.stringify(r));

  // ---- F. Persistence of the assignment: fresh page load, new session ----
  await startFromLibrary('Play'); await openOverlay();
  const persisted = await assignmentState();
  console.log('F after reload, assignments:', JSON.stringify(persisted), '| hand filter shown:', await handState());
  check('F assignment persists across reload', persisted.some((x) => x.startsWith('Melody=Left Hand')) && persisted.some((x) => x.startsWith('Accompaniment=Right Hand')), JSON.stringify(persisted));

  // ---- G. Ignore a track: Both Hands with Accompaniment ignored expects only the melody ----
  await setAssignment('Melody', 'Right Hand');
  await setAssignment('Accompaniment', 'Ignore');
  await page.locator('.session-toolbar').getByRole('button', { name: 'Both Hands', exact: true }).click(); await page.waitForTimeout(800);
  await closeOverlay(); await page.keyboard.press('Space');
  check('G finishes', await finish(), '');
  r = await results(); console.log('G results', JSON.stringify(r));
  check('G ignored track is not expected (6 notes)', r.perfect + r.good + r.ok + r.miss === 6, JSON.stringify(r));

  // ---- H. Mid-run reassignment asks before restarting ----
  await startFromLibrary('Play'); await openOverlay(); await closeOverlay(); await page.keyboard.press('Space');
  await page.waitForTimeout(6500); // let some notes pass unjudged -> miss
  await openOverlay();
  dialogs.length = 0;
  await setAssignment('Accompaniment', 'Left Hand');
  console.log('H mid-run assignment change confirm dialogs:', JSON.stringify(dialogs));
  const rows = await results().catch(() => null);
  console.log('H after dialog, overlay status:', JSON.stringify(await page.locator('.status-card.wide strong').last().textContent().catch(() => null)));
  console.log('console/page errors:', JSON.stringify(errors.filter((e) => !e.includes('"off"') && !e.includes('polyphony') && !e.includes('ERR_ABORTED'))));
}, { port, timeout: 8000 });
console.log(fails === 0 ? 'ALL CHECKS PASSED' : `${fails} CHECK(S) FAILED`);
