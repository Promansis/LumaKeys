// Phase 11 sitting 4 (docs/audit/reports/phase-11-user-tests.md) items 1, 2, 3, 4, 6 and 7 with a
// scripted Web MIDI device. Shared by the web driver (browser/sitting4-midi-web.mjs) and the desktop
// driver (electron/sitting4-midi-desktop.mjs); copy this file next to them in $TMPDIR/pw.
//
// FAKE_MIDI extends midi-permission-fallback.mjs's STUB towards Chrome's Web MIDI behaviour:
// - MIDIAccess and MIDIInput are EventTargets. `inputs` is a fresh Map on every read and leaves out
//   ports whose state is "disconnected" (Blink's MIDIAccess::inputs()). `retainDisconnected` in the
//   plan keeps them (the other browser behaviour FA tried); only the web variant of item 2 uses it.
// - Setting onmidimessage or adding a "midimessage" listener opens the port implicitly and
//   asynchronously; the open fires a statechange (connection "open") on the port and the access.
// - Disconnect: state "disconnected", connection "pending" if the port was open. Reconnect of the
//   same id reuses the same MIDIInput and reopens it (one statechange). A new id fires one
//   statechange (connected/closed), then the app's handler opens it (a second one).
// - Messages are real MIDIMessageEvent objects (when the constructor exists) dispatched on the
//   port, with timeStamp set to the moment the key "went down" (performance.now() timebase).
// - Devices present at page load come from localStorage[PLAN_KEY] = {connected: [spec], ...}.
// Read-only hooks for evidence: Tone's own debug log (TONE_DEBUG_CLASS, switched to Sampler or
// PolySynth to match the voice in the engine's noteOn line) and the app's "[AudioEngine]" lines
// go to window.__engineLog; AudioBufferSourceNode start/stop of
// long buffers (piano samples) go to window.__srcLog; Space/Escape keydowns, the count-in overlay,
// the HUD score/combo and the loop label go to __fm.keys and __fm.ui.
import fs from 'node:fs';
import { createRequire } from 'node:module';

export const PLAN_KEY = '__s4MidiPlan';
export const DEV_A = { id: 'S4A-7f3c9e21d4b80a65', name: 'Audit Keys 61', manufacturer: 'Audit Instruments', version: '1.0' };
export const DEV_B = { id: 'S4B-2c81f0a9e6d47b13', name: 'Probe Piano 88', manufacturer: 'Probe Music', version: '2.1' };

