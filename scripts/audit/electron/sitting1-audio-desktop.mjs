// Sitting 1 items 5, 6 and 7 (listening) on the desktop app, by capture instead of ears.
// The app's audio goes to a PulseAudio null sink; sitting1-audio-rec.mjs records the app's own
// stream around each action into OUT/<name>.wav (float32 mono 48 kHz), with OUT/<name>.json
// holding the action times (ms from the start of the recording) and what was expected.
// sitting1-audio-analyse.py reads both.
// Run from $TMPDIR/pw (copy this file, sitting1-audio-rec.mjs and electron-harness.mjs there),
// outside the sandbox (PulseAudio socket), with the null sink loaded:
//   TMPDIR=/tmp/claude-1000 PULSE_SINK=lk_s1a PROFILE=$TMPDIR/p11/S1A/prof-x OUT=$TMPDIR/p11/S1A/x \
//   VOLUMES=fresh PARTS=5a,5b,5c,5d,7,6 \
//   LK_SQLITE_MODULE=$TMPDIR/p11/EL/electron-modules/node_modules/better-sqlite3 node sitting1-audio-desktop.mjs
// PARTS picks and orders the parts. 5d needs OUT/tone440.wav and OUT/tone440.mp3 (ffmpeg).
// 7 needs scripts/audit/fixtures/midi/pmus-16.mid. 6 installs the Flute pack, so run it last.
import { withElectron, text, REPO } from './electron-harness.mjs';
import { makeRecorder } from './sitting1-audio-rec.mjs';
import fs from 'node:fs';
import path from 'node:path';

const TMP = '/tmp/claude-1000/';
const profile = process.env.PROFILE;
const OUT = process.env.OUT;
const SINK = process.env.PULSE_SINK;
// VOLUMES=fresh leaves the first-launch audio settings alone (what the owner gets on a new
// profile); VOLUMES=nudged first nudges Master Volume, Reverb Level and Metronome Volume in
// Settings, Audio (Left then Right arrow), so the values the screen shows are saved and applied.
const VOLUMES = process.env.VOLUMES ?? 'fresh';
const PARTS = (process.env.PARTS ?? '5a,5b,5c,5d,7,6').split(',').map((s) => s.trim()).filter(Boolean);
// Safety: throwaway profile under $TMPDIR, fresh and empty; output under $TMPDIR; only our sink.
if (!profile || !path.resolve(profile).startsWith(TMP)) throw new Error(`PROFILE must be under ${TMP}`);
if (fs.existsSync(profile) && fs.readdirSync(profile).length) throw new Error('PROFILE must be a new, empty directory');
if (!OUT || !path.resolve(OUT).startsWith(TMP)) throw new Error(`OUT must be under ${TMP}`);
if (SINK !== 'lk_s1a') throw new Error('PULSE_SINK must be lk_s1a');
fs.mkdirSync(OUT, { recursive: true });

const startRec = makeRecorder({ out: path.resolve(OUT), sink: SINK });
const wait = (page, ms) => page.waitForTimeout(ms);
const isMain = async (page) => (await text(page)).includes('Training and Setup');
async function skipSetup(page) {
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) { await page.getByRole('button', { name: 'Skip for now' }).click(); await wait(page, 500); }
}
async function toMenu(page) {
  const tryClick = async (re) => {
    const b = page.getByRole('button', { name: re }).filter({ visible: true }).first();
    if (!(await b.count())) return false;
    return b.click({ timeout: 2500 }).then(() => true, () => false);
  };
  for (let i = 0; i < 5 && !(await isMain(page)); i += 1) {
    if (await tryClick(/^(Back to Main Menu|Main Menu)$/)) { await wait(page, 800); continue; }
    if (await tryClick(/^← Back$/)) { await wait(page, 800); continue; }
    await page.keyboard.press('Escape'); await wait(page, 600);
    if (await tryClick(/^(Back to Main Menu|Main Menu)$/)) { await wait(page, 800); continue; }
    if (await tryClick(/^Main$/)) { await wait(page, 800); continue; }
  }
  if (!(await isMain(page))) { console.log('  toMenu: reload'); await page.reload(); await wait(page, 2500); await skipSetup(page); }
}
async function tap(page, rec, code, hold, label) {
  rec.mark(`down ${code}${label ? ` ${label}` : ''}`); await page.keyboard.down(code); await wait(page, hold);
  rec.mark(`up ${code}`); await page.keyboard.up(code);
}
const openAudioSettings = async (page) => {
  await toMenu(page);
  await page.getByRole('button', { name: /^Settings/ }).first().click(); await wait(page, 700);
  await page.locator('#settings-tab-audio').click(); await wait(page, 250);
  const adv = page.getByRole('button', { name: /show advanced options/i });
  if (await adv.count()) { await adv.first().click(); await wait(page, 250); }
};
const audioCtl = (page, label) => page.locator('#settings-panel-audio label').filter({ hasText: new RegExp(label, 'i') }).locator('select, input').first();
const settingsStatus = (page) => page.locator('.settings-status-message').innerText().catch(() => '?');
const packCard = (page) => page.locator('.settings-note-card').filter({ hasText: /Selected Instrument/ }).first().innerText().then((t) => t.replace(/\n+/g, ' | ')).catch(() => 'no card');

