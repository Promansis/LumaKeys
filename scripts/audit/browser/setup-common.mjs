// Shared helpers for the lane F setup/settings/pack/lesson drivers (WF-002, WF-003, WF-011, WF-018, WF-019).
import fs from 'node:fs';
import { text } from './harness.mjs';

export const rpc = (base, m, args = []) =>
  fetch(`${base}/api/bridge/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) })
    .then((r) => r.json())
    .then((j) => ('result' in j ? j.result : j));

export async function uploadMidi(base, file) {
  const fd = new FormData();
  fd.append('files', new Blob([fs.readFileSync(file)]), file.split('/').pop());
  const r = await fetch(`${base}/api/midi/upload`, { method: 'POST', body: fd });
  return r.json();
}

export const hud = async (page) => (await text(page)).match(/SCORE\n(\d+)\nCOMBO\n([^\n]+)/)?.slice(1).join(' | ') ?? 'n/a';

export async function firstLoad(page, base, { skipGuide = true } = {}) {
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  if (skipGuide) {
    const skip = page.getByRole('button', { name: /Skip for now/i });
    if (await skip.count()) { await skip.click(); await page.waitForTimeout(400); }
  }
}

export async function toMenu(page) {
  const btn = page.getByRole('button', { name: /^(Back to Main Menu|MAIN)$/i }).first();
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(400); }
}

export async function openSettingsTab(page, tab) {
  await page.getByRole('button', { name: /^Settings/ }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.getByRole('tab', { name: new RegExp(tab, 'i') }).click();
  await page.waitForTimeout(300);
}

export async function openKeyboardSetup(page) {
  // Settings > Input > Edit Key Layout
  await page.getByRole('button', { name: /^Settings/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('tab', { name: /input/i }).click();
  await page.getByRole('button', { name: /Edit Key Layout/ }).click();
  await page.waitForTimeout(600);
}

export const litKeys = (page) =>
  page.$$eval('.white-key.active, .black-key.active', (els) => els.map((e) => e.getAttribute('aria-label') || e.className));

// Opens the short-song game in Learn mode and starts playback (Space after count-in). Returns after focus is cleared.
export async function startShortGame(page, mode = 'Learn', title = 'short-4-notes') {
  await page.getByRole('button', { name: 'Play Songs', exact: true }).click();
  await page.waitForTimeout(800);
  const card = page.locator('article.song-card').filter({ has: page.locator('h2.song-card-title', { hasText: new RegExp(`^${title}$`) }) });
  await card.getByRole('button', { name: mode, exact: true }).click();
  await page.waitForTimeout(1000);
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space');
}

// Press `code` repeatedly until the HUD score/combo changes; returns true if it changed.
export async function pressUntilScore(page, code, tries = 40) {
  const start = await hud(page);
  for (let i = 0; i < tries; i++) {
    await page.keyboard.down(code); await page.waitForTimeout(60); await page.keyboard.up(code);
    await page.waitForTimeout(90);
    if ((await hud(page)) !== start) return true;
  }
  return false;
}

// Builds a long song of repeated middle C (one per second for `seconds`), so a driver has time to test several input paths.
import { createRequire } from 'node:module';
export function writeRepeatC4(file, seconds = 150, midiNote = 60) {
  const { Midi } = createRequire('/media/storage/LumaKeys/package.json')('@tonejs/midi');
  const midi = new Midi(); midi.header.setTempo(60); midi.header.name = 'repeat-c4';
  const tr = midi.addTrack(); tr.name = 'right';
  for (let t = 2; t < seconds; t += 1) tr.addNote({ midi: midiNote, time: t, duration: 0.4, velocity: 0.8 });
  fs.writeFileSync(file, Buffer.from(midi.toArray()));
  return file;
}

// Open the game pause overlay (Escape), return text, close it again.
export async function overlayText(page) {
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  const t = await text(page);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  await page.evaluate(() => document.activeElement?.blur());
  return t;
}
