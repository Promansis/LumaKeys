import { withServer, text } from './harness.mjs';
const shots = process.env.SHOTS; const data = process.env.DATA;
const rpc = (base, m, args = []) => fetch(`${base}/api/bridge/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }).then((r) => r.json()).then((j) => ('result' in j ? j.result : j));
const vis = (page) => page.$$eval('button', (b) => [...new Set(b.filter((x) => x.offsetParent && !x.closest('nav')).map((x) => (x.getAttribute('aria-label') || x.textContent.trim()).slice(0, 40)).filter((t) => t && !/info$/.test(t)))]);
const openTrainer = async (page, base, i) => {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Theory Trainer', exact: true }).click(); await page.waitForTimeout(700);
  await page.getByRole('button', { name: /^Start/ }).nth(i).click(); await page.waitForTimeout(900);
};
await withServer(data, async ({ page, base, errors }) => {
  // WF-014 scale practice: C major one octave ascending
  await openTrainer(page, base, 0);
  await page.getByRole('button', { name: 'Start Drill' }).click(); await page.waitForTimeout(600);
  for (const k of ['Comma', 'Period', 'Slash', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT']) {
    await page.keyboard.down(k); await page.waitForTimeout(120); await page.keyboard.up(k); await page.waitForTimeout(450);
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${shots}/33-scale-done.png` });
  console.log('WF-014 scale', JSON.stringify((await text(page)).match(/PROGRESS\n[^\n]+|LAST CHECK\n[^\n]+|(complete|Complete|accuracy|Score)[^\n]{0,80}/g)));
  console.log('WF-014 buttons after', JSON.stringify(await vis(page)));
  // WF-013 interval trainer
  await openTrainer(page, base, 1);
  await page.getByRole('button', { name: 'Start Session' }).click(); await page.waitForTimeout(800);
  for (let q = 0; q < 12; q++) {
    const choices = page.locator('.theory-choice-button');
    if (!(await choices.count())) break;
    await choices.first().click(); await page.waitForTimeout(1600);
    if (/SUMMARY|Session complete|Play Again|New Session/i.test(await text(page))) break;
  }
  await page.screenshot({ path: `${shots}/34-interval-done.png` });
  console.log('WF-013 interval', JSON.stringify((await text(page)).replace(/^[\s\S]*?INTERVAL TRAINER/, '').slice(0, 500)));
  // WF-012 theory quiz: chord id
  await openTrainer(page, base, 2);
  await page.getByRole('button', { name: 'Chord ID' }).click(); await page.waitForTimeout(800);
  console.log('quiz buttons', JSON.stringify(await vis(page)));
  for (let q = 0; q < 14; q++) {
    const btns = (await vis(page)).filter((t) => !/Back|Chord ID|Scale ID|Interval ID|Mixed|Replay|Listen|Hear/i.test(t));
    if (!btns.length || /SUMMARY|Final|Review/i.test((await text(page)).slice(-400))) break;
    await page.getByRole('button', { name: btns[0], exact: true }).first().click(); await page.waitForTimeout(500);
    const next = page.getByRole('button', { name: /^(Next|Continue|Finish)/ });
    if (await next.count()) { await next.first().click(); await page.waitForTimeout(400); }
  }
  await page.screenshot({ path: `${shots}/35-quiz-done.png` });
  console.log('WF-012 quiz', JSON.stringify((await text(page)).replace(/^[\s\S]*?THEORY QUIZ/, '').slice(0, 600)));
  console.log('theory rows', JSON.stringify((await rpc(base, 'getTheoryResults', [])).map((r) => [r.type, r.score, r.totalQuestions])));
  console.log('ERRORS', JSON.stringify(errors.filter((e) => !e.includes('"off"'))));
}, { port: 3780, timeout: 8000 });
