// Desktop half of lane C's practice proofs (A1: WF-008, WF-009, PH-MUS-001, PH-MUS-003).
// Part 1 (PH-MUS-001): in Learning mode judge four notes, change tempo from the session
//   overlay and check score and combo survive; a structural control must ask before it
//   restarts, and Cancel keeps the run. The run is then finished at the new tempo and the
//   saved result, measure history included, is read back.
// Part 2 (PH-MUS-003): in a one-bar loop (measure 2) set a custom finger on the loop's first
//   note through the UI, then clear the loop and check the override sits on that song note
//   (IPC, not the HTTP bridge), not on the full song's first note.
// window.confirm is replaced in the page: it records the message and answers Cancel. The
// native confirm box itself belongs to the owner's sitting 1.
// Env: PROFILE (empty, under $TMPDIR), LK_SQLITE_MODULE, POS (note-positions.json written by
//   `node --import tsx scripts/audit/note-positions.ts scripts/audit/fixtures/midi/pmus-16.mid`).
// Run from $TMPDIR/pw.
import { withElectron, text, REPO } from './electron-harness.mjs';
import fs from 'node:fs';
import path from 'node:path';
const profile = process.env.PROFILE;
const pos = JSON.parse(fs.readFileSync(process.env.POS, 'utf8'));
const FIXTURE = path.join(REPO, 'scripts/audit/fixtures/midi/pmus-16.mid');
const bridge = (page, m, args = []) => page.evaluate(([m, a]) => window.appBridge[m](...a).then((r) => r, (e) => ({ error: String(e) })), [m, args]);
const hud = async (page) => (await text(page)).match(/SCORE\n([\d,]+)\nCOMBO\n([^\n]+)/)?.slice(1).join(' | ') ?? 'n/a';
const fakeConfirm = (page) => page.evaluate(() => {
  window.__dialogs = [];
  window.confirm = (m) => { window.__dialogs.push(String(m)); return false; };
});
const dialogs = (page) => page.evaluate(() => window.__dialogs ?? []);

await withElectron(profile, async (h) => {
  const { page } = h;
  await page.waitForTimeout(2500);
  if (/FIRST PRACTICE SETUP/i.test(await text(page))) await page.getByRole('button', { name: 'Skip for now' }).click();
  await bridge(page, 'setSetting', ['gameplay', 'leadInBeats', '0']);
  await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(800);
  await h.stubOpen([FIXTURE]);
  await page.getByRole('button', { name: 'Upload MIDI', exact: true }).click(); await page.waitForTimeout(2000);
  const songId = (await bridge(page, 'getAllSongs')).find((s) => s.title === 'pmus-16')?.id;
  console.log('import', songId);
  const openSong = async () => {
    if (!/Your Library/i.test(await text(page))) {
      if (!(await page.locator('#game-overlay-title').count()) && !/FINAL SCORE/.test(await text(page))) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
      await page.getByRole('button', { name: /^(Main Menu|Back to Library)$/ }).filter({ visible: true }).first().click(); await page.waitForTimeout(800);
      await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(800);
    }
    const card = page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: /^pmus-16$/ }) });
    await card.getByRole('button', { name: 'Learn', exact: true }).click(); await page.waitForTimeout(1200);
    await fakeConfirm(page);
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
  console.log('PH-MUS-001', JSON.stringify({ before, tempoShown, afterTempo, afterNext, dialogs: await dialogs(page), afterStructuralCancel, modeShown }));
  // Part 1b: finish the same run at 75 % and read the saved result. Each key is pressed until
  // the score moves, since Learning waits on every note.
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.waitForTimeout(200);
  await page.evaluate(() => document.activeElement?.blur());
  const rest = ['Period', 'Slash', 'KeyQ', 'Comma', 'Period', 'Slash', 'KeyQ', 'Comma', 'Period', 'Slash', 'KeyQ'];
  const restLog = [];
  for (const key of rest) {
    const s = await hud(page); let hit = false;
    for (let i = 0; i < 40 && !hit; i++) {
      await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); await page.waitForTimeout(140);
      hit = (await hud(page)) !== s || /FINAL SCORE/.test(await text(page));
    }
    restLog.push(`${key}:${hit ? 'hit' : 'no-score'}`);
  }
  for (let i = 0; i < 20 && !/FINAL SCORE/.test(await text(page)); i++) await page.waitForTimeout(500);
  const shown = await text(page);
  const num = (re) => Number(shown.match(re)?.[1]?.replace(/,/g, '') ?? NaN);
  const resultsShown = { final: num(/FINAL SCORE\n([\d,]+)/), perfect: num(/PERFECT\n(\d+)/), good: num(/GOOD\n(\d+)/), ok: num(/OK\n(\d+)/), miss: num(/MISS\n(\d+)/) };
  const saved = (await bridge(page, 'getGameResults', [songId])).map((r) => ({ mode: r.mode, score: r.score, perfect: r.perfectHits, good: r.goodHits, ok: r.okHits, miss: r.misses, tempo: r.tempo, maxCombo: r.maxCombo }));
  const measures = (await bridge(page, 'getMeasureAccuracyHistory', [songId])).length;
  console.log('PH-MUS-001 completion', JSON.stringify({ restLog, resultsShown, saved, measureHistoryRows: measures }));

  // Part 2: PH-MUS-003
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
    const hgt = Math.max(note.h * rect.height, 14);
    await page.mouse.click(rect.x + note.x * rect.width + w / 2, rect.y + note.top * rect.height + hgt / 2);
    await page.waitForTimeout(400);
    const popup = page.locator('.fingering-editor-popup');
    if (!(await popup.count())) return { clicked: note.id, popup: null };
    return { clicked: note.id, popup: (await popup.innerText()).replace(/\n+/g, ' | ') };
  };
  const closePopup = (sel) => (sel.popup ? page.locator('.fingering-editor-popup').getByRole('button', { name: 'Close' }).click().then(() => page.waitForTimeout(200)) : null);
  const loopFirst = pos.loop2[0];
  const sel1 = await clickNote(loopFirst);
  if (sel1.popup) { await page.locator('.fingering-editor-buttons').getByRole('button', { name: '5', exact: true }).click(); await page.waitForTimeout(600); }
  const rows = await bridge(page, 'getCustomFingerings', [songId]);
  await closePopup(sel1);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Clear Loop', exact: true }).click(); await page.waitForTimeout(800);
  const editOn = await page.getByRole('button', { name: 'Edit Fingering', exact: true }).getAttribute('class');
  await page.getByRole('button', { name: 'Resume', exact: true }).click(); await page.waitForTimeout(500);
  const fullFirst = pos.full.find((n) => n.scheduledIndex === 0);
  const sameNote = pos.full.find((n) => n.id === loopFirst.id);
  const sel2 = await clickNote(fullFirst);
  await closePopup(sel2);
  const sel3 = await clickNote(sameNote);
  await page.screenshot({ path: path.join(profile, 'practice-proofs.png') });
  console.log('PH-MUS-003', JSON.stringify({ loopLabel, loopFirst: { id: loopFirst.id, label: loopFirst.label, scheduledIndex: loopFirst.scheduledIndex }, sel1, rows, editButtonClass: editOn, fullFirst: { id: fullFirst.id, label: fullFirst.label }, sel2, sameNote: { id: sameNote.id, label: sameNote.label, scheduledIndex: sameNote.scheduledIndex }, sel3, dialogs: await dialogs(page) }));
  console.log('ERRORS', JSON.stringify(h.errors.filter((e) => !/Insecure Content-Security-Policy/.test(e)).slice(0, 10)));
});
console.log('DONE');
