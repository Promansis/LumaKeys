// Lane E (RT-008): does the shared HUD nav bar show a visible focus indicator? Captures the whole nav strip
// with and without keyboard focus on one button, on Progress (shared theme) and Settings (own theme). Env: DATA, SHOTS. Port 3793.
import { withServer, text } from './harness.mjs';
await withServer(process.env.DATA, async ({ ctx, base }) => {
  const p = await ctx.newPage(); await p.setViewportSize({ width: 1480, height: 960 });
  await p.goto(base + '/', { waitUntil: 'networkidle' });
  if ((await text(p)).includes('FIRST PRACTICE SETUP')) await p.getByRole('button', { name: 'Skip for now' }).click();
  for (const dest of ['Progress', 'Settings', 'Theory Trainer']) {
    await p.goto(base + '/', { waitUntil: 'networkidle' }); await p.getByRole('button', { name: dest, exact: true }).first().click(); await p.waitForTimeout(1500);
    const nav = p.locator('.immersive-hud-nav').first(); const box = await nav.boundingBox();
    const clip = { x: Math.max(0, box.x - 10), y: Math.max(0, box.y - 10), width: Math.min(1400, box.width + 20), height: box.height + 20 };
    await p.evaluate(() => document.activeElement?.blur()); await p.waitForTimeout(300);
    await p.screenshot({ path: `${process.env.SHOTS}/E-hudnav-${dest.replace(/ /g, '-')}-unfocused.png`, clip });
    for (let i = 0; i < 5; i++) await p.keyboard.press('Tab');
    await p.waitForTimeout(500);
    const info = await p.evaluate(() => { const a = document.activeElement; const s = getComputedStyle(a); return `${a.textContent.trim()} outline=${s.outlineStyle} ${s.outlineWidth} border=${s.borderTopColor} bg=${s.backgroundColor} transform=${s.transform} boxShadow=${s.boxShadow.slice(0, 60)} clipPath=${s.clipPath.slice(0, 30)}`; });
    console.log(dest, 'focused ->', info);
    await p.screenshot({ path: `${process.env.SHOTS}/E-hudnav-${dest.replace(/ /g, '-')}-focused.png`, clip });
  }
}, { port: 3793 });
