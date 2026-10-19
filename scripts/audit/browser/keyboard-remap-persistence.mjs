// WF-003: computer-keyboard remap, persistence across reload and server restart, reset, duplicate, clear, rejected key, save failure.
// Env: DATA, FIX
import { withServer, text } from './harness.mjs';
import { uploadMidi, hud, firstLoad, startShortGame, pressUntilScore, openKeyboardSetup, litKeys, rpc, writeRepeatC4 } from './setup-common.mjs';
const data = process.env.DATA; const FIX = process.env.FIX;
const out = (...a) => console.log(...a);
const status = (page) => page.locator('.keyboard-setup-hero .song-title').innerText();
const label = (page, note) => page.locator(`.keyboard-bind-key[aria-label^="Bind ${note} to "]`).first().getAttribute('aria-label');
const bindLabels = (page, notes) => Promise.all(notes.map(async (n) => `${n}=${(await label(page, n)).replace(`Bind ${n} to `, '')}`));
const stored = async (base) => { const raw = await rpc(base, 'getSetting', ['input', 'keyboardMapping']); try { return JSON.parse(raw); } catch { return raw; } };
const pick = (m, keys) => m && typeof m === 'object' ? Object.fromEntries(keys.map((k) => [k, m[k]])) : m;
const SLOTS = ['note-0', 'note-12', 'note-14', 'note-16'];
const setupLit = (page) => page.$$eval('.keyboard-bind-key.active', (e) => e.map((x) => x.getAttribute('aria-label')));
async function press(page, code, ms = 180) { await page.keyboard.down(code); await page.waitForTimeout(ms); }
async function tap(page, code, fn) { await page.keyboard.down(code); await page.waitForTimeout(150); const r = await fn(); await page.keyboard.up(code); await page.waitForTimeout(100); return r; }
async function capture(page, note, code) {
  await page.locator(`.keyboard-bind-key[aria-label^="Bind ${note} to "]`).first().click();
  await page.waitForTimeout(150);
  const prompt = await status(page);
  await page.keyboard.press(code); await page.waitForTimeout(500);
  return { prompt, after: await status(page) };
}
async function freePlayLit(page, code) {
  await page.getByRole('button', { name: 'Free Play', exact: true }).click(); await page.waitForTimeout(1200);
  const l = await tap(page, code, () => litKeys(page));
  await page.goto(page.url().split('#')[0], { waitUntil: 'networkidle' });
  return l;
}