export const FAKE_MIDI = `(() => {
  if (window.__fm) return;
  const now = () => performance.now();
  const engine = (window.__engineLog = []);
  // Tone logs one class at a time (TONE_DEBUG_CLASS); follow the voice the engine reports.
  try { window.TONE_DEBUG_CLASS = 'PolySynth'; } catch {}
  const origLog = console.log;
  console.log = function (...a) {
    try {
      const f = a[0];
      if (f && typeof f === 'object' && (f.name === 'Sampler' || f.name === 'PolySynth') && typeof a[1] === 'string') {
        engine.push({ t: now(), msg: f.name + '.' + a[1] + ' ' + a.slice(2).map((x) => Array.isArray(x) ? x.join(',') : String(x)).join(' ') });
        return;
      }
      if (typeof f === 'string' && f.startsWith('[AudioEngine]')) {
        const msg = a.map((x) => (x && typeof x === 'object') ? JSON.stringify(x).slice(0, 80) : String(x)).join(' ');
        if (/noteOn/.test(f)) window.TONE_DEBUG_CLASS = /sampler: true/.test(msg) ? 'Sampler' : 'PolySynth';
        if (!/Sample URLs/.test(f)) engine.push({ t: now(), msg });
      }
    } catch {}
    return origLog.apply(this, a);
  };
  const src = (window.__srcLog = []);
  try {
    const ids = new WeakMap(); let seq = 0;
    const tag = (n) => { if (!ids.has(n)) ids.set(n, ++seq); return ids.get(n); };
    const P = AudioBufferSourceNode.prototype; const S = AudioScheduledSourceNode.prototype;
    const oStart = P.start; const oStop = S.stop;
    P.start = function (...a) { try { if (this.buffer && this.buffer.duration > 1.5) src.push({ t: now(), ev: 'start', n: tag(this), ctx: this.context.currentTime, when: a[0] }); } catch {} return oStart.apply(this, a); };
    S.stop = function (...a) { try { if (this instanceof AudioBufferSourceNode && this.buffer && this.buffer.duration > 1.5) src.push({ t: now(), ev: 'stop', n: tag(this), ctx: this.context.currentTime, when: a[0] }); } catch {} return oStop.apply(this, a); };
  } catch {}

  const fm = (window.__fm = { trace: [], calls: [], dispatches: [], sched: [], keys: [], ui: [], retainDisconnected: false });
  window.__midiCalls = fm.calls;
  const conn = (port) => { const e = new Event('statechange'); Object.defineProperty(e, 'port', { value: port, enumerable: true }); return e; };
  const ports = new Map();
  let access;
  class FakeMIDIInput extends EventTarget {
    constructor(spec) {
      super();
      this.id = spec.id; this.name = spec.name; this.manufacturer = spec.manufacturer; this.version = spec.version || '1.0'; this.type = 'input';
      this.state = 'disconnected'; this.connection = 'closed';
      this._onmidimessage = null; this._onstatechange = null; this._opening = null;
    }
    get onmidimessage() { return this._onmidimessage; }
    set onmidimessage(fn) {
      if (this._onmidimessage) EventTarget.prototype.removeEventListener.call(this, 'midimessage', this._onmidimessage);
      this._onmidimessage = typeof fn === 'function' ? fn : null;
      if (this._onmidimessage) { EventTarget.prototype.addEventListener.call(this, 'midimessage', this._onmidimessage); this.open(); }
      fm.trace.push({ t: now(), ev: 'set-onmidimessage', id: this.id, handler: !!this._onmidimessage });
    }
    get onstatechange() { return this._onstatechange; }
    set onstatechange(fn) {
      if (this._onstatechange) EventTarget.prototype.removeEventListener.call(this, 'statechange', this._onstatechange);
      this._onstatechange = typeof fn === 'function' ? fn : null;
      if (this._onstatechange) EventTarget.prototype.addEventListener.call(this, 'statechange', this._onstatechange);
    }
    addEventListener(type, fn, opts) { super.addEventListener(type, fn, opts); if (type === 'midimessage') this.open(); }
    open() {
      if (this.connection === 'open') return Promise.resolve(this);
      if (this._opening) return this._opening;
      this._opening = new Promise((resolve) => setTimeout(() => {
        this._opening = null;
        if (this.connection !== 'open') {
          if (this.state === 'connected') this._setStates('connected', 'open');
          else if (this.connection !== 'pending') this._setStates('disconnected', 'pending');
        }
        resolve(this);
      }, 0));
      return this._opening;
    }
    close() { if (this.connection !== 'closed') this._setStates(this.state, 'closed'); return Promise.resolve(this); }
    _setStates(state, connection) {
      this.state = state; this.connection = connection;
      fm.trace.push({ t: now(), ev: 'statechange', id: this.id, state, connection });
      this.dispatchEvent(conn(this)); access.dispatchEvent(conn(this));
    }
  }
  class FakeMIDIAccess extends EventTarget {
    constructor() { super(); this.sysexEnabled = false; this._onstatechange = null; }
    get inputs() { return new Map([...ports.values()].filter((p) => fm.retainDisconnected || p.state !== 'disconnected').map((p) => [p.id, p])); }
    get outputs() { return new Map(); }
    get onstatechange() { return this._onstatechange; }
    set onstatechange(fn) {
      if (this._onstatechange) this.removeEventListener('statechange', this._onstatechange);
      this._onstatechange = typeof fn === 'function' ? fn : null;
      if (this._onstatechange) this.addEventListener('statechange', this._onstatechange);
    }
  }
  access = new FakeMIDIAccess();
  fm.access = access; fm.ports = ports;
  let plan = null;
  try { plan = JSON.parse(localStorage.getItem('${PLAN_KEY}') || 'null'); } catch {}
  fm.plan = plan;
  fm.retainDisconnected = !!(plan && plan.retainDisconnected);
  for (const spec of (plan && plan.connected) || []) { const p = new FakeMIDIInput(spec); p.state = 'connected'; ports.set(spec.id, p); }

  fm.connect = (spec) => {
    let p = ports.get(spec.id);
    if (!p) {
      p = new FakeMIDIInput(spec); p.state = 'connected'; p.connection = 'closed'; ports.set(spec.id, p);
      fm.trace.push({ t: now(), ev: 'statechange', id: p.id, state: 'connected', connection: 'closed', added: true });
      access.dispatchEvent(conn(p));
      return 'added';
    }
    if (p.state === 'connected') return 'already';
    if (p.connection === 'pending') { p.state = 'connected'; p.open(); return 'reopened'; }
    p._setStates('connected', p.connection);
    return 'reconnected';
  };
  fm.disconnect = (id) => {
    const p = ports.get(id);
    if (!p || p.state === 'disconnected') return 'absent';
    p._setStates('disconnected', p.connection === 'closed' ? 'closed' : 'pending');
    return 'disconnected';
  };
  fm.send = (id, bytes, ts) => {
    const p = ports.get(id); const t = now();
    const stamp = typeof ts === 'number' ? Math.min(ts, t) : t;
    const ok = !!p && p.state === 'connected' && p.connection === 'open';
    fm.dispatches.push({ t, ts: stamp, id, bytes, delivered: ok });
    if (!ok) return false;
    let ev;
    try { ev = new MIDIMessageEvent('midimessage', { data: new Uint8Array(bytes) }); }
    catch { ev = new Event('midimessage'); Object.defineProperty(ev, 'data', { value: new Uint8Array(bytes) }); }
    Object.defineProperty(ev, 'timeStamp', { value: stamp });
    p.dispatchEvent(ev);
    return true;
  };
  // events: [{at (performance.now ms when the key goes down/up), bytes, tag}]
  fm.playAt = (id, events) => {
    for (const e of events) {
      setTimeout(() => {
        const sent = now();
        const ok = fm.send(id, e.bytes, e.at);
        fm.sched.push({ tag: e.tag, at: e.at, sent, late: sent - e.at, bytes: e.bytes, ok });
      }, Math.max(0, e.at - now()));
    }
    return events.length;
  };
  const req = function requestMIDIAccess(opts) { fm.calls.push({ t: now(), opts: JSON.stringify(opts === undefined ? null : opts) }); return Promise.resolve(access); };
  Object.defineProperty(navigator, 'requestMIDIAccess', { value: req, configurable: true, writable: true });

  window.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Escape') fm.keys.push({ t: now(), code: e.code }); }, true);
  let lastCd = null; let lastHud = ''; let lastLoop = null;
  const scan = () => {
    const cd = document.querySelector('.countdown-overlay');
    const cdv = cd ? cd.textContent.trim() : null;
    if (cdv !== lastCd) { fm.ui.push({ t: now(), ev: 'countdown', v: cdv }); lastCd = cdv; }
    const items = document.querySelectorAll('.immersive-hud-item');
    if (items.length) {
      const m = {};
      items.forEach((el) => { m[(el.querySelector('span') || {}).textContent] = ((el.querySelector('strong') || {}).textContent || '').trim(); });
      const h = (m.Score || '') + ' | ' + (m.Combo || '');
      if (h !== lastHud) { fm.ui.push({ t: now(), ev: 'hud', score: m.Score, combo: m.Combo }); lastHud = h; }
    } else if (lastHud) { lastHud = ''; fm.ui.push({ t: now(), ev: 'hud-gone' }); }
    const ll = document.querySelector('.loop-label');
    const llv = ll ? ll.textContent : null;
    if (llv !== lastLoop) { fm.ui.push({ t: now(), ev: 'loop-label', v: llv }); lastLoop = llv; }
  };
  new MutationObserver(scan).observe(document, { subtree: true, childList: true, characterData: true });
})();`;

