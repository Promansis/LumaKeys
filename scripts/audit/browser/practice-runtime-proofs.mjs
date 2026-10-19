// Phase 11 lane C runtime proofs on the web build, isolated data dir only.
// Part 1 (PH-MUS-001): in Learning mode, judge four notes, change tempo from the session overlay,
//   and confirm the score and combo survive; a structural control must ask before restarting.
// Part 2 (PH-MUS-003): in a one-bar loop (measure 2), set a custom finger on the loop's first note
//   through the UI, then clear the loop and check the override sits on the same song note, not on
//   the full song's first note.
// Env: DATA (empty isolated data dir), FIXTURE (scripts/audit/fixtures/midi/pmus-16.mid: 16 quarter notes
//      C4 D4 E4 F4 repeating from 1.0 s, 120 BPM, 4/4), POS (JSON written by
//      `node --import tsx scripts/audit/note-positions.ts scripts/audit/fixtures/midi/pmus-16.mid`:
//      GameSession visible-note ratios when paused at session start, used to click notes).
// Port 3795 (lane C). Dialogs are logged and dismissed (Cancel).
import fs from 'node:fs';
import { withServer, text } from './harness.mjs';

const data = process.env.DATA;
const fixture = process.env.FIXTURE;
const pos = JSON.parse(fs.readFileSync(process.env.POS, 'utf8'));
const rpc = (base, m, args = []) => fetch(`${base}/api/bridge/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }).then((r) => r.json()).then((j) => ('result' in j ? j.result : j));
const hud = async (page) => (await text(page)).match(/SCORE\n(\d+)\nCOMBO\n([^\n]+)/)?.slice(1).join(' | ') ?? 'n/a';

await withServer(data, async ({ page, base, errors }) => {
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  await rpc(base, 'setSetting', ['gameplay', 'leadInBeats', '0']);
  const form = new FormData();
  form.append('files', new Blob([fs.readFileSync(fixture)]), 'pmus-16.mid');
  const up = await fetch(`${base}/api/midi/upload`, { method: 'POST', body: form }).then((r) => r.json());
  const songId = up.songs?.[0]?.songId;
  console.log('upload', songId);
  const openSong = async () => {
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(page)).includes('FIRST PRACTICE SETUP')) await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(800);
    const card = page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: /^pmus-16$/ }) });
    await card.getByRole('button', { name: 'Learn', exact: true }).click(); await page.waitForTimeout(1200);
    await page.evaluate(() => document.activeElement?.blur());
  };

  // Part 1: PH-MUS-001
  await openSong();
  await page.keyboard.press('Space');
  await page.waitForTimeout(3000 + 1000 + 250); // count-in, then first note at 1.0 s (Learning blocks there)
  for (const key of ['Comma', 'Period', 'Slash', 'KeyQ']) {
    await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key);
    await page.waitForTimeout(650);
  }
  const before = await hud(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.locator('.tempo-card input[type=range]').fill('0.75'); await page.waitForTimeout(300);
  const tempoShown = await page.locator('.tempo-card strong').textContent();
  const afterTempo = await hud(page);
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.waitForTimeout(200);
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(800);
  await page.keyboard.down('Comma'); await page.waitForTimeout(60); await page.keyboard.up('Comma');
  await page.waitForTimeout(400);
  const afterNext = await hud(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Left Hand', exact: true }).click(); await page.waitForTimeout(500);
  const afterStructuralCancel = await hud(page);
  const modeShown = (await text(page)).match(/MODE\n([^\n]+)/)?.[1];
  console.log('PH-MUS-001', JSON.stringify({ before, tempoShown, afterTempo, afterNext, dialogs: [...dialogs], afterStructuralCancel, modeShown }));

  // Part 2: PH-MUS-003
  dialogs.length = 0;
  await openSong();
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.getByLabel('Loop start measure').fill('2');
  await page.getByLabel('Loop end measure').fill('2');
  await page.getByRole('button', { name: 'Set Loop', exact: true }).click(); await page.waitForTimeout(800);
  const loopLabel = (await text(page)).match(/Looping measures [^\n]+/)?.[0];
  await page.getByRole('button', { name: 'Edit Fingering', exact: true }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.waitForTimeout(500);
  const clickNote = async (note) => {
    const rect = await page.locator('.canvas-shell').boundingBox();
    const w = Math.max(rect.width * note.w * 0.92, 12);
    const h = Math.max(note.h * rect.height, 14);
    await page.mouse.click(rect.x + note.x * rect.width + w / 2, rect.y + note.top * rect.height + h / 2);
    await page.waitForTimeout(400);
    const popup = page.locator('.fingering-editor-popup');
    if (!(await popup.count())) return { clicked: note.id, popup: null };
    return { clicked: note.id, popup: (await popup.innerText()).replace(/\n+/g, ' | ') };
  };
  const loopFirst = pos.loop2[0];
  const sel1 = await clickNote(loopFirst);
  if (sel1.popup) {
    await page.locator('.fingering-editor-buttons').getByRole('button', { name: '5', exact: true }).click(); await page.waitForTimeout(600);
  }
  const rows = await rpc(base, 'getCustomFingerings', [songId]);
  if (sel1.popup) { await page.locator('.fingering-editor-popup').getByRole('button', { name: 'Close' }).click(); await page.waitForTimeout(200); }
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Clear Loop', exact: true }).click(); await page.waitForTimeout(800);
  const editOn = await page.getByRole('button', { name: 'Edit Fingering', exact: true }).getAttribute('class');
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.waitForTimeout(500);
  const fullFirst = pos.full.find((n) => n.scheduledIndex === 0);
  const sameNote = pos.full.find((n) => n.id === loopFirst.id);
  const sel2 = await clickNote(fullFirst);
  if (sel2.popup) { await page.locator('.fingering-editor-popup').getByRole('button', { name: 'Close' }).click(); await page.waitForTimeout(200); }
  const sel3 = await clickNote(sameNote);
  console.log('PH-MUS-003', JSON.stringify({ loopLabel, loopFirst: { id: loopFirst.id, label: loopFirst.label, scheduledIndex: loopFirst.scheduledIndex }, sel1, rows, editButtonClass: editOn, fullFirst: { id: fullFirst.id, label: fullFirst.label }, sel2, sameNote: { id: sameNote.id, label: sameNote.label, scheduledIndex: sameNote.scheduledIndex }, sel3, dialogs }));
  console.log('ERRORS', JSON.stringify(errors.filter((e) => !e.includes('"off"') && !e.includes('mainmenu-neonbackground')).slice(0, 10)));
}, { port: 3795, timeout: 10000 });
