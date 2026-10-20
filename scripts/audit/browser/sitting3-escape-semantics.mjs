// Sitting 3 copy of escape-semantics.mjs (sitting3-harness: own port via PORT, Firefox boot wait). Original header follows.
// Lane E (PH-UI-004 re-verification, new lead): what Escape does on Soundboard, Free Play, and Game after the
// session overlay has been opened and closed, by keyboard and by mouse. Env: DATA, FIX. Port 3793.
import { withServer, text } from './sitting3-harness.mjs';
import fs from 'node:fs';
const j = JSON.stringify;
const st = (p) => p.evaluate(() => ({ screen: (document.querySelector('main')?.className || '').split(' ').filter((c) => /screen|shell/.test(c)).join(' ') || (document.querySelector('.free-play-visualizer-scene') ? 'free-play' : document.querySelector('.falling-notes-canvas, canvas') ? 'canvas-screen' : '?'), dialog: !!document.querySelector('[role="dialog"]'), onMenu: /Back to Main Menu|Training and Setup/.test(document.body.innerText) && !!document.querySelector('.main-menu-screen') }));
const where = async (p) => { const s = await st(p); return s.onMenu ? 'MAIN MENU' : s.dialog ? 'overlay open' : 'session screen, overlay closed'; };
await withServer(process.env.DATA, async ({ ctx, base }) => {
  for (const f of fs.readdirSync(process.env.FIX).filter((x) => x.endsWith('.mid'))) { const fd = new FormData(); fd.append('files', new Blob([fs.readFileSync(process.env.FIX + '/' + f)]), f); await fetch(base + '/api/midi/upload', { method: 'POST', body: fd }); }
  { const p = await ctx.newPage(); await p.goto(base + '/', { waitUntil: 'networkidle' }); if ((await text(p)).includes('FIRST PRACTICE SETUP')) await p.getByRole('button', { name: 'Skip for now' }).click(); await p.waitForTimeout(500); await p.close(); }
  const open = async (name) => {
    const p = await ctx.newPage(); await p.setViewportSize({ width: 1480, height: 960 });
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name, exact: true }).first().click(); await p.waitForTimeout(1200); await p.evaluate(() => document.activeElement?.blur());
    return p;
  };
  for (const name of ['Soundboard', 'Free Play']) {
    // A: keyboard only, 4 presses
    let p = await open(name); const seq = [];
    for (let i = 1; i <= 4; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(500); seq.push(`Esc#${i}: ${await where(p)}`); if ((await where(p)) === 'MAIN MENU') break; }
    console.log(`${name} keyboard only: ${seq.join(' | ')}`); await p.close();
    // B: open overlay by mouse (Menu button), close by mouse (Resume), then Escape
    p = await open(name);
    const menuBtn = p.getByRole('button', { name: /^Menu$/ }).first();
    await menuBtn.evaluate((el) => el.click()); await p.waitForTimeout(500); const w1 = await where(p);
    await p.getByRole('button', { name: 'Resume', exact: true }).evaluate((el) => el.click()); await p.waitForTimeout(500); const w2 = await where(p);
    await p.evaluate(() => document.activeElement?.blur());
    await p.keyboard.press('Escape'); await p.waitForTimeout(600);
    console.log(`${name} mouse open -> ${w1}; Resume click -> ${w2}; then Escape (focus blurred) -> ${await where(p)}`); await p.close();
    // C: fresh screen, Escape once opens overlay, Escape closes, then Escape
  }
  // Game: Escape opens the session overlay; does a later Escape leave the game?
  { const p = await ctx.newPage(); await p.setViewportSize({ width: 1480, height: 960 });
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: 'Play Songs', exact: true }).first().click(); await p.waitForTimeout(900);
    await p.locator('article.song-card').first().getByRole('button', { name: 'Play', exact: true }).click(); await p.waitForTimeout(1500); await p.evaluate(() => document.activeElement?.blur());
    const seq = [];
    for (let i = 1; i <= 4; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(500); const w = await where(p); seq.push(`Esc#${i}: ${w}`); if (w === 'MAIN MENU') break; }
    console.log(`Game keyboard only: ${seq.join(' | ')}`); await p.close(); }
}, { port: 3793, timeout: 12000 });
