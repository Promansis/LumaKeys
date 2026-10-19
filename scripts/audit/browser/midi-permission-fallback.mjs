// WF-002: MIDI permission, device list, disconnect, reconnect, computer-keyboard fallback (web, fake Web MIDI via addInitScript).
// Env: DATA (data dir root), FIX (dir with short-4-notes.mid)
import { withServer, text } from './harness.mjs';
import { uploadMidi, hud, firstLoad, startShortGame, pressUntilScore, openSettingsTab, rpc, writeRepeatC4, overlayText } from './setup-common.mjs';
const data = process.env.DATA; const FIX = process.env.FIX;
const STUB = `
(() => {
  const mode = sessionStorage.getItem('fakeMidi') || 'native';
  if (mode === 'native') return;
  const log = (window.__midiCalls = []);
  if (mode === 'absent') { Object.defineProperty(navigator, 'requestMIDIAccess', { value: undefined, configurable: true }); return; }
  const fm = (window.__fm = { behavior: mode, retain: false });
  const access = new EventTarget(); access.inputs = new Map(); access.outputs = new Map(); access.sysexEnabled = false;
  const mk = (id, name) => ({ id, name, manufacturer: 'Fake Co', type: 'input', state: 'connected', connection: 'open', onmidimessage: null });
  fm.access = access; fm.devs = { 'fake-1': mk('fake-1', 'Fake Piano 88'), 'fake-2': mk('fake-2', 'Fake Second Keys') };
  fm.plug = (id) => { fm.devs[id].state = 'connected'; access.inputs.set(id, fm.devs[id]); access.dispatchEvent(new Event('statechange')); };
  fm.unplug = (id) => { if (fm.retain) fm.devs[id].state = 'disconnected'; else access.inputs.delete(id); access.dispatchEvent(new Event('statechange')); };
  fm.send = (id, bytes) => { const d = fm.devs[id]; d.onmidimessage && d.onmidimessage({ data: new Uint8Array(bytes), timeStamp: performance.now() }); return !!d.onmidimessage; };
  if (mode === 'one') access.inputs.set('fake-1', fm.devs['fake-1']);
  navigator.requestMIDIAccess = (opts) => { log.push(JSON.stringify(opts ?? null)); 
    if (fm.behavior === 'rejected') return Promise.reject(new DOMException('Permission denied', 'SecurityError'));
    if (fm.behavior === 'pending') return new Promise((r) => { fm.release = () => r(access); });
    return Promise.resolve(access); };
})();`;
const gameMidiLine = async (page) => ((await overlayText(page)).match(/MIDI Devices\n([^\n]+)/i)?.[1] ?? 'n/a');
const midiUntilScore = async (page, id, note, tries = 45) => {
  const start = await hud(page);
  for (let i = 0; i < tries; i++) {
    await page.evaluate(([i2, n]) => { window.__fm.send(i2, [0x90, n, 100]); setTimeout(() => window.__fm.send(i2, [0x80, n, 0]), 40); }, [id, note]);
    await page.waitForTimeout(150);
    if ((await hud(page)) !== start) return true;
  }
  return false;
};
const midiCard = async (page) => page.evaluate(() => { const c = document.querySelector('.settings-note-card'); return c ? c.innerText.replace(/\n/g, ' | ') : 'none'; });
const devOptions = (page) => page.$$eval('#settings-panel-input select option', (o) => o.map((x) => x.textContent));
const out = (...a) => console.log(...a);

