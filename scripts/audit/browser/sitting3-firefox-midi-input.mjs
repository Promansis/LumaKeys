// Sitting 3 item 4 (WF-002, RT-011), Firefox: what the app shows about MIDI (boot, Settings > Input) and whether the
// computer keyboard still plays (lit piano keys + Web Audio node starts) when Web MIDI is refused.
// Env: DATA, PORT, SHOTS, FIX. BROWSER=firefox via harness.
import { withServer, text, browserName } from './sitting3-harness.mjs';
const FILE = `${process.env.FIX}/pmus-16.mid`;
await withServer(process.env.DATA, async ({ page: p, base, errors }) => {
  await p.addInitScript(() => {
    window.__audio = { bufStarts: 0, oscStarts: 0, ctx: [] };
    const wrap = (proto, k) => { const o = proto.start; proto.start = function (...a) { window.__audio[k]++; return o.apply(this, a); }; };
    if (window.AudioBufferSourceNode) wrap(AudioBufferSourceNode.prototype, 'bufStarts');
    if (window.OscillatorNode) wrap(OscillatorNode.prototype, 'oscStarts');
    const AC = window.AudioContext; if (AC) { window.AudioContext = class extends AC { constructor(...a) { super(...a); window.__audio.ctx.push(this); } }; }
    window.__midi = { calls: 0 };
    if (navigator.requestMIDIAccess) { const o = navigator.requestMIDIAccess.bind(navigator); navigator.requestMIDIAccess = (...a) => { window.__midi.calls++; window.__midi.t0 = performance.now(); return o(...a).then((r) => { window.__midi.result = 'granted'; window.__midi.ms = performance.now() - window.__midi.t0; return r; }, (e) => { window.__midi.result = `rejected ${e.name}: ${e.message}`; window.__midi.ms = Math.round(performance.now() - window.__midi.t0); throw e; }); }; }
  });
  const t0 = Date.now();
  await p.goto(base + '/', { waitUntil: 'commit' });
  const loading = [];
  for (let i = 0; i < 40; i++) { const tx = (await p.evaluate(() => document.body.innerText).catch(() => '')); if (/Loading services/.test(tx)) loading.push(Date.now() - t0); else if (tx.length > 30) break; await p.waitForTimeout(250); }
  console.log(`first screen: "Loading services..." shown from ~${loading[0]}ms to ~${loading.at(-1)}ms (${loading.length} samples); app UI at ${Date.now() - t0}ms`);
  console.log('requestMIDIAccess:', JSON.stringify(await p.evaluate(() => window.__midi)), 'permission state:', await p.evaluate(async () => (await navigator.permissions.query({ name: 'midi' })).state).catch((e) => 'query failed ' + e.message));
  if (await p.getByRole('button', { name: 'Skip for now' }).count()) { console.log('first-run guide text mentions MIDI?', /MIDI/i.test(await text(p))); await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForTimeout(500); }
  console.log('main menu text mentions MIDI/permission?', JSON.stringify((await text(p)).match(/[^\n]*(MIDI|permission)[^\n]*/gi)));
  await p.getByRole('button', { name: 'Settings', exact: true }).first().click(); await p.waitForTimeout(800);
  await p.getByRole('tab', { name: 'Input' }).click(); await p.waitForTimeout(500);
  const panel = await p.evaluate(() => document.querySelector('[role=tabpanel]')?.innerText || document.body.innerText);
  console.log('Settings > Input panel text:\n' + panel.split('\n').filter(Boolean).slice(0, 40).join(' | '));
  console.log('MIDI device options:', JSON.stringify(await p.$$eval('select option', (o) => o.map((x) => x.textContent))));
  console.log('note card:', JSON.stringify(await p.$$eval('.settings-note-card', (c) => c.map((x) => x.innerText.replace(/\s+/g, ' ')))));
  console.log('Try MIDI Again button present:', await p.getByRole('button', { name: /Try MIDI Again/ }).count());
  await p.screenshot({ path: `${process.env.SHOTS}/item4-firefox-settings-input.png` });
  // Try MIDI Again
  const tr = p.getByRole('button', { name: /Try MIDI Again/ });
  if (await tr.count()) { const s = Date.now(); await tr.click(); await p.waitForTimeout(500); for (let i = 0; i < 30 && (await p.evaluate(() => window.__midi.calls)) < 2; i++) await p.waitForTimeout(200); await p.waitForTimeout(9000); console.log('after Try MIDI Again:', JSON.stringify(await p.evaluate(() => window.__midi)), 'still shows error card:', await p.getByText(/cannot access your MIDI keyboard/).count()); }
  // Upload a song through the library and play with the computer keyboard
  await p.getByRole('button', { name: /^(Back to Main Menu|MAIN)$/i }).first().click(); await p.waitForTimeout(600);
  await p.getByRole('button', { name: 'Play Songs', exact: true }).first().click(); await p.waitForTimeout(800);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.getByRole('button', { name: /Upload MIDI/ }).click()]);
  await fc.setFiles(FILE); await p.waitForTimeout(1500);
  await p.locator('article.song-card').first().getByRole('button', { name: 'Learn', exact: true }).click(); await p.waitForTimeout(1200);
  await p.evaluate(() => document.activeElement?.blur()); await p.keyboard.press('Space');
  await p.waitForTimeout(500);
  const lit = () => p.$$eval('.white-key.active, .black-key.active', (e) => e.map((x) => x.getAttribute('aria-label') || x.className));
  console.log('audio before keys:', JSON.stringify(await p.evaluate(() => ({ b: window.__audio.bufStarts, o: window.__audio.oscStarts, ctx: window.__audio.ctx.map((c) => c.state) }))));
  const res = [];
  for (const code of ['KeyQ', 'Comma', 'Period', 'Slash', 'KeyA', 'KeyZ']) {
    await p.keyboard.down(code); await p.waitForTimeout(150); const on = await lit(); res.push(`${code}: lit=${on.length ? 'yes ' + JSON.stringify(on.slice(0, 2)) : 'no'}`); await p.keyboard.up(code); await p.waitForTimeout(120);
  }
  console.log('computer keys while playing:', res.join(' | '));
  console.log('audio after keys:', JSON.stringify(await p.evaluate(() => ({ b: window.__audio.bufStarts, o: window.__audio.oscStarts, ctx: window.__audio.ctx.map((c) => c.state) }))));
  console.log('HUD', JSON.stringify((await text(p)).match(/SCORE\n(\d+)\nCOMBO\n([^\n]+)/)?.slice(1)));
  await p.screenshot({ path: `${process.env.SHOTS}/item4-firefox-game.png` });
  console.log('page errors', JSON.stringify(errors.filter((e) => !/h1 element|preload/.test(e)).slice(0, 6)));
}, { port: Number(process.env.PORT), timeout: 60000 });