// ---------- node-side helpers ----------
export const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
export const text = (page) => page.evaluate(() => document.body.innerText);
export const nowMs = (page) => page.evaluate(() => performance.now());
export async function sleepUntil(page, target) { const n = await nowMs(page); if (target > n) await sleep(target - n); }
export const lit = (page) => page.$$eval('.white-key.active, .black-key.active', (els) => els.map((e) => e.getAttribute('aria-label') || e.className.trim()));
export const send = (page, id, bytes) => page.evaluate(([i, b]) => window.__fm.send(i, b), [id, bytes]);
export const connect = (page, spec) => page.evaluate((s) => ({ t: performance.now(), r: window.__fm.connect(s) }), spec);
export const disconnect = (page, id) => page.evaluate((i) => ({ t: performance.now(), r: window.__fm.disconnect(i) }), id);
export const bridge = (page, m, args = []) => page.evaluate(([mm, a]) => window.appBridge[mm](...a).then((r) => r, (e) => ({ error: String(e) })), [m, args]);
export const logsSince = (page, t) => page.evaluate((s) => ({
  engine: (window.__engineLog || []).filter((e) => e.t >= s),
  src: (window.__srcLog || []).filter((e) => e.t >= s),
  trace: window.__fm.trace.filter((e) => e.t >= s),
  dispatches: window.__fm.dispatches.filter((e) => e.t >= s),
  sched: window.__fm.sched.filter((e) => e.sent >= s),
  keys: window.__fm.keys.filter((e) => e.t >= s),
  ui: window.__fm.ui.filter((e) => e.t >= s),
}), t);
export const hudNow = async (page) => {
  const h = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.immersive-hud-item')].map((el) => [el.querySelector('span')?.textContent ?? '?', el.querySelector('strong')?.textContent?.trim() ?? '?'])));
  return `${h.Score ?? 'n/a'} | ${h.Combo ?? 'n/a'}`;
};
export async function overlayText(page) {
  await page.keyboard.press('Escape'); await sleep(400);
  const t = await text(page);
  await page.keyboard.press('Escape'); await sleep(300);
  await page.evaluate(() => document.activeElement?.blur());
  return t;
}
export const overlayLines = (t) => ({
  status: t.match(/STATUS\n([^\n]+)/i)?.[1] ?? null,
  midiDevices: t.match(/MIDI DEVICES\n([^\n]+)/i)?.[1] ?? null,
});
export async function waitMenu(page, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const skip = page.getByRole('button', { name: /Skip for now/i });
    if (await skip.count().catch(() => 0)) { await skip.first().click(); await sleep(400); }
    if (await page.getByRole('button', { name: 'Play Songs', exact: true }).count().catch(() => 0)) return true;
    await sleep(250);
  }
  return false;
}
export async function waitCountdownEnd(page, since, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const r = await page.evaluate((s) => {
      const ev = window.__fm.ui.filter((e) => e.ev === 'countdown' && e.t >= s);
      const on = ev.findIndex((e) => e.v !== null);
      if (on < 0) return null;
      const off = ev.slice(on).find((e) => e.v === null);
      return off ? { start: ev[on].t, end: off.t, values: ev.slice(on).map((e) => e.v) } : null;
    }, since);
    if (r) return r;
    await sleep(40);
  }
  return null;
}
export async function openSettingsInput(page) {
  await page.getByRole('button', { name: /^Settings/ }).first().click();
  await sleep(700);
  await page.getByRole('tab', { name: /input/i }).click();
  await sleep(400);
}
export const settingsMidi = (page) => page.evaluate(() => {
  const panel = document.querySelector('#settings-panel-input');
  if (!panel) return { panel: false };
  const label = [...panel.querySelectorAll('label')].find((l) => l.querySelector('span')?.textContent === 'MIDI Device');
  const sel = label?.querySelector('select');
  const card = [...panel.querySelectorAll('.settings-note-card')].map((c) => c.innerText.replace(/\n+/g, ' | '));
  return {
    options: sel ? [...sel.options].map((o) => `${o.value || '""'}=${o.textContent}`) : null,
    value: sel?.value ?? null,
    selectedIndex: sel?.selectedIndex ?? null,
    shownText: sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].textContent : '(blank: no option selected)',
    cards: card,
    footer: document.body.innerText.match(/Currently listening for[^\n]*/)?.[0] ?? null,
  };
});
export async function openSong(page, title, mode) {
  await page.getByRole('button', { name: 'Play Songs', exact: true }).click();
  await sleep(900);
  const card = page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: new RegExp(`^${title}$`) }) });
  await card.getByRole('button', { name: mode, exact: true }).click();
  await sleep(1500);
  await page.evaluate(() => document.activeElement?.blur());
}
export function readMidiNotes(file) {
  const { Midi } = createRequire('/media/storage/LumaKeys/package.json')('@tonejs/midi');
  const m = new Midi(fs.readFileSync(file));
  return m.tracks.flatMap((t) => t.notes.map((n) => ({ midi: n.midi, name: n.name, time: +n.time.toFixed(4), dur: +n.duration.toFixed(4), ticks: n.ticks })))
    .sort((a, b) => a.time - b.time).map((n, idx) => ({ ...n, idx: idx + 1 }));
}
const r1 = (x) => Math.round(x * 10) / 10;
// Decode HUD score/combo changes into judgements (ScoringEngine: 100/75/50 x combo multiplier).
export function decodeHud(ui, origin) {
  const out = []; let ps = 0; let pc = 0;
  for (const e of ui.filter((x) => x.ev === 'hud')) {
    const s = Number(String(e.score ?? '0').replace(/[^\d]/g, '')) || 0;
    const c = parseInt(String(e.combo ?? '0'), 10) || 0;
    if (s === ps && c === pc) continue;
    const at = r1(e.t - origin);
    const tier = (d, prevCombo) => {
      const m = Math.min(3, 1 + Math.floor(prevCombo / 10) * 0.1);
      return { [Math.round(100 * m)]: 'perfect', [Math.round(75 * m)]: 'good', [Math.round(50 * m)]: 'ok' }[d] ?? `+${d}?`;
    };
    if (s > ps && c === pc + 1) out.push({ at, hud: `${s}|${c}`, j: tier(s - ps, pc) });
    else if (s === 0 && c === 0) out.push({ at, hud: '0|0', j: ps > 0 ? 'RESET' : 'miss/reset' });
    else if (s === ps && c === 0) out.push({ at, hud: `${s}|0`, j: 'miss' });
    else if (s < ps && c >= 1) out.push({ at, hud: `${s}|${c}`, j: `RESET then ${c} hit(s), ${c === 1 ? tier(s, 0) : 'score ' + s}` });
    else out.push({ at, hud: `${s}|${c}`, j: 'other' });
    ps = s; pc = c;
  }
  return out;
}
const rel = (arr, origin, keys = ['t']) => arr.map((e) => { const o = { ...e }; for (const k of keys) if (typeof o[k] === 'number') o[k] = r1(o[k] - origin); return o; });