// Free Play: C D E twice per octave (Z X C = C3 D3 E3, Comma Period Slash = C4 D4 E4).
async function freePlayCDE(page, name, meta) {
  await toMenu(page);
  await page.getByRole('button', { name: 'Free Play', exact: true }).click(); await wait(page, 2000);
  const rec = startRec(name, { expected: [{ keys: 'Z X C', midi: [48, 50, 52] }, { keys: 'Comma Period Slash', midi: [60, 62, 64] }], ...meta });
  await wait(page, 400);
  for (const [code, lab] of [['KeyZ', 'C3'], ['KeyX', 'D3'], ['KeyC', 'E3']]) { await tap(page, rec, code, 500, lab); await wait(page, 700); }
  await wait(page, 600);
  for (const [code, lab] of [['Comma', 'C4'], ['Period', 'D4'], ['Slash', 'E4']]) { await tap(page, rec, code, 500, lab); await wait(page, 700); }
  await wait(page, 1500);
  await rec.stop();
}

const parts = {
  // Item 5a: Free Play, Z X C, a fresh launch's first presses, then the same again.
  async '5a'(h) {
    const { page } = h;
    await toMenu(page);
    await page.getByRole('button', { name: 'Free Play', exact: true }).click(); await wait(page, 1500);
    for (const pass of [1, 2]) {
      const rec = startRec(`5a-freeplay-zxc-pass${pass}`, { item: '5a', expected: [{ keys: 'Z X C', midi: [48, 50, 52] }], firstPressesAfterLaunch: pass === 1 });
      await wait(page, 400);
      for (const [code, lab] of [['KeyZ', 'C3'], ['KeyX', 'D3'], ['KeyC', 'E3']]) { await tap(page, rec, code, 400, lab); await wait(page, 800); }
      await wait(page, 1500);
      await rec.stop({ statusText: (await text(page)).match(/[^\n]*(Played|Ready|note|Note)[^\n]{0,80}/)?.[0] ?? null });
    }
  },
  // Item 5b: Soundboard, keys pressed quickly (120 ms apart), then at 700 ms spacing.
  async '5b'(h) {
    const { page } = h;
    await toMenu(page);
    await page.getByRole('button', { name: 'Soundboard', exact: true }).click(); await wait(page, 2000);
    const modeName = async () => page.locator('.soundboard-mode-option.active, .soundboard-mode-card.active').first().innerText().then((t) => t.split('\n')[0]).catch(() => '?');
    // The screen opens in its default mode (Classic); the item expects animal sounds, so the
    // same presses are repeated after choosing Animals in the soundboard menu (Escape).
    for (const mode of ['default', 'Animals']) {
      if (mode === 'Animals') {
        await page.keyboard.press('Escape'); await wait(page, 600);
        await page.locator('.soundboard-mode-card').filter({ hasText: 'Animals' }).first().click(); await wait(page, 600);
        await page.getByRole('button', { name: 'Resume', exact: true }).click(); await wait(page, 800);
        const diag = await page.evaluate(() => ({ active: `${document.activeElement?.tagName}.${document.activeElement?.className}`, dialogs: document.querySelectorAll('[role=dialog]').length }));
        console.log(`  5b after Resume: focus ${diag.active}, open dialogs ${diag.dialogs}`);
        await page.screenshot({ path: `${OUT}/5b-animals-after-resume.png` }).catch(() => {});
        // PH-MUS-005: with the menu button focused, note keys are dropped. Capture that once,
        // then move focus off the button (as a mouse click on the stage would) for the real takes.
        const keys0 = ['KeyZ', 'KeyX', 'KeyC'];
        const rec0 = startRec('5b-soundboard-animals-menubuttonfocus', { item: '5b', gapMs: 700, modeChosen: mode, focus: diag.active });
        await wait(page, 400);
        for (const k of keys0) { await tap(page, rec0, k, 60); await wait(page, 620); }
        await wait(page, 1500);
        await rec0.stop({ keys: keys0 });
        await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
        console.log(`  5b focus after blur: ${await page.evaluate(() => document.activeElement?.tagName)}`);
      }
      const shown = await modeName();
      const tag = mode === 'default' ? 'default' : 'animals';
      console.log(`  5b mode ${mode}: active mode card "${shown}"`);
      for (const [gap, label] of [[120, 'burst120'], [700, 'spaced700']]) {
        const keys = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN'];
        const name = `5b-soundboard-${tag}-${label}`;
        const rec = startRec(name, { item: '5b', gapMs: gap, modeChosen: mode, modeShown: shown });
        await wait(page, 400);
        for (const k of keys) { await tap(page, rec, k, 60); await wait(page, Math.max(0, gap - 80)); }
        await wait(page, 4500);
        const status = await page.locator('.status-card.wide strong, .soundboard-stage-status, [class*=status]').allInnerTexts().catch(() => []);
        await rec.stop({ keys, statusLine: (await text(page)).match(/[^\n]*(Played |pops out of the keyboard)[^\n]*/)?.[0] ?? null, statusTexts: status.slice(0, 6) });
        console.log(`  5b ${name} status texts ${JSON.stringify(status.slice(0, 6))}`);
        await wait(page, 500);
      }
    }
  },
  // Item 5c: Interval Trainer, easy, four questions, answered with the first choice.
  async '5c'(h) {
    const { page } = h;
    await toMenu(page);
    await page.getByRole('button', { name: 'Theory Trainer', exact: true }).click(); await wait(page, 800);
    await page.getByRole('button', { name: /^Start/ }).nth(1).click(); await wait(page, 1000);
    const heading = /Hear and identify the interval/.test(await text(page)) ? 'interval trainer' : 'unknown';
    console.log('  5c screen', heading);
    const feedback = () => page.locator('.theory-screen-hero .song-title').first().innerText().catch(() => '?');
    let rec = startRec('5c-interval-q1', { item: '5c', question: 1 });
    await wait(page, 400);
    rec.mark('click Start Session');
    await page.getByRole('button', { name: 'Start Session' }).click();
    for (let q = 1; q <= 4; q += 1) {
      await wait(page, 1800);
      const choice = (await page.locator('.theory-choice-button').first().innerText()).trim();
      const next = q < 4 ? startRec(`5c-interval-q${q + 1}`, { item: '5c', question: q + 1 }) : null;
      // stop the current recording after the next one starts, so no audio is lost between them
      await page.locator('.theory-choice-button').first().click();
      await wait(page, 200);
      const fb = (await feedback()).trim();
      const stated = /^Correct/.test(fb) ? choice : fb.match(/Answer: (.+)\.$/)?.[1] ?? null;
      await rec.stop({ chosen: choice, feedback: fb, statedInterval: stated });
      console.log(`  5c q${q}: chose "${choice}", feedback "${fb}", stated interval "${stated}"`);
      if (next) { next.mark('answer clicked on previous question (next question plays 500 ms later)'); rec = next; }
    }
  },
  // Item 5d: Free Play, Menu, Load Track (WAV, then MP3) through the stubbed picker, Play.
  async '5d'(h) {
    const { page } = h;
    await toMenu(page);
    await page.getByRole('button', { name: 'Free Play', exact: true }).click(); await wait(page, 1500);
    const consoleTrail = [];
    page.on('console', (m) => { if (/file:|Player|buffer|decode|fetch|track/i.test(m.text())) consoleTrail.push(`[${m.type()}] ${m.text().slice(0, 200)}`); });
    for (const ext of ['wav', 'mp3']) {
      const src = path.join(OUT, `tone440.${ext}`);
      if (!fs.existsSync(src)) throw new Error(`missing ${src}`);
      if (!(await page.locator('#free-play-overlay-panel').count())) { await page.keyboard.press('Escape'); await page.waitForSelector('#free-play-overlay-panel'); await wait(page, 300); }
      await h.stubOpen([src]);
      await page.getByRole('button', { name: 'Load Track', exact: true }).click(); await wait(page, 2500);
      const track = await page.locator('#free-play-overlay-panel .free-play-overlay-section').filter({ hasText: 'Backing Track' }).locator('h2').innerText().catch(() => '?');
      const statusLine = (await text(page)).match(/[^\n]*(Backing track|track loaded|Track)[^\n]{0,100}/i)?.[0] ?? null;
      const play = page.locator('#free-play-overlay-panel .free-play-overlay-section').filter({ hasText: 'Backing Track' }).getByRole('button', { name: 'Play', exact: true });
      console.log(`  5d ${ext}: loaded track heading "${track}", status "${statusLine}", Play enabled ${await play.isEnabled().catch(() => 'n/a')}`);
      const rec = startRec(`5d-loadtrack-${ext}`, { item: '5d', source: src, sourceSeconds: 5, sourceHz: 440 });
      await wait(page, 400);
      rec.mark('click Play');
      await play.click().catch((e) => console.log('  5d play click failed', String(e).slice(0, 120)));
      await wait(page, 6500);
      rec.mark('6.5 s after Play');
      await rec.stop({ trackHeading: track, statusAfterPlay: (await text(page)).match(/[^\n]*(Backing track|Track: )[^\n]{0,100}/i)?.[0] ?? null });
      await page.locator('#free-play-overlay-panel .free-play-overlay-section').filter({ hasText: 'Backing Track' }).getByRole('button', { name: 'Stop', exact: true }).click().catch(() => {});
      await wait(page, 500);
    }
    console.log('  5d console trail', JSON.stringify(consoleTrail.slice(0, 8)));
  },
  // Item 7: Start With Metronome on, pmus-16 (quarter notes at 120 BPM from 1.0 s) in Play
  // mode (the song card's primary button, which plays the song's notes), tempo 50 percent.
  async '7'(h) {
    const { page } = h;
    await toMenu(page);
    await page.getByRole('button', { name: /^Settings/ }).first().click(); await wait(page, 700);
    await page.locator('#settings-tab-gameplay').click(); await wait(page, 300);
    const metro = page.locator('#settings-panel-gameplay label').filter({ hasText: 'Start With Metronome' }).locator('select');
    await metro.selectOption('true'); await wait(page, 600);
    console.log('  7 Start With Metronome =', await metro.inputValue());
    await toMenu(page);
    await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await wait(page, 900);
    await h.stubOpen([path.join(REPO, 'scripts/audit/fixtures/midi/pmus-16.mid')]);
    await page.getByRole('button', { name: 'Upload MIDI', exact: true }).click(); await wait(page, 2000);
    // 50 percent is the item; 100 percent is a control for the method (one click per beat expected).
    for (const [tempo, sec] of [['0.5', 15.5], ['1', 9]]) {
      await toMenu(page);
      await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await wait(page, 900);
      const card = page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: /^pmus-16$/ }) }).first();
      await card.getByRole('button', { name: 'Play', exact: true }).click(); await wait(page, 1500);
      await page.keyboard.press('Escape'); await wait(page, 500);
      const slider = page.locator('.tempo-card input[type=range]');
      await slider.fill(tempo); await wait(page, 400);
      const shown = await page.locator('.tempo-card strong').textContent();
      console.log(`  7 tempo ${tempo}: slider shows ${shown}`);
      await page.getByRole('button', { name: 'Resume', exact: true }).click(); await wait(page, 400);
      await page.evaluate(() => document.activeElement?.blur());
      const rec = startRec(`7-metronome-tempo${Math.round(Number(tempo) * 100)}`, { item: '7', song: 'pmus-16.mid', songBpm: 120, tempo: Number(tempo), tempoShown: shown, mode: 'Play (song card primary button, plays the notes)', songNotes: 'C4 D4 E4 F4 repeating, 16 quarter notes from song time 1.0 s, 0.5 s apart in song time, 4/4' });
      await wait(page, 500);
      rec.mark('Space');
      await page.keyboard.press('Space');
      await wait(page, sec * 1000);
      rec.mark(`${sec} s after Space`);
      await rec.stop({ hud: (await text(page)).match(/\d+:\d\d \/ \d+:\d\d/g) });
      await page.keyboard.press('Escape').catch(() => {}); await wait(page, 600);
    }
  },
  // Item 6 desktop: Flute selected, Install Better Sounds, Free Play C D E; then Use Built-in Sounds, again.
  async '6'(h) {
    const { page } = h;
    const audioLog = [];
    page.on('console', (m) => { if (/AudioEngine/i.test(m.text())) audioLog.push(m.text().replace(/\n[\s\S]*/, '').slice(0, 120)); });
    const trail = (label) => { console.log(`  6 engine log ${label}`, JSON.stringify(audioLog.filter((l) => /custom|Failed|fallback|loaded successfully|Loading sampler|PolySynth/i.test(l)))); audioLog.length = 0; };
    await openAudioSettings(page);
    await audioCtl(page, '^Instrument').selectOption('flute'); await wait(page, 1500);
    await page.getByRole('button', { name: /Install Better Sounds/ }).click(); await wait(page, 3500);
    console.log('  6 install status', JSON.stringify(await settingsStatus(page)), 'card', await packCard(page));
    trail('after install');
    await freePlayCDE(page, '6-desktop-flute-pack', { item: '6', runtime: 'desktop', sound: 'Flute Enhanced Pack' });
    trail('during pack Free Play');
    await openAudioSettings(page);
    await page.getByRole('button', { name: /Use Built-in Sounds/ }).first().click(); await wait(page, 1500);
    console.log('  6 built-in status', JSON.stringify(await settingsStatus(page)), 'card', await packCard(page), 'instrument', await audioCtl(page, '^Instrument').inputValue());
    trail('after Use Built-in Sounds');
    await freePlayCDE(page, '6-desktop-flute-builtin', { item: '6', runtime: 'desktop', sound: 'built-in Flute' });
    trail('during built-in Free Play');
  },
};

