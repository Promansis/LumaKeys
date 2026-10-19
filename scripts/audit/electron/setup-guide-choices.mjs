// WF-001 desktop: each setup-guide choice (posture reminder frequency, hand size) is
// stored when the guide is left, survives a relaunch, and reads back in the guide and in
// Settings. Run from $TMPDIR/pw with LK_SQLITE_MODULE and PROFILE (under $TMPDIR) set.
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const Database = createRequire(path.join(REPO, 'package.json'))('better-sqlite3');
const root = process.env.PROFILE;

const stored = (userData) => {
  const db = new Database(path.join(userData, 'lumakeys.db'), { readonly: true, fileMustExist: true });
  try {
    return Object.fromEntries(db.prepare("SELECT category || '.' || key AS k, value FROM settings WHERE (category = 'practice' AND key = 'postureReminderMinutes') OR (category = 'fingering' AND key = 'handSize') OR (category = 'app' AND key LIKE '%setup%')").all().map((r) => [r.k, r.value]));
  } finally { db.close(); }
};
const guideValues = (page) => page.$$eval('.app-shell select', (s) => s.map((x) => x.value));

const cases = [
  { name: 'reminder 10, hand small, Start Practice', reminder: '10', hand: 'small', exit: 'Start Practice', viaKeyboardSetup: false },
  { name: 'reminder 30, hand large, Skip, after a Keyboard Setup round trip', reminder: '30', hand: 'large', exit: 'Skip for now', viaKeyboardSetup: true },
  { name: 'reminder 20, hand medium, Skip', reminder: '20', hand: 'medium', exit: 'Skip for now', viaKeyboardSetup: false },
];

for (const [i, c] of cases.entries()) {
  const profile = path.join(root, `case-${i + 1}`);
  fs.rmSync(profile, { recursive: true, force: true });
  await withElectron(profile, async (h) => {
    let { page } = h;
    await page.waitForTimeout(2500);
    console.log(`\n== ${c.name}`);
    console.log('guide shown', /FIRST PRACTICE SETUP/i.test(await text(page)), 'defaults', JSON.stringify(await guideValues(page)));
    const selects = page.locator('.app-shell select');
    await selects.nth(0).selectOption(c.reminder);
    await selects.nth(1).selectOption(c.hand);
    if (c.viaKeyboardSetup) {
      await page.getByRole('button', { name: 'Keyboard Setup', exact: true }).first().click();
      await page.waitForTimeout(800);
      const onKbd = /Press a key|KEYBOARD SETUP|Bind /i.test(await text(page));
      await page.getByRole('button', { name: /Back|Setup Guide|Return/i }).first().click().catch(async () => { await page.keyboard.press('Escape'); });
      await page.waitForTimeout(800);
      console.log('keyboard setup opened', onKbd, 'back on guide', /FIRST PRACTICE SETUP/i.test(await text(page)), 'values kept', JSON.stringify(await guideValues(page)));
    }
    console.log('stored before leaving the guide', JSON.stringify(stored(h.userData)));
    await page.getByRole('button', { name: c.exit, exact: true }).click();
    await page.waitForTimeout(1000);
    console.log('after', c.exit, 'main menu', /PLAY SONGS/i.test(await text(page)), 'stored', JSON.stringify(stored(h.userData)));
    ({ page } = await h.relaunch());
    await page.waitForTimeout(2500);
    console.log('relaunch: guide shown again', /FIRST PRACTICE SETUP/i.test(await text(page)), 'stored', JSON.stringify(stored(h.userData)));
    await page.getByRole('button', { name: /Keyboard Setup/i }).first().click();
    await page.waitForTimeout(800);
    console.log('main-menu Keyboard Setup card opens the guide', /FIRST PRACTICE SETUP/i.test(await text(page)), 'guide reads', JSON.stringify(await guideValues(page)));
    await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Settings', exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.getByRole('tab', { name: /Practice/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    const reminderInput = await page.evaluate(() => {
      const label = [...document.querySelectorAll('label')].find((l) => /posture/i.test(l.textContent));
      const input = label?.querySelector('input, select');
      return input ? { label: label.textContent.replace(/\s+/g, ' ').trim().slice(0, 60), value: input.value } : null;
    });
    console.log('Settings practice tab posture field', JSON.stringify(reminderInput));
    console.log('ERRORS', JSON.stringify(h.errors));
  });
}
console.log('DONE');
