import { withServer, text } from './harness.mjs';
const shots = process.env.SHOTS; const data = process.env.DATA; const MODE = process.env.MODE || 'Learn';
const rpc = (base, m, args = []) => fetch(`${base}/api/bridge/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }).then((r) => r.json()).then((j) => ('result' in j ? j.result : j));
const hud = async (page) => (await text(page)).match(/SCORE\n(\d+)\nCOMBO\n([^\n]+)/)?.slice(1).join(' | ') ?? 'n/a';
await withServer(data, async ({ page, base, errors }) => {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(800);
  const card = page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: /^short-4-notes$/ }) });
  await card.getByRole('button', { name: MODE, exact: true }).click(); await page.waitForTimeout(1000);
  const focusDesc = () => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName}.${a.className}`.slice(0, 80) + ' ' + (a.textContent || '').trim().slice(0, 30) : 'none'; });
  console.log('FOCUS at game start', await focusDesc());
  if (process.env.BLUR === '1') { await page.evaluate(() => document.activeElement?.blur()); console.log('FOCUS after blur', await focusDesc()); }
  await page.keyboard.press('Space');
  const t0 = Date.now();
  const log = [];
  for (const k of ['Comma', 'Period', 'Slash', 'KeyQ']) {
    const start = await hud(page);
    let changed = false;
    for (let i = 0; i < 40 && !changed; i++) {
      await page.keyboard.down(k); await page.waitForTimeout(60); await page.keyboard.up(k);
      await page.waitForTimeout(90);
      const now = await hud(page);
      if (now !== start) { changed = true; log.push(`${k} hit at ${Date.now() - t0}ms -> ${now}`); }
    }
    if (!changed) log.push(`${k} never changed score (${start})`);
  }
  console.log(JSON.stringify(log, null, 1));
  let done = false;
  for (let i = 0; i < 15 && !done; i++) { await page.waitForTimeout(1000); done = (await text(page)).includes('FINAL SCORE'); }
  await page.screenshot({ path: `${shots}/25-results-${MODE}.png` });
  console.log('results', done, JSON.stringify((await text(page)).match(/FINAL SCORE\n\d+|[\d.]+% accuracy|PERFECT\n\d+|GOOD\n\d+|OK\n\d+|MISS\n\d+|MODE\n[^\n]+/g)));
  const songs = await rpc(base, 'getAllSongs');
  console.log('rows', JSON.stringify((await rpc(base, 'getGameResults', [songs[0].id])).map((r) => [r.mode, r.score, r.perfectHits, r.goodHits, r.okHits, r.misses])));
  console.log('ERRORS', JSON.stringify(errors.filter((e) => !e.includes('"off"'))));
}, { port: 3780, timeout: 8000 });
