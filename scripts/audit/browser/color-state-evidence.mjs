// Lane E (RT-010): screenshots of judged note states (default and colour-blind palettes), the results screen,
// and a theory quiz review, plus the palette values the canvas uses. Env: DATA, SHOTS, FIX. Port 3794.
import { withServer, text } from './harness.mjs';
import fs from 'node:fs';
const j = JSON.stringify;
const rpc = (base, m, args = []) => fetch(`${base}/api/bridge/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }).then((r) => r.json());
await withServer(process.env.DATA, async ({ ctx, base }) => {
  for (const f of fs.readdirSync(process.env.FIX).filter((x) => x.endsWith('.mid'))) { const fd = new FormData(); fd.append('files', new Blob([fs.readFileSync(process.env.FIX + '/' + f)]), f); await fetch(base + '/api/midi/upload', { method: 'POST', body: fd }); }
  for (const cb of ['false', 'true']) {
    console.log(`\n### colorBlindMode=${cb}`);
    console.log('setSetting', j(await rpc(base, 'setSetting', ['visual', 'colorBlindMode', cb])));
    const p = await ctx.newPage(); await p.setViewportSize({ width: 1480, height: 960 });
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(p)).includes('FIRST PRACTICE SETUP')) { await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForSelector('.main-menu-screen'); }
    const pal = await p.evaluate(() => { const s = getComputedStyle(document.documentElement); return Object.fromEntries(['--color-perfect', '--color-good', '--color-ok', '--color-miss', '--hand-left-color', '--hand-right-color', '--color-chart-bg', '--color-accent', '--color-accent-secondary'].map((k) => [k, s.getPropertyValue(k).trim()])); });
    console.log('palette vars', j(pal));
    await p.getByRole('button', { name: 'Play Songs', exact: true }).first().click(); await p.waitForTimeout(900);
    const card = p.locator('article.song-card').filter({ has: p.locator('h2.song-card-title', { hasText: /^short-4-notes$/ }) });
    await card.getByRole('button', { name: 'Play', exact: true }).click(); await p.waitForTimeout(1200);
    await p.evaluate(() => document.activeElement?.blur());
    await p.keyboard.press('Space'); const t0 = Date.now();
    // hit the first two notes (retry until the HUD score changes), leave the last two to miss
    const hud = async () => (await text(p)).match(/SCORE\n(\d+)\nCOMBO\n([^\n]+)/)?.slice(1).join('|') ?? 'n/a';
    for (const k of ['Comma', 'Period']) { const start = await hud(); for (let i = 0; i < 60; i++) { await p.keyboard.down(k); await p.waitForTimeout(60); await p.keyboard.up(k); await p.waitForTimeout(90); if ((await hud()) !== start) break; } }
    console.log('HUD after two hits:', await hud());
    for (let i = 0; i < 12; i++) { await p.waitForTimeout(220); await p.screenshot({ path: `${process.env.SHOTS}/E-color-play-cb-${cb}-${String(i).padStart(2, '0')}.png` }); }
    for (let i = 0; i < 15; i++) { if ((await text(p)).includes('FINAL SCORE')) break; await p.waitForTimeout(1000); }
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${process.env.SHOTS}/E-color-results-cb-${cb}.png` });
    console.log('results text:', j((await text(p)).replace(/\s+/g, ' ').slice(0, 700)));
    await p.close();
  }
  // Theory quiz review (Chord ID), answer with the first choice each time so some answers are wrong
  const p = await ctx.newPage(); await p.setViewportSize({ width: 1480, height: 960 });
  await p.goto(base + '/', { waitUntil: 'networkidle' }); await p.getByRole('button', { name: 'Theory Trainer', exact: true }).first().click(); await p.waitForTimeout(700);
  await p.getByRole('button', { name: /^Start/ }).nth(2).click(); await p.waitForTimeout(900);
  await p.getByRole('button', { name: 'Chord ID' }).click(); await p.waitForTimeout(800);
  const vis = () => p.$$eval('button', (b) => [...new Set(b.filter((x) => x.offsetParent && !x.closest('nav')).map((x) => (x.getAttribute('aria-label') || x.textContent.trim()).slice(0, 40)).filter((t) => t && !/info$/.test(t)))]);
  let shotMid = false;
  for (let q = 0; q < 14; q++) {
    const btns = (await vis()).filter((t) => !/Back|Chord ID|Scale ID|Interval ID|Mixed|Replay|Listen|Hear/i.test(t));
    if (!btns.length || /Review/i.test((await text(p)).slice(-600))) break;
    await p.getByRole('button', { name: btns[0], exact: true }).first().click(); await p.waitForTimeout(450);
    if (!shotMid) { await p.screenshot({ path: `${process.env.SHOTS}/E-color-quiz-feedback.png` }); shotMid = true; console.log('quiz feedback text after first answer:', j((await text(p)).replace(/\s+/g, ' ').slice(-300))); }
    const next = p.getByRole('button', { name: /^(Next|Continue|Finish)/ }); if (await next.count()) { await next.first().click(); await p.waitForTimeout(400); }
  }
  await p.waitForTimeout(600); await p.screenshot({ path: `${process.env.SHOTS}/E-color-quiz-review.png`, fullPage: true });
  console.log('quiz review text:', j((await text(p)).replace(/\s+/g, ' ').slice(0, 900)));
  const cls = await p.$$eval('.review-correct, .review-incorrect', (l) => l.map((x) => `${x.className}: "${x.innerText.replace(/\s+/g, ' ').slice(0, 70)}"`));
  console.log('review rows', j(cls.slice(0, 6)));
}, { port: 3794, timeout: 12000 });
