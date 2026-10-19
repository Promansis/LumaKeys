import { withServer, text } from './harness.mjs';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/media/storage/LumaKeys/package.json');
const Database = require('better-sqlite3');
const data = process.env.DATA;
const rpc = (base, m, args = []) => fetch(`${base}/api/bridge/${m}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ args }) }).then((r) => r.json()).then((j) => ('result' in j ? j.result : j));
await withServer(data, async (h) => {
  const { page, base } = h;
  const songs = await rpc(base, 'getAllSongs');
  // write-heavy moment: save a result and a setting, then SIGKILL immediately
  await rpc(base, 'saveGameResult', [{ songId: songs[0].id, score: 777, accuracy: 0.5, maxCombo: 3, perfectHits: 1, goodHits: 1, okHits: 1, misses: 1, tempo: 100, mode: 'luma-keys', durationSec: 10, measureAccuracy: [] }]);
  await rpc(base, 'setSetting', ['audio', 'masterVolume', '0.42']);
  h.srv.kill('SIGKILL'); await new Promise((r) => h.srv.once('exit', r));
  console.log('killed; files', JSON.stringify(fs.readdirSync(data).filter((f) => f.startsWith('lumakeys'))));
  await page.goto(base + '/').catch((e) => console.log('WF-023 page while server down:', e.message.split('\n')[0]));
  await h.restart();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  console.log('WF-023 restart: songs', (await rpc(base, 'getAllSongs')).length, 'result rows for song', (await rpc(base, 'getGameResults', [songs[0].id])).length, 'setting', JSON.stringify(await rpc(base, 'getSetting', ['audio', 'masterVolume'])));
  console.log('page loads after restart', (await text(page)).includes('LumaKeys'));
  h.srv.kill('SIGTERM'); await new Promise((r) => h.srv.once('exit', r));
  const db = new Database(data + '/lumakeys.db', { readonly: true });
  console.log('integrity_check', JSON.stringify(db.pragma('integrity_check')), 'pending durable ops', JSON.stringify(db.prepare("select name from sqlite_master where name like '%durable%'").all()));
  db.close();
  console.log('server log', JSON.stringify(fs.readFileSync(data + '/server.log', 'utf8').split('\n').filter(Boolean).slice(-6)));
}, { port: 3779 });