// ---------- items ----------
// c: { runtime, page (getter), home(plan), reopen(plan), out(...), shot(name) }
export async function item1(c) {
  await c.home({ connected: [DEV_A] });
  const p = c.page;
  const calls = await p.evaluate(() => ({ calls: window.__midiCalls, fake: typeof window.__fm, ports: [...window.__fm.ports.values()].map((x) => `${x.id} ${x.name} state=${x.state} connection=${x.connection}`) }));
  await openSettingsInput(p);
  const s = await settingsMidi(p);
  c.out('ITEM1 requestMIDIAccess', JSON.stringify(calls));
  c.out('ITEM1 settings input MIDI', JSON.stringify(s));
  c.out('ITEM1 listed by name:', !!s.options?.some((o) => o.endsWith(`=${DEV_A.name}`)));
  await c.shot('item1-settings-input');
}

export async function item2(c, { variant = false } = {}) {
  const tag = variant ? 'ITEM2-variant(retainDisconnected)' : 'ITEM2';
  await c.home({ connected: [DEV_A], retainDisconnected: variant });
  let p = c.page;
  await p.getByRole('button', { name: 'Free Play', exact: true }).click(); await sleep(1500);
  await p.evaluate(() => document.activeElement?.blur());
  if (!variant) {
    // Control: the same hold with no unplug stays lit and unreleased until note-off.
    const m0 = await nowMs(p);
    await send(p, DEV_A.id, [0x90, 60, 100]); await sleep(1600);
    const heldLit = await lit(p);
    await send(p, DEV_A.id, [0x80, 60, 0]); await sleep(500);
    const afterOff = await lit(p);
    const L = await logsSince(p, m0);
    c.out(`${tag} control hold C4 1.6 s, no unplug: lit while held ${JSON.stringify(heldLit)}; after note-off ${JSON.stringify(afterOff)}`);
    c.out(`${tag} control engine log`, JSON.stringify(rel(L.engine, m0)), 'sources', JSON.stringify(rel(L.src, m0)));
  }
  const m1 = await nowMs(p);
  await send(p, DEV_A.id, [0x90, 62, 100]); await sleep(900);
  const litHeld = await lit(p);
  const u = await disconnect(p, DEV_A.id); await sleep(700);
  const litAfterUnplug = await lit(p);
  const L1 = await logsSince(p, m1);
  c.out(`${tag} D4 held: lit ${JSON.stringify(litHeld)}; unplug (${u.r}) at +${r1(u.t - m1)} ms; lit 700 ms after unplug ${JSON.stringify(litAfterUnplug)}`);
  c.out(`${tag} engine log (ms from note-on)`, JSON.stringify(rel(L1.engine, m1)));
  c.out(`${tag} piano sample sources`, JSON.stringify(rel(L1.src, m1)));
  c.out(`${tag} fake statechanges`, JSON.stringify(rel(L1.trace.filter((e) => e.ev === 'statechange'), m1)));
  const released = L1.engine.some((e) => e.t >= u.t && /\.triggerRelease D4/.test(e.msg));
  c.out(`${tag} RESULT held note released on unplug: key unlit=${!litAfterUnplug.length} engine triggerRelease D4 after unplug=${released}`);
  await c.shot(variant ? 'item2v-after-unplug' : 'item2-after-unplug');
  await sleep(800);
  const m2 = await nowMs(p);
  const rp = await connect(p, DEV_A); await sleep(700);
  await send(p, DEV_A.id, [0x90, 64, 100]); await sleep(500);
  const litE = await lit(p);
  await send(p, DEV_A.id, [0x80, 64, 0]); await sleep(500);
  const litE2 = await lit(p);
  const L2 = await logsSince(p, m2);
  c.out(`${tag} replug (${rp.r}); E4 note-on lit ${JSON.stringify(litE)}; after note-off ${JSON.stringify(litE2)}`);
  c.out(`${tag} replug engine log`, JSON.stringify(rel(L2.engine, m2)), 'statechanges', JSON.stringify(rel(L2.trace.filter((e) => e.ev === 'statechange'), m2)));
  c.out(`${tag} piano sample sources since note-on (ms from note-on; ctx = AudioContext s)`, JSON.stringify(rel((await logsSince(p, m1)).src, m1)));
  c.out(`${tag} RESULT works again without restart: ${litE.length > 0 && L2.engine.some((e) => /triggerAttack E4|noteOn: E4/.test(e.msg))}`);
}