await withServer(data, async ({ page, base, errors }) => {
  await page.addInitScript(STUB);
  await uploadMidi(base, writeRepeatC4(`${FIX}/repeat-c4.mid`));
  const setMode = (m) => page.evaluate((x) => sessionStorage.setItem('fakeMidi', x), m);
  const cases = ['absent', 'rejected', 'pending', 'empty', 'one'];
  for (const c of cases) {
    out(`\n===== CASE ${c} =====`);
    await firstLoad(page, base); await setMode(c === 'empty' ? 'empty' : c);
    await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
    if (c === 'pending') {
      await page.waitForTimeout(6000);
      out('permission prompt unanswered for 6 s; page shows:', JSON.stringify((await text(page)).replace(/\n+/g, ' / ').slice(0, 160)));
      await page.evaluate(() => window.__fm.release()); await page.waitForTimeout(1000);
      out('after the promise settles, page shows:', JSON.stringify((await text(page)).replace(/\n+/g, ' / ').slice(0, 60)));
    }
    out('requestMIDIAccess type', await page.evaluate(() => typeof navigator.requestMIDIAccess), 'calls', await page.evaluate(() => JSON.stringify(window.__midiCalls)));
    await openSettingsTab(page, 'input');
    out('settings MIDI card:', await midiCard(page));
    out('device select options:', JSON.stringify(await devOptions(page)));
    out('settings status footer:', (await text(page)).match(/Currently listening for[^\n]*/)?.[0]);
    await page.screenshot({ path: `${process.env.TMPDIR}/p11/FA/midi-${c}-settings.png` });
    await page.getByRole('button', { name: /Back to Main Menu/i }).click(); await page.waitForTimeout(400);
    await startShortGame(page, 'Learn', 'repeat-c4');
    out('game MIDI Devices line:', await gameMidiLine(page));
    out('game computer keys score (Comma):', await pressUntilScore(page, 'Comma'), 'HUD', await hud(page));
    if (c === 'one') {
      out('fake MIDI note 60 (C4) scores:', await midiUntilScore(page, 'fake-1', 60), 'HUD', await hud(page));
    }
    await page.screenshot({ path: `${process.env.TMPDIR}/p11/FA/midi-${c}-game.png` });
  }

  // Input mode 'MIDI only' while MIDI is unavailable
  out('\n===== CASE MIDI-only input mode with the Web MIDI API absent =====');
  await setMode('absent'); await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  await openSettingsTab(page, 'input');
  await page.locator('#settings-panel-input select').nth(0).selectOption('midi'); await page.waitForTimeout(400);
  out('settings after choosing MIDI Keyboard Only:', (await text(page)).match(/Currently listening for[^\n]*/)?.[0], '| card:', await midiCard(page));
  await page.getByRole('button', { name: /Back to Main Menu/i }).click(); await page.waitForTimeout(300);
  await startShortGame(page, 'Learn', 'repeat-c4');
  out('computer keys score in MIDI-only mode (expected no):', await pressUntilScore(page, 'Comma', 45), 'HUD', await hud(page));
  out('game overlay Input Mode / MIDI lines:', JSON.stringify((await overlayText(page)).match(/INPUT MODE\n[^\n]+|MIDI DEVICES\n[^\n]+/gi)));
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await openSettingsTab(page, 'input');
  await page.locator('#settings-panel-input select').nth(0).selectOption('both'); await page.waitForTimeout(400);

  // Rejected -> grant -> Try MIDI Again
  out('\n===== CASE rejected then retry =====');
  await setMode('rejected'); await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  await openSettingsTab(page, 'input'); out('before:', await midiCard(page));
  await page.evaluate(() => { window.__fm.behavior = 'one'; window.__fm.plug('fake-1'); });
  await page.waitForTimeout(300);
  out('after plug while still denied-state (no retry click):', await midiCard(page), '| options', JSON.stringify(await devOptions(page)));
  await page.getByRole('button', { name: /Try MIDI Again/ }).click().catch((e) => out('no retry button:', e.message.slice(0, 60)));
  await page.waitForTimeout(500);
  out('after Try MIDI Again:', await midiCard(page), '| options', JSON.stringify(await devOptions(page)));

  // Disconnect / reconnect (variant A: removed from map; variant B: state=disconnected stays in map)
  for (const retain of [false, true]) {
    out(`\n===== CASE one-device disconnect/reconnect, retainDisconnected=${retain} =====`);
    await setMode('one'); await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    await page.evaluate((r) => { window.__fm.retain = r; }, retain);
    await startShortGame(page, 'Learn', 'repeat-c4');
    out('connected: line', await gameMidiLine(page));
    out('MIDI C4 scores while connected:', await midiUntilScore(page, 'fake-1', 60), 'HUD', await hud(page));
    await page.evaluate(() => window.__fm.send('fake-1', [0x90, 62, 100])); // left held across the unplug
    const statusOf = async () => (await overlayText(page)).match(/STATUS\n([^\n]+)/i)?.[1];
    const pre = await hud(page);
    out('before unplug: HUD', pre, '| status', await statusOf());
    await page.evaluate(() => window.__fm.unplug('fake-1')); await page.waitForTimeout(400);
    out('after unplug: HUD', await hud(page), '| status', await statusOf(), '| MIDI line', await gameMidiLine(page));
    out('Comma scores without pressing Space (session paused/reloaded?):', await pressUntilScore(page, 'Comma', 12), 'HUD', await hud(page));
    await page.keyboard.press('Space');
    out('after Space, computer key (Comma) scores:', await pressUntilScore(page, 'Comma'), 'HUD', await hud(page));
    await page.evaluate(() => window.__fm.plug('fake-1')); await page.waitForTimeout(400);
    out('after replug: HUD', await hud(page), '| status', await statusOf(), '| MIDI line', await gameMidiLine(page));
    await page.keyboard.press('Space');
    out('after Space, MIDI note 60 scores after replug:', await midiUntilScore(page, 'fake-1', 60), 'HUD', await hud(page));
    await page.screenshot({ path: `${process.env.TMPDIR}/p11/FA/midi-unplug-retain-${retain}.png` });
    await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
    await page.evaluate((r) => { window.__fm.retain = r; }, retain);
    await openSettingsTab(page, 'input');
    out('settings after cycle: card', await midiCard(page), '| options', JSON.stringify(await devOptions(page)));
  }

  // Selected device vanishes and a different device appears
  out('\n===== CASE selected device gone, other device appears =====');
  await setMode('one'); await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  await openSettingsTab(page, 'input');
  await page.locator('#settings-panel-input select').nth(1).selectOption('fake-1'); await page.waitForTimeout(400);
  out('selected fake-1; card:', await midiCard(page), '| stored', JSON.stringify(await rpc(base, 'getSetting', ['input', 'midiDeviceId'])));
  await page.evaluate(() => { window.__fm.unplug('fake-1'); window.__fm.plug('fake-2'); }); await page.waitForTimeout(300);
  out('fake-1 gone, fake-2 present; card:', await midiCard(page), '| select value', await page.locator('#settings-panel-input select').nth(1).inputValue(), '| options', JSON.stringify(await devOptions(page)));
  await page.getByRole('button', { name: /Back to Main Menu/i }).click(); await page.waitForTimeout(300);
  await startShortGame(page, 'Learn', 'repeat-c4');
  out('game is live: computer key (Comma) scores:', await pressUntilScore(page, 'Comma'), 'HUD', await hud(page));
  out('MIDI from fake-2 scores while filter=fake-1 (45 tries, game live):', await midiUntilScore(page, 'fake-2', 60), 'HUD', await hud(page));
  out('line', await gameMidiLine(page));
  // Control: clear the device filter, same second device now scores
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  await openSettingsTab(page, 'input');
  await page.locator('#settings-panel-input select').nth(1).selectOption(''); await page.waitForTimeout(400);
  await page.evaluate(() => { window.__fm.unplug('fake-1'); window.__fm.plug('fake-2'); });
  await page.getByRole('button', { name: /Back to Main Menu/i }).click(); await page.waitForTimeout(300);
  await startShortGame(page, 'Learn', 'repeat-c4');
  out('CONTROL filter cleared: MIDI from fake-2 scores:', await midiUntilScore(page, 'fake-2', 60), 'HUD', await hud(page));

  out('ERRORS', JSON.stringify(errors.filter((e) => !e.includes('"off"'))));
}, { port: 3781, timeout: 8000 });
