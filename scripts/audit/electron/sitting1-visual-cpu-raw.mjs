// Sitting 1 (visual) item 4 without Playwright: the PACKAGED app launched directly (no Playwright,
// no media or focus emulation) with --remote-debugging-port, read through raw CDP Runtime.evaluate
// only. CPU of the whole Electron process tree from /proc over 30 s visible on the main menu, then
// 30 s minimised by a real window-manager request (ICCCM iconify through sitting1-visual-xtest.py),
// then restored (EWMH activate). Per-process-type breakdown, document.visibilityState and the
// background video's state at each step.
// Env: LK_EXE, PROFILE (fresh empty dir under $TMPDIR), OUT, DISPLAY (:90-:99), CDP_PORT, XVFB_PID_FILE,
// SECONDS_PER_SAMPLE (default 30).
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { xt, wmState, grabPng, grabGray, diffFrac, j, sleep } from './sitting1-visual-probes.mjs';

const TMP = path.resolve(process.env.TMPDIR ?? '/nonexistent');
const PROFILE = path.resolve(process.env.PROFILE ?? '');
const { LK_EXE, OUT } = process.env; const PORT = +process.env.CDP_PORT; const SECS = +(process.env.SECONDS_PER_SAMPLE ?? 30);
if (!PROFILE.startsWith(TMP + path.sep)) throw new Error('PROFILE must be under $TMPDIR');
if (fs.existsSync(PROFILE) && fs.readdirSync(PROFILE).length) throw new Error('PROFILE must be fresh');
const CONFIG = path.join(PROFILE, '.config'); fs.mkdirSync(CONFIG, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const env = { ...process.env, HOME: PROFILE, XDG_CONFIG_HOME: CONFIG, XDG_CACHE_HOME: path.join(PROFILE, '.cache'), DBUS_SESSION_BUS_ADDRESS: `unix:path=${path.join(PROFILE, 'no-session-bus')}` };
for (const k of ['HOME', 'XDG_CONFIG_HOME']) if (!env[k].startsWith(TMP + path.sep)) throw new Error(`${k} escaped $TMPDIR`);
const tag = path.basename(PROFILE);
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);

