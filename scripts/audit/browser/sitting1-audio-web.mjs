// Sitting 1 item 6, web half (and the web first-launch volume), by capture instead of ears.
// Starts dist/server/index.cjs with a throwaway LUMAKEYS_DATA_DIR and Playwright Chromium (not
// muted) whose audio goes to the PulseAudio null sink lk_s1a; ../electron/sitting1-audio-rec.mjs
// records the browser's own stream into OUT/<name>.wav + OUT/<name>.json, and
// ../electron/sitting1-audio-analyse.py reads them.
// Run from $TMPDIR/pw (copy this file, harness.mjs and sitting1-audio-rec.mjs there), outside the
// sandbox (PulseAudio socket), with the null sink loaded:
//   TMPDIR=/tmp/claude-1000 PULSE_SINK=lk_s1a PLAYWRIGHT_BROWSERS_PATH=$TMPDIR/pw/browsers \
//   DATA=$TMPDIR/p11/S1A/web-data-x OUT=$TMPDIR/p11/S1A/web-x PORT=4121 node sitting1-audio-web.mjs
// Order: Free Play Z X C on the first-launch settings; nudge Master Volume, Reverb Level and
// Metronome Volume in Settings, Audio so the shown values are saved; Z X C again; Flute with
// built-in samples, Free Play C D E in two octaves; Install Better Sounds; the same again.
import { withServer, text } from './harness.mjs';
import { makeRecorder } from './sitting1-audio-rec.mjs';
import fs from 'node:fs';
import path from 'node:path';

const TMP = '/tmp/claude-1000/';
const DATA = process.env.DATA;
const OUT = process.env.OUT;
const SINK = process.env.PULSE_SINK;
const PORT = Number(process.env.PORT ?? 4121);
if (!DATA || !path.resolve(DATA).startsWith(TMP)) throw new Error(`DATA must be under ${TMP}`);
if (fs.existsSync(DATA) && fs.readdirSync(DATA).length) throw new Error('DATA must be a new, empty directory');
if (!OUT || !path.resolve(OUT).startsWith(TMP)) throw new Error(`OUT must be under ${TMP}`);
if (SINK !== 'lk_s1a') throw new Error('PULSE_SINK must be lk_s1a');
if (!(PORT >= 4120 && PORT <= 4139)) throw new Error('PORT must be in 4120-4139');
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

async function freePlayZXC(page, name, meta) {
  await toMenu(page);
  await page.getByRole('button', { name: 'Free Play', exact: true }).click(); await wait(page, 2000);
  const rec = startRec(name, { item: '5a', expected: [{ keys: 'Z X C', midi: [48, 50, 52] }], ...meta });
  await wait(page, 400);
  for (const [code, lab] of [['KeyZ', 'C3'], ['KeyX', 'D3'], ['KeyC', 'E3']]) { await tap(page, rec, code, 400, lab); await wait(page, 800); }
  await wait(page, 1500);
  await rec.stop();
}
async function freePlayCDE(page, name, meta) {
  await toMenu(page);
  await page.getByRole('button', { name: 'Free Play', exact: true }).click(); await wait(page, 2500);
  const rec = startRec(name, { expected: [{ keys: 'Z X C', midi: [48, 50, 52] }, { keys: 'Comma Period Slash', midi: [60, 62, 64] }], ...meta });
  await wait(page, 400);
  for (const [code, lab] of [['KeyZ', 'C3'], ['KeyX', 'D3'], ['KeyC', 'E3']]) { await tap(page, rec, code, 500, lab); await wait(page, 700); }
  await wait(page, 600);
  for (const [code, lab] of [['Comma', 'C4'], ['Period', 'D4'], ['Slash', 'E4']]) { await tap(page, rec, code, 500, lab); await wait(page, 700); }
  await wait(page, 1500);
  await rec.stop();
}

const errs = await withServer(DATA, async ({ page, base }) => {
  const audioLog = [];
  page.on('console', (m) => { if (/AudioEngine|pack/i.test(m.text())) audioLog.push(m.text().replace(/\n[\s\S]*/, '').slice(0, 140)); });
  const trail = (label) => { console.log(`  engine log ${label}`, JSON.stringify(audioLog.filter((l) => /custom|Failed|fallback|loaded successfully|Loading sampler|PolySynth|instrument/i.test(l)).slice(0, 12))); audioLog.length = 0; };
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await wait(page, 1000);
  await skipSetup(page);
  const stored = () => page.evaluate(async () => Object.fromEntries(await Promise.all(['masterVolume', 'reverbLevel', 'metronomeVolume', 'instrument'].map(async (k) => [k, await window.appBridge.getSetting('audio', k)]))));
  const shown = async () => { const o = {}; for (const l of ['Master Volume', 'Reverb Level', 'Metronome Volume']) o[l] = await page.getByRole('slider', { name: l }).inputValue().catch(() => '?'); return o; };

  await freePlayZXC(page, '5a-web-freeplay-zxc-fresh', { runtime: 'web', volumes: 'first launch' });
  trail('first-launch Free Play');
  await openAudioSettings(page);
  console.log(`first launch: stored audio settings ${JSON.stringify(await stored())}; Settings, Audio shows ${JSON.stringify(await shown())}; instrument ${await audioCtl(page, '^Instrument').inputValue().catch(() => '?')}`);
  for (const l of ['Master Volume', 'Reverb Level', 'Metronome Volume']) {
    await page.getByRole('slider', { name: l }).focus();
    await page.keyboard.press('ArrowLeft'); await wait(page, 200); await page.keyboard.press('ArrowRight'); await wait(page, 300);
  }
  await page.locator('#settings-tab-audio').focus(); await wait(page, 600);
  console.log(`after nudge: stored ${JSON.stringify(await stored())}; shows ${JSON.stringify(await shown())}`);
  await freePlayZXC(page, '5a-web-freeplay-zxc-nudged', { runtime: 'web', volumes: 'nudged' });
  trail('nudged Free Play');

  await openAudioSettings(page);
  await audioCtl(page, '^Instrument').selectOption('flute'); await wait(page, 2500);
  console.log('  6 web built-in: instrument', await audioCtl(page, '^Instrument').inputValue(), 'card', await packCard(page));
  trail('after choosing Flute');
  await freePlayCDE(page, '6-web-flute-builtin', { item: '6', runtime: 'web', sound: 'built-in Flute' });
  trail('during built-in Free Play');

  await openAudioSettings(page);
  await page.getByRole('button', { name: /Install Better Sounds/ }).click();
  for (let i = 0; i < 30 && !/ready|failed|error/i.test(await settingsStatus(page)); i += 1) await wait(page, 500);
  await wait(page, 1500);
  console.log('  6 web install status', JSON.stringify(await settingsStatus(page)), 'card', await packCard(page));
  trail('after install');
  await freePlayCDE(page, '6-web-flute-pack', { item: '6', runtime: 'web', sound: 'Flute Enhanced Pack (web)' });
  trail('during pack Free Play');
  console.log('  page text has "installed":', /installed/i.test(await text(page)));
}, { port: PORT, timeout: 15000, launch: { ignoreDefaultArgs: ['--mute-audio'], env: { ...process.env, PULSE_SINK: SINK } } });
console.log('ERRORS', JSON.stringify(errs.filter((e) => !/Insecure Content-Security-Policy|favicon/.test(e)).slice(0, 12)));
console.log('DONE');