export async function item3(c) {
  await c.home({ connected: [DEV_A] });
  const p = c.page;
  await openSong(p, 'repeat-c4', 'Learn');
  const s0 = await nowMs(p);
  await p.keyboard.press('Space');
  const cd0 = await waitCountdownEnd(p, s0);
  const t0 = cd0.end;
  c.out('ITEM3 count-in', JSON.stringify({ values: cd0.values, ms: r1(cd0.end - cd0.start) }));
  await p.evaluate(([id, t]) => window.__fm.playAt(id, [2000, 3000, 4000].flatMap((o, i) => [
    { at: t + o, bytes: [0x90, 60, 100], tag: `C4#${i + 1} on` }, { at: t + o + 150, bytes: [0x80, 60, 0], tag: `C4#${i + 1} off` }])), [DEV_A.id, t0]);
  await sleepUntil(p, t0 + 4700);
  const hudA = await hudNow(p);
  const u = await disconnect(p, DEV_A.id); await sleep(900);
  const hudB = await hudNow(p);
  const ovB = overlayLines(await overlayText(p));
  const s1 = await nowMs(p);
  await p.keyboard.press('Space');
  const cd1 = await waitCountdownEnd(p, s1, 9000);
  c.out(`ITEM3 three MIDI C4s: HUD ${hudA}; unplug -> HUD ${hudB}; overlay ${JSON.stringify(ovB)}; Space then shows a count-in again (song back at 0): ${!!cd1}`);
  const t1 = cd1?.end ?? (await nowMs(p));
  for (const o of [2050, 3050]) { await sleepUntil(p, t1 + o); await p.keyboard.down('Comma'); await sleep(60); await p.keyboard.up('Comma'); }
  await sleep(400);
  const hudC = await hudNow(p);
  const r = await connect(p, DEV_A); await sleep(900);
  const hudD = await hudNow(p);
  const ovD = overlayLines(await overlayText(p));
  const s2 = await nowMs(p);
  await p.keyboard.press('Space');
  const cd2 = await waitCountdownEnd(p, s2, 9000);
  c.out(`ITEM3 after the reload two computer-key C4s: HUD ${hudC}; replug (${r.r}) -> HUD ${hudD}; overlay ${JSON.stringify(ovD)}; Space shows a count-in again: ${!!cd2}`);
  const t2 = cd2?.end ?? (await nowMs(p));
  await p.evaluate(([id, t]) => window.__fm.playAt(id, [{ at: t + 2000, bytes: [0x90, 60, 100], tag: 'C4 after replug on' }, { at: t + 2150, bytes: [0x80, 60, 0], tag: 'off' }]), [DEV_A.id, t2]);
  await sleepUntil(p, t2 + 2600);
  const hudE = await hudNow(p);
  const L = await logsSince(p, s0);
  c.out(`ITEM3 MIDI C4 after replug: HUD ${hudE}`);
  c.out('ITEM3 statechanges (ms from first Space)', JSON.stringify(rel(L.trace.filter((e) => e.ev === 'statechange'), s0)));
  c.out('ITEM3 HUD timeline (ms from first Space)', JSON.stringify(decodeHud(L.ui, s0)), 'unplug at', r1(u.t - s0), 'replug at', r1(r.t - s0));
  c.out('ITEM3 count-ins (ms from first Space)', JSON.stringify(rel(L.ui.filter((e) => e.ev === 'countdown'), s0)));
  c.out('ITEM3 MIDI dispatch lateness ms', JSON.stringify(L.sched.map((e) => r1(e.late))));
}