const app = spawn(LK_EXE, ['--no-sandbox', `--remote-debugging-port=${PORT}`], { env, detached: true, stdio: ['ignore', fs.openSync(path.join(OUT, `${tag}-main.log`), 'a'), fs.openSync(path.join(OUT, `${tag}-main.log`), 'a')] });
log('launched packaged app pid', app.pid, j({ HOME: env.HOME, XDG_CONFIG_HOME: CONFIG }));
const stop = async () => { try { process.kill(-app.pid, 'SIGTERM'); } catch {} await sleep(1500); try { process.kill(-app.pid, 'SIGKILL'); } catch {} };
let ws; let id = 0; const pending = new Map();
const ev = (expr) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } })); });
const STATE = `(() => { const v = document.querySelector('[data-testid="main-menu-background-video"]'); return { visibility: document.visibilityState, hasFocus: document.hasFocus(), video: v ? { paused: v.paused, t: +v.currentTime.toFixed(2) } : null, menu: !!document.querySelector('.main-menu-screen') }; })()`;
try {
  let target;
  for (let i = 0; i < 100 && !target; i++) { try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page' && t.url.startsWith('file:')); } catch {} if (!target) await sleep(200); }
  ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d.result?.result?.value); pending.delete(d.id); } };
  for (let i = 0; i < 50; i++) { const s = await ev(`document.body ? document.body.innerText.slice(0, 200) : ''`); if (/FIRST PRACTICE SETUP/i.test(s ?? '')) { await ev(`[...document.querySelectorAll('button')].find((b) => /Skip for now/.test(b.textContent))?.click()`); } if ((await ev(STATE))?.menu) break; await sleep(300); }
  await sleep(3000);
  const tree = (root) => { const kids = new Map(); for (const p of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) { try { const st = fs.readFileSync(`/proc/${p}/stat`, 'utf8'); const pp = +st.slice(st.lastIndexOf(')') + 2).split(' ')[1]; if (!kids.has(pp)) kids.set(pp, []); kids.get(pp).push(+p); } catch {} } const out = []; const walk = (p) => { out.push(p); for (const c of kids.get(p) ?? []) walk(c); }; walk(root); return out; };
  const kind = (p) => { try { const a = fs.readFileSync(`/proc/${p}/cmdline`, 'utf8').split('\0'); const t = a.find((x) => x.startsWith('--type=')); const u = a.find((x) => x.startsWith('--utility-sub-type=')); return t ? t.slice(7) + (u ? ':' + u.split('.').pop() : '') : 'main'; } catch { return '?'; } };
  const ticks = (p) => { try { const f = fs.readFileSync(`/proc/${p}/stat`, 'utf8'); const x = f.slice(f.lastIndexOf(')') + 2).split(' '); return +x[11] + +x[12]; } catch { return 0; } };
  const xvfb = +fs.readFileSync(process.env.XVFB_PID_FILE, 'utf8');
  const sample = async (label) => {
    const pids = tree(app.pid); const a = new Map(pids.map((p) => [p, ticks(p)])); const xa = ticks(xvfb); const t = Date.now();
    await sleep(SECS * 1000);
    const s = (Date.now() - t) / 1000; const by = {}; let total = 0;
    for (const p of pids) { const d = ticks(p) - a.get(p); total += d; const k = kind(p); by[k] = +((by[k] ?? 0) + (d / s)).toFixed(1); }
    const pct = +((total / s)).toFixed(1); // 100 ticks per second = 1 core
    log(`cpu ${label}: Electron tree (${pids.length} processes) ${pct}% of one core over ${s.toFixed(1)} s; by type ${j(by)}; Xvfb ${((ticks(xvfb) - xa) / s).toFixed(1)}%`);
    return pct;
  };
  const xid = (() => { const out = execFileSync('xwininfo', ['-root', '-tree'], { env, encoding: 'utf8' }); const m = out.split('\n').map((l) => l.match(/^\s+(0x[0-9a-f]+) "LumaKeys": \("lumakeys"/i)).find(Boolean); return m?.[1]; })();
  log('window', xid, wmState(xid), 'state', j(await ev(STATE)));
  const geom = execFileSync('xwininfo', ['-id', xid], { env, encoding: 'utf8' }); const gx = +geom.match(/Absolute upper-left X:\s+(\d+)/)[1], gy = +geom.match(/Absolute upper-left Y:\s+(\d+)/)[1], gw = +geom.match(/Width:\s+(\d+)/)[1], gh = +geom.match(/Height:\s+(\d+)/)[1];
  const region = { x: gx, y: gy, width: gw, height: gh };
  const g1 = grabGray(region); await sleep(1000); const g2 = grabGray(region);
  log('visible: screen-grab change over 1 s', diffFrac(g1, g2)); grabPng(path.join(OUT, `${tag}-visible.png`));
  const visible = await sample('visible main menu');
  log('state at end of visible sample', j(await ev(STATE)));
  log('real WM minimise', xt('iconify', xid)); await sleep(1500);
  log('after minimise', wmState(xid), 'state', j(await ev(STATE)));
  grabPng(path.join(OUT, `${tag}-minimised.png`));
  const s0 = await ev(STATE);
  const minimised = await sample('minimised main menu');
  const s1 = await ev(STATE); await sleep(1000); const s2 = await ev(STATE);
  log('state at end of minimised sample', j(s1), '-> +1 s', j(s2), `(currentTime moved ${s1.video && s2.video ? (s2.video.t - s1.video.t).toFixed(2) : '?'} s in 1 s while minimised)`);
  log('real WM restore (EWMH activate)', xt('activate', xid)); await sleep(1500);
  const r0 = await ev(STATE); await sleep(2000); const r1 = await ev(STATE);
  const g3 = grabGray(region); await sleep(1000); const g4 = grabGray(region);
  log('after restore', wmState(xid), 'state', j(r0), '-> +2 s', j(r1), 'screen-grab change over 1 s', diffFrac(g3, g4));
  grabPng(path.join(OUT, `${tag}-restored.png`));
  log(`cpu RESULT visible=${visible}% minimised=${minimised}% videoResumed=${!!(r1.video && !r1.video.paused && r1.video.t !== r0.video.t)}`);
} finally {
  try { ws?.close(); } catch {}
  await stop();
  log('app stopped', (() => { try { process.kill(app.pid, 0); return 'STILL RUNNING'; } catch { return 'yes'; } })());
}