await withServer(data, async ({ page, base, errors, restart }) => {
  await uploadMidi(base, writeRepeatC4(`${FIX}/repeat-c4.mid`));
  await firstLoad(page, base);
  await openKeyboardSetup(page);
  out('initial status:', await status(page));
  out('default bindings:', JSON.stringify(await bindLabels(page, ['C3', 'C4', 'D4', 'E4'])));
  out('stored mapping before any change:', JSON.stringify(await rpc(base, 'getSetting', ['input', 'keyboardMapping'])));

  // 1. Remap C4: Comma -> KeyK
  const r1 = await capture(page, 'C4', 'KeyK');
  out('remap C4 -> K: prompt =', JSON.stringify(r1.prompt), '| result =', JSON.stringify(r1.after));
  out('labels:', JSON.stringify(await bindLabels(page, ['C4', 'D4'])), '| stored:', JSON.stringify(pick(await stored(base), SLOTS)));
  await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.evaluate(() => document.activeElement?.blur());
  out('Keyboard Setup lights on K:', JSON.stringify(await tap(page, 'KeyK', () => setupLit(page))), '| on old Comma:', JSON.stringify(await tap(page, 'Comma', () => setupLit(page))));

  // 2. Reload, Free Play + game
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  out('after reload, Free Play lights on K:', JSON.stringify(await freePlayLit(page, 'KeyK')), '| on Comma:', JSON.stringify(await freePlayLit(page, 'Comma')));
  await startShortGame(page, 'Learn', 'repeat-c4');
  out('game: old key Comma scores:', await pressUntilScore(page, 'Comma', 14), '| new key K scores:', await pressUntilScore(page, 'KeyK', 45), '| HUD', await hud(page));

  // 3. Server restart
  await restart(); await page.goto(base + '/', { waitUntil: 'networkidle' });
  out('after server restart, stored:', JSON.stringify(pick(await stored(base), SLOTS)));
  out('after restart, Free Play lights on K:', JSON.stringify(await freePlayLit(page, 'KeyK')), '| on Comma:', JSON.stringify(await freePlayLit(page, 'Comma')));

  // 4. Rejected keys
  await openKeyboardSetup(page);
  await page.locator('.keyboard-bind-key[aria-label^="Bind D4 to "]').first().click(); await page.waitForTimeout(150);
  for (const code of ['ShiftLeft', 'CapsLock', 'ControlRight']) {
    await page.keyboard.down(code); await page.keyboard.up(code); await page.waitForTimeout(150);
    out(`unsupported ${code}: status =`, JSON.stringify(await status(page)), '| D4 label', await label(page, 'D4'));
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  out('Escape: status =', JSON.stringify(await status(page)), '| D4 label', await label(page, 'D4'), '| stored D4', JSON.stringify(pick(await stored(base), ['note-14'])));

  // 5. Duplicate: bind D4 to K (K is C4's key)
  const r5 = await capture(page, 'D4', 'KeyK');
  out('duplicate: bind D4 -> K (K already on C4): result =', JSON.stringify(r5.after));
  out('labels now:', JSON.stringify(await bindLabels(page, ['C4', 'D4'])), '| stored:', JSON.stringify(pick(await stored(base), SLOTS)));
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await openKeyboardSetup(page);
  out('after reload labels:', JSON.stringify(await bindLabels(page, ['C4', 'D4'])));
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  out('after reload, key K lights:', JSON.stringify(await tap(page, 'KeyK', () => setupLit(page))), '| Comma lights:', JSON.stringify(await tap(page, 'Comma', () => setupLit(page))));

  // 6. Duplicate onto a default key that another slot still holds: bind D4 to KeyZ (note-0 default)
  const r6 = await capture(page, 'D4', 'KeyZ');
  out('bind D4 -> Z (Z is C3 default): result =', JSON.stringify(r6.after), '| labels', JSON.stringify(await bindLabels(page, ['C3', 'D4'])), '| stored', JSON.stringify(pick(await stored(base), SLOTS)));
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await openKeyboardSetup(page);
  out('after reload labels (C3 should be unbound):', JSON.stringify(await bindLabels(page, ['C3', 'D4'])));
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  out('after reload, pressing Z lights:', JSON.stringify(await tap(page, 'KeyZ', () => setupLit(page))));

  // 7. Clear
  await page.locator('.keyboard-bind-key[aria-label^="Bind E4 to "]').first().click(); await page.waitForTimeout(100);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.getByRole('button', { name: 'Clear' }).first().click(); await page.waitForTimeout(500);
  out('Clear E4: status =', JSON.stringify(await status(page)), '| label', await label(page, 'E4'), '| stored', JSON.stringify(pick(await stored(base), ['note-16'])));
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await openKeyboardSetup(page);
  out('after reload E4 label (expected Unbound):', await label(page, 'E4'));

  // 8. Reset
  await page.getByRole('button', { name: 'Reset Mapping' }).click(); await page.waitForTimeout(600);
  out('Reset: status =', JSON.stringify(await status(page)), '| labels', JSON.stringify(await bindLabels(page, ['C3', 'C4', 'D4', 'E4'])));
  const def = await stored(base);
  out('stored after reset:', JSON.stringify(pick(def, SLOTS)));
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  out('Comma lights after reset:', JSON.stringify(await tap(page, 'Comma', () => setupLit(page))), '| K lights:', JSON.stringify(await tap(page, 'KeyK', () => setupLit(page))));

  // 9. Save failure: HTTP 500 then network abort (PH-ARCH-002 oracle: UI must not claim success; reload shows what was stored)
  for (const mode of ['http500', 'abort']) {
    await page.goto(base + '/', { waitUntil: 'networkidle' }); await openKeyboardSetup(page);
    await page.route('**/api/bridge/setSetting', (route) => (mode === 'abort' ? route.abort('failed') : route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'disk full (audit)' }) })));
    const r = await capture(page, 'C4', 'KeyJ');
    await page.waitForTimeout(400);
    out(`save ${mode}: result status =`, JSON.stringify(r.after), '| label', await label(page, 'C4'), '| toast', JSON.stringify(await page.locator('[role="alert"], [role="status"], .toast').allInnerTexts()));
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    out(`  key J lights now (session-only): ${JSON.stringify(await tap(page, 'KeyJ', () => setupLit(page)))}`);
    await page.unroute('**/api/bridge/setSetting');
    await page.goto(base + '/', { waitUntil: 'networkidle' }); await openKeyboardSetup(page);
    out(`  after reload C4 label: ${await label(page, 'C4')} | stored ${JSON.stringify(pick(await stored(base), ['note-12']))}`);
  }

  // 9b. Browser-reserved keys are accepted as bindings (observation): Tab and F5
  await page.goto(base + '/', { waitUntil: 'networkidle' }); await openKeyboardSetup(page);
  for (const code of ['Tab', 'F5', 'Enter', 'ArrowLeft']) {
    const rr = await capture(page, 'D4', code);
    await page.locator('body').click({ position: { x: 5, y: 5 } }); await page.evaluate(() => document.activeElement?.blur());
    await page.evaluate(() => { window.__dp = []; window.addEventListener('keydown', (e) => window.__dp.push(e.defaultPrevented)); });
    await page.keyboard.press(code); await page.waitForTimeout(150);
    const prevented = await page.evaluate(() => window.__dp.slice(-1)[0]);
    out(`bind D4 -> ${code}: result =`, JSON.stringify(rr.after), '| keydown defaultPrevented after binding:', prevented);
  }
  await page.getByRole('button', { name: 'Reset Mapping' }).click(); await page.waitForTimeout(400);

  // 10. Octave keys
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await tap(page, 'BracketRight', async () => {}); await page.waitForTimeout(200);
  out('after ] octave shift reads:', (await text(page)).match(/OCTAVE SHIFT\n([^\n]+)/i)?.[1]);
  out('ERRORS', JSON.stringify(errors.filter((e) => !e.includes('"off"') && !e.includes('setSetting') && !e.includes('mainmenu-neon'))));
}, { port: 3782, timeout: 8000 });