export async function item4(c, notes, songId) {
  await c.home({ connected: [DEV_A] });
  const p = c.page;
  await openSong(p, 'pmus-16', 'Play');
  const s0 = await nowMs(p);
  await p.keyboard.press('Space');
  const cd = await waitCountdownEnd(p, s0);
  const t0 = cd.end;
  const half = notes.slice(0, 8); const rest = notes.slice(8);
  const ev = (list, base, offSec) => list.flatMap((n, i) => [
    { at: base + (n.time - offSec) * 1000, bytes: [0x90, n.midi, 100], tag: `n${n.idx} on` },
    { at: base + (n.time - offSec) * 1000 + 200, bytes: [0x80, n.midi, 0], tag: `n${n.idx} off` }]);
  await p.evaluate(([id, e]) => window.__fm.playAt(id, e), [DEV_A.id, ev(half, t0, 0)]);
  const pauseSongSec = half[half.length - 1].time + 0.25;
  await sleepUntil(p, t0 + pauseSongSec * 1000);
  await p.keyboard.press('Space');
  await sleep(400);
  const hudPaused = await hudNow(p);
  await sleep(1600);
  const hudPaused2 = await hudNow(p);
  await p.keyboard.press('Space');
  await sleep(50);
  const keys = (await logsSince(p, s0)).keys.filter((k) => k.code === 'Space');
  const tPause = keys[1].t; const tResume = keys[2].t;
  const P = (tPause - t0) / 1000;
  await p.evaluate(([id, e]) => window.__fm.playAt(id, e), [DEV_A.id, ev(rest, tResume, P)]);
  let resultsText = null;
  for (let i = 0; i < 80; i++) { await sleep(250); const t = await text(p); if (/final score/i.test(t)) { resultsText = t; break; } }
  const L = await logsSince(p, s0);
  const rows = songId ? await bridge(p, 'getGameResults', [songId]) : null;
  c.out(`ITEM4 Play mode pmus-16: 8 MIDI notes, Space pause at song ${r1(P * 1000) / 1000} s; HUD paused ${hudPaused}, 1.6 s later ${hudPaused2}; resumed after ${r1(tResume - tPause)} ms`);
  c.out('ITEM4 judgements from HUD (ms from count-in end)', JSON.stringify(decodeHud(L.ui, t0)));
  c.out('ITEM4 MIDI dispatch (tag, ms from count-in end, late ms)', JSON.stringify(L.sched.filter((e) => /on$/.test(e.tag)).map((e) => [e.tag, r1(e.at - t0), r1(e.late)])));
  c.out('ITEM4 results screen', JSON.stringify(resultsText ? resultsText.replace(/\n+/g, ' / ').match(/FINAL SCORE.{0,260}/i)?.[0] : 'no results screen'));
  c.out('ITEM4 stored result rows', JSON.stringify(rows));
  await c.shot('item4-results');
}

