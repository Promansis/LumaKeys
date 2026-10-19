import { withServer, text } from './harness.mjs';
import fs from 'node:fs';
const shots = process.env.SHOTS;
const NAV = ['Guided Lessons', 'Free Play', 'Soundboard', 'Theory Trainer', 'Progress', 'Settings', 'Keyboard Setup', 'Play Songs', 'Start Song'];
const isMain = async (page) => (await text(page)).includes('Training and Setup');
await withServer(process.env.DATA, async ({ page, base, errors }) => {
  if (!fs.existsSync(process.env.DATA + '/midi-files') || fs.readdirSync(process.env.DATA + '/midi-files').length === 0)
    for (const f of ['ode-to-joy.mid', 'mary-had-a-little-lamb.mid']) { const fd = new FormData(); fd.append('files', new Blob([fs.readFileSync('/media/storage/LumaKeys/public/curriculum-midis/' + f)]), f); await fetch(base + '/api/midi/upload', { method: 'POST', body: fd }); }
  for (const nav of NAV) {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(page)).includes('FIRST PRACTICE SETUP')) await page.getByRole('button', { name: 'Skip for now' }).click();
    const before = errors.length;
    await page.getByRole('button', { name: nav, exact: true }).first().click();
    await page.waitForTimeout(1500);
    const slug = nav.replace(/ /g, '-');
    await page.screenshot({ path: `${shots}/tour-${slug}.png` });
    const t = await text(page);
    const btns = await page.$$eval('button', (b) => [...new Set(b.filter((x) => x.offsetParent).map((x) => (x.getAttribute('aria-label') || x.textContent.trim()).slice(0, 40)).filter(Boolean))]);
    console.log(`== ${nav}\nTEXT ${JSON.stringify(t.slice(0, 500))}\nVISIBLE_BUTTONS ${JSON.stringify(btns.slice(0, 50))}\nNEW_ERRORS ${JSON.stringify(errors.slice(before).filter((e) => !e.includes('"off"')))}`);
    // Exit path
    let how = 'none';
    const back = page.getByRole('button', { name: /^(Back to Main Menu|Back|Main Menu)$/ }).filter({ visible: true }).first();
    if (await back.count()) { how = 'back button'; await back.click(); }
    else if (await page.getByRole('button', { name: 'HUD' }).count()) {
      how = 'HUD then Main';
      await page.getByRole('button', { name: 'HUD' }).click(); await page.waitForTimeout(400);
      await page.getByRole('button', { name: 'Main', exact: true }).filter({ visible: true }).first().click().catch((e) => { how += ' (Main not clickable)'; });
    }
    await page.waitForTimeout(700);
    console.log(`EXIT ${nav} via ${how} -> main menu: ${await isMain(page)}`);
  }
}, { port: 3778 });
