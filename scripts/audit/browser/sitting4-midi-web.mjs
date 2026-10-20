// Phase 11 sitting 4, web half: items 1, 2, 3, 4, 6 and 7 with the scripted Web MIDI device in
// sitting4-midi-common.mjs (Chrome-like fake installed with the context's addInitScript).
// Item 5 (latency feel) needs a person and is not run.
// Env: OUT (output dir under $TMPDIR; the throwaway data dir is OUT/web-data), PORT (default 4160),
//      ONLY (optional comma list of items, e.g. "1,7").
// Run from $TMPDIR/pw with harness.mjs, setup-common.mjs and sitting4-midi-common.mjs beside it:
//   PLAYWRIGHT_BROWSERS_PATH=$TMPDIR/pw/browsers OUT=$TMPDIR/p11/S4 PORT=4160 node sitting4-midi-web.mjs
import fs from 'node:fs';
import path from 'node:path';
import { withServer } from './harness.mjs';
import { uploadMidi, writeRepeatC4 } from './setup-common.mjs';
import {
  FAKE_MIDI, PLAN_KEY, DEV_A, sleep, waitMenu, readMidiNotes, bridge,
  item1, item2, item3, item4, item6, item7,
} from './sitting4-midi-common.mjs';

const TMP = path.resolve(process.env.TMPDIR ?? '/nonexistent');
const OUT = path.resolve(process.env.OUT ?? '');
if (!OUT.startsWith(TMP + path.sep)) throw new Error(`OUT must be under $TMPDIR (${TMP})`);
const DATA = path.join(OUT, 'web-data');
fs.rmSync(DATA, { recursive: true, force: true });
const FIX = path.join(OUT, 'fixtures');
fs.mkdirSync(FIX, { recursive: true });
const REPO_FIX = '/media/storage/LumaKeys/scripts/audit/fixtures/midi';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = (n) => !ONLY || ONLY.has(String(n));
const out = (...a) => console.log('[web]', ...a);

await withServer(DATA, async ({ page, ctx, base, errors, restart, browser }) => {
  out('browser', browser.version(), 'data', DATA);
  await ctx.addInitScript(FAKE_MIDI);
  let cur = page;
  const attach = (pg) => {
    pg.setDefaultTimeout(10000);
    pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
    pg.on('pageerror', (e) => errors.push(`[pageerror] ${e.message.slice(0, 300)}`));
  };
  const setPlan = async (plan) => {
    if (!cur.url().startsWith(base)) await cur.goto(base + '/', { waitUntil: 'domcontentloaded' });
    await cur.evaluate(([k, v]) => localStorage.setItem(k, v), [PLAN_KEY, JSON.stringify(plan)]);
  };
  const c = {
    runtime: 'web',
    get page() { return cur; },
    out,
    async home(plan = { connected: [DEV_A] }) {
      await setPlan(plan);
      await cur.goto(base + '/', { waitUntil: 'networkidle' });
      if (!(await waitMenu(cur))) out('WARN main menu not reached');
      await sleep(300);
    },
    // "Close the app": set the next device plan, close the tab, restart the server, open a new tab.
    async reopen(plan) {
      await setPlan(plan);
      await cur.close();
      await restart();
      cur = await ctx.newPage();
      attach(cur);
      await cur.goto(base + '/', { waitUntil: 'networkidle' });
      if (!(await waitMenu(cur))) out('WARN main menu not reached after reopen');
      await sleep(300);
    },
    shot: (name) => cur.screenshot({ path: path.join(OUT, `web-${name}.png`) }).catch((e) => out('shot failed', name, e.message.slice(0, 80))),
  };

  // Songs through the server's upload route (setup-common).
  await cur.goto(base + '/', { waitUntil: 'networkidle' });
  for (const f of [writeRepeatC4(path.join(FIX, 'repeat-c4.mid')), path.join(REPO_FIX, 'pmus-16.mid'), path.join(REPO_FIX, '6-8-then-3-4-reached.mid')]) {
    out('upload', path.basename(f), JSON.stringify(await uploadMidi(base, f)).slice(0, 160));
  }
  await c.home();
  const songs = await bridge(cur, 'getAllSongs');
  const idOf = (t) => songs.find((s) => s.title === t)?.id;
  out('songs', JSON.stringify(songs.map((s) => [s.title, s.id])));
  const pmus = readMidiNotes(path.join(REPO_FIX, 'pmus-16.mid'));
  const loopNotes = readMidiNotes(path.join(REPO_FIX, '6-8-then-3-4-reached.mid')).filter((n) => n.time >= 3 && n.time < 6);
  out('item 7 loop notes from the file (bars 3-4, 3/4):', JSON.stringify(loopNotes.map((n) => [n.name, n.time, n.ticks])));

  const run = async (n, fn) => {
    if (!want(n)) return;
    out(`===== item ${n} =====`);
    try { await fn(); } catch (e) { out(`ITEM${n} ERROR`, e.stack?.split('\n').slice(0, 4).join(' | ')); await c.shot(`item${n}-error`); }
  };
  await run(1, () => item1(c));
  await run(2, async () => { await item2(c); await item2(c, { variant: true }); });
  await run(3, () => item3(c));
  await run(4, () => item4(c, pmus, idOf('pmus-16')));
  await run(7, async () => { await item7(c, loopNotes, { seamMs: 20, label: 'ITEM7' }); await item7(c, loopNotes, { seamMs: -15, label: 'ITEM7-seam-early-15ms' }); });
  await run(6, () => item6(c));
  out('ERRORS', JSON.stringify(errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 15)));
}, { port: Number(process.env.PORT || 4160), timeout: 10000 });
console.log('[web] DONE');
