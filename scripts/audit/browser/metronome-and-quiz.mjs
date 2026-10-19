// Phase 11 lane C: metronome click rate at 100% and 50% tempo, Chromium's shuffle bias,
// and an always-pick-the-first-option theory quiz run. Isolated data dir only.
// Env: DATA (empty isolated data dir), FIXTURE (scripts/audit/fixtures/midi/metro-3-4-late-note.mid: 3/4 at 120 BPM, one note at 30 s),
// QUIZZES (number of chord quizzes to answer by always clicking the first option, default 40).
import fs from 'node:fs';
import { withServer, text } from './harness.mjs';

const data = process.env.DATA;
const fixture = process.env.FIXTURE;
const quizzes = Number(process.env.QUIZZES ?? 40);
const rpc = (base, m, args = []) => fetch(`${base}/api/bridge/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }).then((r) => r.json()).then((j) => ('result' in j ? j.result : j));

await withServer(data, async ({ page, ctx, base, errors }) => {
  // A. Chromium's V8: where does element 0 of a 4-element array land after sort(() => Math.random() - 0.5)?
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  const matrix = await page.evaluate(() => {
    const run = (n) => {
      const m = Array.from({ length: n }, () => Array(n).fill(0));
      for (let i = 0; i < 200000; i += 1) [...Array(n).keys()].sort(() => Math.random() - 0.5).forEach((v, p) => { m[v][p] += 1; });
      return m.map((row) => row.map((c) => Number((100 * c / 200000).toFixed(1))));
    };
    return { ua: navigator.userAgent, four: run(4), six: run(6) };
  });
  console.log('A chromium shuffle matrix (row = input index, % per output position)', JSON.stringify(matrix));

  const skipSetup = async () => {
    if ((await text(page)).includes('FIRST PRACTICE SETUP')) { await page.getByRole('button', { name: 'Skip for now' }).click(); await page.waitForTimeout(300); }
  };
  // B. Metronome. Log every OscillatorNode.start with its frequency (C5 = 523 Hz normal, C6 = 1047 Hz accent).
  await ctx.addInitScript(() => {
    window.__osc = [];
    const orig = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) {
      window.__osc.push({ t: performance.now(), f: Math.round(this.frequency.value) });
      return orig.apply(this, args);
    };
  });
  console.log('B setSetting metronomeDefault', JSON.stringify(await rpc(base, 'setSetting', ['gameplay', 'metronomeDefault', 'true'])));
  console.log('B setSetting leadInBeats', JSON.stringify(await rpc(base, 'setSetting', ['gameplay', 'leadInBeats', '0'])));
  const form = new FormData();
  form.append('files', new Blob([fs.readFileSync(fixture)]), 'metro-3-4-late-note.mid');
  const up = await fetch(`${base}/api/midi/upload`, { method: 'POST', body: form }).then((r) => r.json());
  console.log('B upload', JSON.stringify(up).slice(0, 200));

  for (const tempo of ['1', '0.5']) {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await skipSetup();
    await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(800);
    const card = page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: /^metro-3-4-late-note$/ }) });
    await card.getByRole('button', { name: 'Learn', exact: true }).click(); await page.waitForTimeout(1200);
    // The tempo slider lives in the session overlay (Escape opens it; Resume closes it).
    await page.keyboard.press('Escape'); await page.waitForTimeout(400);
    const slider = page.locator('.tempo-card input[type=range]');
    await slider.fill(tempo); await page.waitForTimeout(300);
    const shown = await page.locator('.tempo-card strong').textContent();
    await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.waitForTimeout(300);
    await page.evaluate(() => document.activeElement?.blur());
    await page.evaluate(() => { window.__osc = []; window.__t0 = performance.now(); });
    await page.keyboard.press('Space');
    await page.waitForTimeout(3000 + 9000); // three-count count-in, then nine seconds of playback
    const res = await page.evaluate(() => ({ t0: window.__t0, osc: window.__osc }));
    const clicks = res.osc.map((o) => ({ s: Number(((o.t - res.t0) / 1000).toFixed(2)), f: o.f }));
    const play = clicks.filter((c) => c.s > 3.05);
    const gaps = play.slice(1).map((c, i) => Number((c.s - play[i].s).toFixed(2)));
    console.log(`B tempo ${tempo} (slider shows ${shown})`, JSON.stringify({ countIn: clicks.filter((c) => c.s <= 3.05), playClicks: play, gapsSec: gaps, accents: play.filter((c) => c.f > 800).map((c) => c.s) }));
    console.log(`B tempo ${tempo} HUD`, JSON.stringify((await text(page)).match(/\d+:\d\d \/ \d+:\d\d/g)));
  }

  // C. Theory quiz, Chord ID, always click the first option.
  let firstCorrect = 0; let asked = 0;
  for (let q = 0; q < quizzes; q += 1) {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    await skipSetup();
    await page.getByRole('button', { name: 'Theory Trainer', exact: true }).click(); await page.waitForTimeout(400);
    await page.getByRole('button', { name: /^Start/ }).nth(2).click(); await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Chord ID' }).click(); await page.waitForTimeout(200);
    for (let i = 0; i < 10; i += 1) {
      await page.locator('.theory-choice-button').first().click(); await page.waitForTimeout(40);
    }
    const review = (await text(page)).match(/Score (\d+) \/ (\d+)/);
    if (review) { firstCorrect += Number(review[1]); asked += Number(review[2]); }
  }
  console.log('C chord quiz always-first', JSON.stringify({ quizzes, asked, firstCorrect, rate: Number((firstCorrect / asked).toFixed(3)), uniformExpectation: 0.25 }));
  const rows = await rpc(base, 'getTheoryResults', []);
  console.log('C theory rows saved', rows.length);
  console.log('ERRORS', JSON.stringify(errors.filter((e) => !e.includes('"off"')).slice(0, 10)));
}, { port: 3795, timeout: 10000 });