export async function item6(c) {
  await c.home({ connected: [DEV_A] });
  let p = c.page;
  await openSettingsInput(p);
  await p.getByLabel('MIDI Device').selectOption({ label: DEV_A.name });
  await sleep(600);
  const sA = await settingsMidi(p);
  const storedA = await bridge(p, 'getSetting', ['input', 'midiDeviceId']);
  c.out(`ITEM6 selected "${DEV_A.name}": stored input.midiDeviceId=${JSON.stringify(storedA)}; settings`, JSON.stringify(sA));
  await c.reopen({ connected: [DEV_B] });
  p = c.page;
  const ports = await p.evaluate(() => [...window.__fm.ports.values()].map((x) => `${x.id} ${x.name} ${x.state}/${x.connection}`));
  await openSettingsInput(p);
  const sB = await settingsMidi(p);
  const storedB = await bridge(p, 'getSetting', ['input', 'midiDeviceId']);
  c.out(`ITEM6 reopened with only "${DEV_B.name}" (${JSON.stringify(ports)}): stored=${JSON.stringify(storedB)}; settings`, JSON.stringify(sB));
  await c.shot('item6-settings-after-swap');
  await c.home({ connected: [DEV_B] });
  p = c.page;
  await p.getByRole('button', { name: 'Free Play', exact: true }).click(); await sleep(1500);
  await p.evaluate(() => document.activeElement?.blur());
  const m = await nowMs(p);
  const deliveredB = await send(p, DEV_B.id, [0x90, 60, 100]); await sleep(500);
  const litB = await lit(p);
  await send(p, DEV_B.id, [0x80, 60, 0]); await sleep(300);
  await p.keyboard.down('Comma'); await sleep(300);
  const litKey = await lit(p);
  await p.keyboard.up('Comma'); await sleep(300);
  const L = await logsSince(p, m);
  c.out(`ITEM6 Free Play: B note-on C4 delivered to the port=${deliveredB}; lit ${JSON.stringify(litB)}; computer key Comma lit ${JSON.stringify(litKey)}; engine ${JSON.stringify(rel(L.engine, m))}`);
  // Control: clear the filter, same device B
  await c.home({ connected: [DEV_B] });
  p = c.page;
  await openSettingsInput(p);
  await p.getByLabel('MIDI Device').selectOption('');
  await sleep(500);
  await c.home({ connected: [DEV_B] });
  p = c.page;
  await p.getByRole('button', { name: 'Free Play', exact: true }).click(); await sleep(1500);
  await p.evaluate(() => document.activeElement?.blur());
  await send(p, DEV_B.id, [0x90, 60, 100]); await sleep(500);
  const litCtl = await lit(p);
  await send(p, DEV_B.id, [0x80, 60, 0]);
  c.out(`ITEM6 control after choosing "Any connected device": B note-on C4 lit ${JSON.stringify(litCtl)}`);
}

