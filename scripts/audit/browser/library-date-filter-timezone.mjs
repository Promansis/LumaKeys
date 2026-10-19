// WF-007 follow-up: does the library "Date Added" filter agree with the calendar date a song was imported?
// SQLite stores songs.date_added as `datetime('now')` (UTC, "YYYY-MM-DD HH:MM:SS", no zone). The renderer
// parses it with `new Date(value)`, which reads a zone-less string as LOCAL time. This driver opens the same
// library in browser contexts whose time zone differs from UTC and compares the filter result with the
// import instant converted to that zone.
//
// Run: DATA=$TMPDIR/p11/FB/data-tz FIX=$TMPDIR/p11/FB/fx-tz PORT=3786 node library-date-filter-timezone.mjs
import { withServer, text } from './harness.mjs';
import { writeLibraryFixtures } from './midi-fixtures.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire('/media/storage/LumaKeys/package.json');
const Database = require('better-sqlite3');

const data = process.env.DATA;
const fix = process.env.FIX;
const port = Number(process.env.PORT || 3786);
fs.rmSync(data, { recursive: true, force: true });
const fixture = writeLibraryFixtures(fix).find((f) => f.title === 'Alpha Waltz');

await withServer(data, async ({ page, base }) => {
  const fd = new FormData();
  fd.append('files', new Blob([fs.readFileSync(fixture.file)]), path.basename(fixture.file));
  const up = await fetch(base + '/api/midi/upload', { method: 'POST', body: fd }).then((r) => r.json());
  console.log('upload', JSON.stringify({ songs: up.songs.length, errors: up.errors }));
  const db = new Database(path.join(data, 'lumakeys.db'), { readonly: true });
  const raw = db.prepare('SELECT date_added FROM songs').get().date_added;
  db.close();
  const instant = new Date(raw.replace(' ', 'T') + 'Z'); // the stored string is UTC
  console.log('raw date_added', JSON.stringify(raw), '-> instant', instant.toISOString(), '(now', new Date().toISOString() + ')');
  const browser = page.context().browser();
  for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Australia/Perth', 'America/Los_Angeles']) {
    const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(instant); // calendar date in that zone
    const ctx = await browser.newContext({ timezoneId: tz, viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage(); p.setDefaultTimeout(8000);
    await p.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(p)).includes('FIRST PRACTICE SETUP')) await p.getByRole('button', { name: 'Skip for now' }).click();
    await p.getByRole('button', { name: 'Play Songs', exact: true }).click();
    await p.waitForSelector('h1:has-text("Your Library")'); await p.waitForTimeout(800);
    await p.getByRole('button', { name: 'Show Filters' }).click();
    const adv = (label) => p.locator('.advanced-filters-grid label').filter({ hasText: label }).locator('input');
    const parsedAs = await p.evaluate((r) => new Date(r).toString(), raw);
    // Filter to exactly the calendar day the song was imported on, in this browser's zone.
    await adv('Date Added From').fill(localDate); await adv('Date Added To').fill(localDate); await p.waitForTimeout(300);
    const sameDay = await p.locator('article.song-card').count();
    // And to the day before and the day after.
    const shift = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
    await adv('Date Added From').fill(shift(localDate, 1)); await adv('Date Added To').fill(shift(localDate, 1)); await p.waitForTimeout(300);
    const nextDay = await p.locator('article.song-card').count();
    await adv('Date Added From').fill(shift(localDate, -1)); await adv('Date Added To').fill(shift(localDate, -1)); await p.waitForTimeout(300);
    const prevDay = await p.locator('article.song-card').count();
    const ok = sameDay === 1 && nextDay === 0 && prevDay === 0;
    console.log(`${ok ? 'PASS' : 'FAIL'} tz=${tz} imported on local date ${localDate}; renderer parses raw as "${parsedAs.slice(0, 33)}"; cards for same day=${sameDay} (want 1), next day=${nextDay} (want 0), previous day=${prevDay} (want 0)`);
    await ctx.close();
  }
}, { port, timeout: 8000 });
