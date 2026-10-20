// Phase 11 sitting 4, desktop half: items 1, 2, 3, 4, 6 and 7 in the headless Electron app (out/)
// with the scripted Web MIDI device from ../browser/sitting4-midi-common.mjs. The fake goes in
// with the Electron context's addInitScript and a reload; the driver first records what the
// app's own Web MIDI does on this machine (no ALSA sequencer), then checks the reloaded page
// called the fake. Item 6 "closes the app" with relaunch() and installs the fake again.
// Item 5 (latency feel) needs a person and is not run.
// Env: PROFILE (new, under $TMPDIR; removed first), LK_SQLITE_MODULE, OUT (evidence dir under
//      $TMPDIR), ONLY (optional comma list of items).
// Run from $TMPDIR/pw with electron-harness.mjs, setup-common.mjs and sitting4-midi-common.mjs:
//   PROFILE=$TMPDIR/p11/S4/el-profile OUT=$TMPDIR/p11/S4 LK_SQLITE_MODULE=... node sitting4-midi-desktop.mjs
import fs from 'node:fs';
import path from 'node:path';
import { withElectron, REPO } from './electron-harness.mjs';
import { writeRepeatC4 } from './setup-common.mjs';
import {
  FAKE_MIDI, PLAN_KEY, DEV_A, sleep, waitMenu, readMidiNotes, bridge, openSettingsInput, settingsMidi,
  item1, item2, item3, item4, item6, item7,
} from './sitting4-midi-common.mjs';

const TMP = path.resolve(process.env.TMPDIR ?? '/nonexistent');
const under = (p) => !!p && path.resolve(p).startsWith(TMP + path.sep);
const profile = process.env.PROFILE;
const OUT = process.env.OUT;
if (!under(profile) || !under(OUT)) throw new Error(`PROFILE and OUT must be under $TMPDIR (${TMP})`);
// The harness sets HOME=PROFILE and XDG_CONFIG_HOME=PROFILE/.config; both are therefore under $TMPDIR.
if (!under(path.join(profile, '.config'))) throw new Error('XDG_CONFIG_HOME would leave $TMPDIR');
fs.rmSync(profile, { recursive: true, force: true });
const FIX = path.join(OUT, 'fixtures');
fs.mkdirSync(FIX, { recursive: true });
const REPO_FIX = path.join(REPO, 'scripts/audit/fixtures/midi');
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
const want = (n) => !ONLY || ONLY.has(String(n));
const out = (...a) => console.log('[desktop]', ...a);

await withElectron(profile, async (h) => {
  const env = await h.app.evaluate(({ app }) => ({ home: process.env.HOME, xdg: process.env.XDG_CONFIG_HOME, userData: app.getPath('userData'), electron: process.versions.electron, chrome: process.versions.chrome }));
  out('isolation', JSON.stringify(env));
  if (![env.home, env.xdg, env.userData].every(under)) throw new Error('Electron profile is not under $TMPDIR; stopping');
  await waitMenu(h.page);

  // What the desktop app's own Web MIDI does here (no /dev/snd/seq), before the fake.
  const native = await h.page.evaluate(() => new Promise((res) => {
    if (!navigator.requestMIDIAccess) { res('requestMIDIAccess absent'); return; }
    const to = setTimeout(() => res('pending after 5 s'), 5000);
    navigator.requestMIDIAccess({ sysex: false }).then(
      (a) => { clearTimeout(to); res(`resolved: ${a.inputs.size} inputs, ${a.outputs.size} outputs`); },
      (e) => { clearTimeout(to); res(`rejected: ${e.name}: ${e.message}`); });
  }));
  out('native Web MIDI in Electron on this host:', native);
  await openSettingsInput(h.page);
  out('settings input MIDI before the fake:', JSON.stringify(await settingsMidi(h.page)));

  const install = async () => { await h.app.context().addInitScript(FAKE_MIDI); };
  const setPlan = (plan) => h.page.evaluate(([k, v]) => localStorage.setItem(k, v), [PLAN_KEY, JSON.stringify(plan)]);
  const reload = async () => {
    await h.page.reload({ waitUntil: 'domcontentloaded' });
    if (!(await waitMenu(h.page))) out('WARN main menu not reached');
    await sleep(400);
  };
  await install();
  const c = {
    runtime: 'desktop',
    get page() { return h.page; },
    out,
    async home(plan = { connected: [DEV_A] }) { await setPlan(plan); await reload(); },
    async reopen(plan) {
      await setPlan(plan);
      await h.relaunch();
      await waitMenu(h.page);
      out('relaunched; before reinstalling the fake the page has __fm:', await h.page.evaluate(() => typeof window.__fm));
      await install();
      await reload();
    },
    shot: (name) => h.page.screenshot({ path: path.join(OUT, `desktop-${name}.png`) }).catch((e) => out('shot failed', name, e.message.slice(0, 80))),
  };
  await c.home();
  out('after reload with the fake:', JSON.stringify(await h.page.evaluate(() => ({ fake: typeof window.__fm, calls: window.__midiCalls, MIDIMessageEvent: typeof MIDIMessageEvent, visibility: document.visibilityState, url: location.protocol }))));

  // Songs through the Library's Upload MIDI with the native dialog stubbed.
  const files = [writeRepeatC4(path.join(FIX, 'repeat-c4.mid')), path.join(REPO_FIX, 'pmus-16.mid'), path.join(REPO_FIX, '6-8-then-3-4-reached.mid')];
  await h.page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await sleep(800);
  await h.stubOpen(files);
  await h.page.getByRole('button', { name: 'Upload MIDI', exact: true }).click(); await sleep(2500);
  const songs = await bridge(h.page, 'getAllSongs');
  const idOf = (t) => songs.find((s) => s.title === t)?.id;
  out('songs', JSON.stringify(songs.map((s) => [s.title, s.id])));
  const pmus = readMidiNotes(path.join(REPO_FIX, 'pmus-16.mid'));
  const loopNotes = readMidiNotes(path.join(REPO_FIX, '6-8-then-3-4-reached.mid')).filter((n) => n.time >= 3 && n.time < 6);

  const run = async (n, fn) => {
    if (!want(n)) return;
    out(`===== item ${n} =====`);
    try { await fn(); } catch (e) { out(`ITEM${n} ERROR`, e.stack?.split('\n').slice(0, 4).join(' | ')); await c.shot(`item${n}-error`); }
  };
  await run(1, () => item1(c));
  await run(2, () => item2(c));
  await run(3, () => item3(c));
  await run(4, () => item4(c, pmus, idOf('pmus-16')));
  await run(7, async () => { await item7(c, loopNotes, { seamMs: 20, label: 'ITEM7' }); await item7(c, loopNotes, { seamMs: -15, label: 'ITEM7-seam-early-15ms' }); });
  await run(6, () => item6(c));
  out('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 15)));
});
console.log('[desktop] DONE');
