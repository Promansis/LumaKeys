// WF-015 (web runtime): Free Play recording, replay, and which export / backing-track controls exist.
// Source facts used as the oracle: FreePlayScreen.tsx hides Load Track, Export MIDI, and Export WAV when
// IS_WEB is true, and README.md says some export/save helpers are desktop only. So this driver proves the
// part the web build offers (record, stop, capture count, replay with the same notes in the same order and
// timing) and proves that no export or backing-track control and no download event is offered.
//
// Replay is observed through the on-screen keyboard: every key div carries its note name in `title`, and the
// `active` class marks sounding notes. A MutationObserver logs every change with performance.now().
//
// Run: DATA=$TMPDIR/p11/FB/data-wf015 PORT=3788 node freeplay-recording-export.mjs
import { withServer, text } from './harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const data = process.env.DATA;
const port = Number(process.env.PORT || 3788);
const shots = process.env.SHOTS || path.join(data, 'shots');
fs.rmSync(data, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, detail = '') => { if (!ok) fails += 1; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + detail : ''}`); };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// What the driver plays: [code, downAtMs, holdMs]. Chord = three overlapping keys.
const KEYNAME = { Comma: 'C4', Period: 'D4', Slash: 'E4', KeyQ: 'F4', KeyW: 'G4', KeyE: 'A4', KeyR: 'B4', KeyT: 'C5' };
const SCRIPT = [
  ['Comma', 0, 300], ['Slash', 500, 300], ['KeyW', 1000, 300],
  ['Comma', 1600, 500], ['Slash', 1620, 480], ['KeyW', 1640, 460], // chord C4 E4 G4
  ['KeyQ', 2500, 200], ['KeyT', 3000, 600],
];

await withServer(data, async ({ page, base, errors }) => {
  const downloads = [];
  page.on('download', (d) => downloads.push(d.suggestedFilename()));
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  if ((await text(page)).includes('FIRST PRACTICE SETUP')) await page.getByRole('button', { name: 'Skip for now' }).click();
  await page.getByRole('button', { name: 'Free Play', exact: true }).click();
  await page.waitForTimeout(1500);

  const installLog = () => page.evaluate(() => {
    window.__log = [];
    const snap = () => [...document.querySelectorAll('.white-key.active, .black-key.active')].map((e) => e.getAttribute('title')).sort();
    let last = '';
    const record = () => { const s = snap(); const j = s.join(','); if (j !== last) { last = j; window.__log.push({ t: performance.now(), keys: s }); } };
    window.__obs?.disconnect();
    window.__obs = new MutationObserver(record);
    window.__obs.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
    window.__t0 = performance.now();
  });
  const readLog = () => page.evaluate(() => window.__log);
  const overlayVal = (label) => page.locator('.immersive-overlay-panel .status-card').filter({ hasText: label }).locator('strong').first().textContent();
  const openOverlay = async () => { if (!(await page.locator('#free-play-overlay-panel').count())) { await page.keyboard.press('Escape'); await page.waitForSelector('#free-play-overlay-panel'); await page.waitForTimeout(250); } };
  const closeOverlay = async () => { await page.getByRole('button', { name: 'Resume' }).click(); await page.waitForTimeout(300); await page.locator('canvas').first().click({ position: { x: 640, y: 300 } }).catch(() => {}); await page.waitForTimeout(200); };
  const status = async () => (await overlayVal('Status'))?.trim();

  // ---- controls the web build offers ----
  await openOverlay();
  const buttons = (await page.locator('#free-play-overlay-panel button').allTextContents()).map((b) => b.trim()).filter(Boolean);
  console.log('overlay buttons:', JSON.stringify(buttons));
  check('web build shows no Export MIDI, Export WAV, or Load Track control', !buttons.some((b) => /Export|Load Track/.test(b)), '');
  console.log('backing track panel text:', JSON.stringify((await page.locator('#free-play-overlay-panel').innerText()).match(/BACKING TRACK[\s\S]{0,200}/i)?.[0].replace(/\n+/g, ' | ')));
  const backingButtons = await page.locator('#free-play-overlay-panel button:disabled').allTextContents();
  console.log('disabled buttons (backing track Play/Stop and Play Recording expected):', JSON.stringify(backingButtons.map((b) => b.trim())));
  check('Play Recording is disabled before anything is recorded', backingButtons.map((b) => b.trim()).includes('Play Recording'), '');

  // ---- record ----
  await page.getByRole('button', { name: 'Record', exact: true }).click(); await page.waitForTimeout(300);
  console.log('after Record click, status:', JSON.stringify(await status()), '| button now:', JSON.stringify((await page.locator('#free-play-overlay-panel button').allTextContents()).filter((b) => /Record/.test(b))));
  await closeOverlay();
  await installLog();
  const t0 = Date.now();
  const played = [];
  const events = SCRIPT.flatMap(([code, at, hold]) => [{ at, code, dir: 'down', hold }, { at: at + hold, code, dir: 'up', hold }]).sort((a, b) => a.at - b.at || (a.dir === 'up' ? -1 : 1));
  for (const ev of events) {
    const wait = ev.at - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    if (ev.dir === 'down') { await page.keyboard.down(ev.code); played.push({ note: KEYNAME[ev.code], at: Date.now() - t0 }); } else await page.keyboard.up(ev.code);
  }
  await page.waitForTimeout(300);
  const live = await readLog();
  const liveOnsets = [];
  let prev = new Set();
  for (const e of live) { for (const k of e.keys) if (!prev.has(k)) liveOnsets.push({ note: k, at: Math.round(e.t - live[0].t) }); prev = new Set(e.keys); }
  console.log('played (driver clock):', JSON.stringify(played.map((p) => `${p.note}@${p.at}`)));
  console.log('lit on screen while playing:', JSON.stringify(liveOnsets.map((p) => `${p.note}@${p.at}`)));
  check('every pressed key lit its note while recording', eq(liveOnsets.map((o) => o.note), played.map((p) => p.note)), '');

  await openOverlay();
  console.log('overlay while still recording: Captured =', JSON.stringify(await overlayVal('Captured')), 'status =', JSON.stringify(await status()));
  await page.getByRole('button', { name: 'Stop Recording' }).click(); await page.waitForTimeout(400);
  const captured = (await overlayVal('Captured'))?.trim();
  console.log('after Stop: Captured =', JSON.stringify(captured), 'status =', JSON.stringify(await status()));
  check('capture count equals notes played (8: 5 single + 3 chord)', /^8 notes?$/.test(captured ?? ''), captured);
  await page.screenshot({ path: `${shots}/01-after-stop.png` });

  // ---- replay ----
  await installLog();
  await page.getByRole('button', { name: 'Play Recording' }).click();
  console.log('during replay: status =', JSON.stringify(await status()), '| Playback card =', JSON.stringify(await overlayVal('Playback')));
  const start = Date.now();
  while (Date.now() - start < 9000 && (await status()) !== 'Playback finished.') await page.waitForTimeout(200);
  const finishedStatus = await status();
  const rlog = await readLog();
  const replayOnsets = [];
  prev = new Set();
  for (const e of rlog) { for (const k of e.keys) if (!prev.has(k)) replayOnsets.push({ note: k, at: Math.round(e.t - rlog[0].t) }); prev = new Set(e.keys); }
  console.log('replay lit:', JSON.stringify(replayOnsets.map((p) => `${p.note}@${p.at}`)), '| final status:', JSON.stringify(finishedStatus));
  check('replay finished', finishedStatus === 'Playback finished.', JSON.stringify(finishedStatus));
  check('replay plays the same notes in the same order', eq(replayOnsets.map((o) => o.note).sort(), played.map((p) => p.note).sort()) && eq(replayOnsets.map((o) => o.note), played.map((p) => p.note)) , '');
  const gaps = (xs) => xs.slice(1).map((x, i) => x.at - xs[i].at);
  const dp = gaps(played); const dr = gaps(replayOnsets);
  const maxDrift = Math.max(...dp.map((g, i) => Math.abs(g - dr[i])));
  console.log('onset gaps played:', JSON.stringify(dp), 'replay:', JSON.stringify(dr), 'max abs difference ms:', maxDrift);
  check('replay timing within 120 ms of played gaps', dp.length === dr.length && maxDrift <= 120, `max ${maxDrift} ms`);
  check('no download offered during record or replay', downloads.length === 0, JSON.stringify(downloads));

  // ---- second recording replaces the first ----
  await page.getByRole('button', { name: 'Record', exact: true }).click(); await page.waitForTimeout(200);
  check('starting a new recording clears the previous capture', /^0 notes?$/.test(((await overlayVal('Captured')) ?? '').trim()), await overlayVal('Captured'));
  await closeOverlay();
  await page.keyboard.press('KeyE'); await page.waitForTimeout(300);
  await page.keyboard.down('KeyR'); await page.waitForTimeout(200); // still held when the overlay opens
  await openOverlay();
  await page.getByRole('button', { name: 'Stop Recording' }).click(); await page.waitForTimeout(300);
  await page.keyboard.up('KeyR');
  const cap2 = (await overlayVal('Captured'))?.trim();
  console.log('second take (A4 tapped, B4 held through Stop): Captured =', JSON.stringify(cap2));
  check('held key is closed out at Stop (2 notes)', /^2 notes?$/.test(cap2 ?? ''), cap2);
  // stop with nothing played
  await page.getByRole('button', { name: 'Record', exact: true }).click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Stop Recording' }).click(); await page.waitForTimeout(300);
  console.log('empty take: Captured =', JSON.stringify((await overlayVal('Captured'))?.trim()), '| Play Recording disabled =', await page.getByRole('button', { name: 'Play Recording' }).isDisabled());
  // persistence
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await closeOverlay();
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(200);
  await openOverlay();
  await page.getByRole('button', { name: 'Stop Recording' }).click(); await page.waitForTimeout(300);
  const before = (await overlayVal('Captured'))?.trim();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Free Play', exact: true }).click(); await page.waitForTimeout(1200);
  await openOverlay();
  console.log(`recording across reload: before=${JSON.stringify(before)} after=${JSON.stringify((await overlayVal('Captured'))?.trim())}`);
  console.log('downloads seen in whole run:', JSON.stringify(downloads));
  console.log('console/page errors:', JSON.stringify(errors.filter((e) => !e.includes('"off"') && !e.includes('ERR_ABORTED'))));
}, { port, timeout: 8000 });
console.log(fails === 0 ? 'ALL CHECKS PASSED' : `${fails} CHECK(S) FAILED`);