// Item 7. seamMs shifts only the second round's downbeat (C4 at the loop seam) against the beat.
export async function item7(c, loopNotes, { seamMs = 20, label = 'ITEM7' } = {}) {
  await c.home({ connected: [DEV_A] });
  const p = c.page;
  await openSong(p, '6-8-then-3-4-reached', 'Learn');
  await p.keyboard.press('Escape'); await sleep(500);
  const total = await p.locator('.loop-total').textContent().catch(() => null);
  await p.getByLabel('Loop start measure').fill('3');
  await p.getByLabel('Loop end measure').fill('4');
  await p.getByRole('button', { name: 'Set Loop', exact: true }).click(); await sleep(1000);
  const loopLabel = await p.locator('.loop-label').textContent().catch(() => null);
  const ov = overlayLines(await text(p));
  await p.getByRole('button', { name: 'Resume', exact: true }).first().click(); await sleep(500);
  await p.evaluate(() => document.activeElement?.blur());
  const s0 = await nowMs(p);
  await p.keyboard.press('Space');
  await sleep(300);
  const space = (await logsSince(p, s0)).keys.find((k) => k.code === 'Space');
  const cdAfterSpace = (await logsSince(p, s0)).ui.filter((e) => e.ev === 'countdown' && e.v !== null).length;
  // Learn mode waits on the loop's first note; the player starts 1 s after Space, then keeps time.
  const T1 = Math.ceil(space.t) + 1000;
  const loopStart = loopNotes[0].time;
  const events = [];
  for (const round of [0, 1]) {
    for (const n of loopNotes) {
      // Round 2: the downbeat lands seamMs off the beat; the rest follow it when it is late
      // (Learn mode waits for the downbeat) and stay on the beat when it is early.
      const shift = round === 0 ? 0 : (n === loopNotes[0] ? seamMs : Math.max(seamMs, 0));
      const off = (n.time - loopStart) * 1000 + round * 3000 + shift;
      events.push({ at: T1 + off, bytes: [0x90, n.midi, 100], tag: `r${round + 1} ${n.name}@${n.time}s on` });
      events.push({ at: T1 + off + 300, bytes: [0x80, n.midi, 0], tag: `r${round + 1} ${n.name} off` });
    }
  }
  await p.evaluate(([id, e]) => window.__fm.playAt(id, e), [DEV_A.id, events]);
  await sleepUntil(p, T1 + 6000 + 1200);
  const hudEnd = await hudNow(p);
  const L = await logsSince(p, s0);
  const ov2 = overlayLines(await overlayText(p));
  c.out(`${label} bar count shown ${JSON.stringify(total)}; after Set Loop label ${JSON.stringify(loopLabel)}; status ${JSON.stringify(ov.status)}; count-in after Space: ${cdAfterSpace > 0}`);
  c.out(`${label} played (tag, ms from first note, dispatch late ms)`, JSON.stringify(L.sched.filter((e) => /on$/.test(e.tag)).map((e) => [e.tag, r1(e.at - T1), r1(e.late)])));
  c.out(`${label} judgements from HUD (ms from first note)`, JSON.stringify(decodeHud(L.ui, T1)));
  c.out(`${label} HUD 1.2 s after round 2: ${hudEnd}; overlay ${JSON.stringify(ov2)}`);
  await c.shot(`${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-end`);
}