await withElectron(profile, async (h) => {
  const { page } = h;
  await wait(page, 2500);
  await skipSetup(page);
  const stored = () => page.evaluate(async () => Object.fromEntries(await Promise.all(['masterVolume', 'reverbLevel', 'metronomeVolume'].map(async (k) => [k, await window.appBridge.getSetting('audio', k)]))));
  const shown = async () => { const o = {}; for (const l of ['Master Volume', 'Reverb Level', 'Metronome Volume']) o[l] = await page.getByRole('slider', { name: l }).inputValue().catch(() => '?'); return o; };
  await openAudioSettings(page);
  console.log(`VOLUMES=${VOLUMES}: stored audio settings ${JSON.stringify(await stored())}; Settings, Audio shows ${JSON.stringify(await shown())}`);
  if (VOLUMES === 'nudged') {
    for (const l of ['Master Volume', 'Reverb Level', 'Metronome Volume']) {
      await page.getByRole('slider', { name: l }).focus();
      await page.keyboard.press('ArrowLeft'); await wait(page, 200); await page.keyboard.press('ArrowRight'); await wait(page, 300);
    }
    await page.locator('#settings-tab-audio').focus(); await wait(page, 600);
    console.log(`after nudge: stored ${JSON.stringify(await stored())}; shows ${JSON.stringify(await shown())}`);
  }
  for (const p of PARTS) {
    console.log(`PART ${p}`);
    try { await parts[p](h); } catch (e) { console.log(`PART ${p} FAILED`, String(e).slice(0, 400)); await page.screenshot({ path: path.join(OUT, `fail-${p}.png`) }).catch(() => {}); }
  }
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 12)));
}, { timeout: 15000 });
console.log('DONE');
