// Lane E (RT-008, PH-UI-001/004 family): keyboard behaviour of the Settings Latency Calibration dialog.
// Env: DATA, SHOTS. Port 3793.
import { withServer } from './harness.mjs';
const j = JSON.stringify;
await withServer(process.env.DATA, async ({ ctx, base, errors }) => {
  const newPage = async () => { const p = await ctx.newPage(); await p.setViewportSize({ width: 1480, height: 960 }); await p.goto(base + '/', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Settings', exact: true }).first().click(); await p.waitForTimeout(900); await p.getByRole('tab', { name: 'Audio' }).click(); await p.waitForTimeout(300); return p; };
  const info = (p) => p.evaluate(() => { const a = document.activeElement; return { focus: a && a !== document.body ? `${a.tagName} "${(a.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22)}" inDialog=${!!a.closest('[role=dialog]')}` : 'body', dialog: !!document.querySelector('[role=dialog]'), onSettings: !!document.querySelector('.settings-screen'), phaseText: (document.querySelector('.latency-wizard-body')?.innerText || '').replace(/\s+/g, ' ').slice(0, 70) }; });
  // 1: open by keyboard, immediate Escape
  let p = await newPage();
  const cal = p.getByRole('button', { name: /Calibrate/ }).first(); await cal.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  console.log('1 opened by Enter on Calibrate:', j(await info(p)));
  await p.screenshot({ path: `${process.env.SHOTS}/E-latency-wizard-open.png` });
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  console.log('1 immediate Escape ->', j(await info(p)), '(oracle: only the dialog closes, Settings stays)');
  await p.close();
  // 2: Tab from the open dialog
  p = await newPage(); await p.getByRole('button', { name: /Calibrate/ }).first().click(); await p.waitForTimeout(500);
  console.log('2 opened by mouse click:', j(await info(p)));
  const trail = []; for (let i = 0; i < 6; i++) { await p.keyboard.press('Tab'); trail.push((await info(p)).focus); }
  console.log('2 Tab x6 trail:', trail.join(' > '));
  await p.close();
  // 3: Enter on the close (x) button
  p = await newPage(); await p.getByRole('button', { name: /Calibrate/ }).first().click(); await p.waitForTimeout(500);
  await p.getByRole('button', { name: '✕' }).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(500);
  console.log('3 Enter on focused close button ->', j(await info(p)), '(oracle: dialog closes)');
  await p.close();
  p = await newPage(); await p.getByRole('button', { name: /Calibrate/ }).first().click(); await p.waitForTimeout(500);
  await p.getByRole('button', { name: '✕' }).focus(); await p.keyboard.press('Space'); await p.waitForTimeout(500);
  console.log('3b Space on focused close button ->', j(await info(p)), '(oracle: dialog closes)');
  await p.close();
  // 4: reach the done phase, then try to activate Apply / Redo with Enter and Space
  for (const key of ['Enter', 'Space']) {
    p = await newPage(); await p.getByRole('button', { name: /Calibrate/ }).first().click(); await p.waitForTimeout(500);
    await p.getByRole('button', { name: 'Start', exact: true }).click(); await p.waitForTimeout(700);
    for (let i = 0; i < 10; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(300); }
    await p.waitForTimeout(500);
    const done = await p.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].map((b) => b.textContent.trim()));
    console.log(`4 (${key}) after 10 Space taps, dialog buttons:`, j(done), j(await info(p)));
    const btnName = done.find((t) => /apply|use|save/i.test(t));
    if (btnName) { await p.getByRole('button', { name: btnName }).first().focus(); await p.keyboard.press(key); await p.waitForTimeout(600); console.log(`4 (${key}) focused "${btnName}" and pressed ${key} ->`, j(await info(p))); }
    const redo = done.find((t) => /redo|again|retry/i.test(t));
    if (redo) { await p.getByRole('button', { name: redo }).first().focus(); await p.keyboard.press(key); await p.waitForTimeout(600); console.log(`4 (${key}) focused "${redo}" and pressed ${key} ->`, j(await info(p))); }
    await p.screenshot({ path: `${process.env.SHOTS}/E-latency-wizard-done-${key}.png` });
    await p.close();
  }
  // 5: control, mouse on Apply and Try Again in the done phase (rules out a generally broken button)
  p = await newPage(); await p.getByRole('button', { name: /Calibrate/ }).first().click(); await p.waitForTimeout(500);
  await p.getByRole('button', { name: 'Start', exact: true }).click(); await p.waitForTimeout(700);
  for (let i = 0; i < 10; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(300); }
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: /^Try Again/ }).click(); await p.waitForTimeout(500);
  console.log('5 control: mouse click Try Again ->', j(await info(p)));
  for (let i = 0; i < 10; i++) { await p.keyboard.press('Space'); await p.waitForTimeout(300); }
  await p.waitForTimeout(500);
  await p.getByRole('button', { name: /^Apply/ }).click(); await p.waitForTimeout(600);
  console.log('5 control: mouse click Apply ->', j(await info(p)), 'saved latencyComp =', await p.evaluate(async () => { const r = await fetch('/api/bridge/getSetting', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args: ['audio', 'latencyCompMs'] }) }); return JSON.stringify(await r.json()); }));
  await p.close();
  console.log('console errors', j(errors.slice(0, 5)));
}, { port: 3793, timeout: 12000 });
