// WF-025 (web, no MuseScore): what an .mscz upload does when the server cannot convert it.
// Configurations: (A) LUMAKEYS_MUSESCORE_PATH unset; (B) set to a missing path; (C) and (D) stand-in
// executables /bin/true and /bin/false, only to exercise the converter's failure messages (this is NOT
// MuseScore; real conversion and the busy-converter path need the Docker image, user sitting 0).
// Inputs: a minimal zip renamed .mscz, a non-zip .mscz, an empty .mscz, plus a valid .mid as a control.
// Each is sent through POST /api/midi/upload (status and JSON body recorded) and through the library UI
// (the status line the user sees recorded). After each, the database and midi-files must be unchanged.
//
// Run: DATA=$TMPDIR/p11/FB/data-wf025 FIX=$TMPDIR/p11/FB/fx-wf025 node mscz-upload-no-musescore.mjs   (ports 3785-3788 are used by the lane; this uses PORT_BASE, default 3787)
import { withServer, text } from './harness.mjs';
import { writeLibraryFixtures } from './midi-fixtures.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

delete process.env.LUMAKEYS_MUSESCORE_PATH;
const dataRoot = process.env.DATA;
const fix = process.env.FIX;
const portBase = Number(process.env.PORT_BASE || 3787);
fs.rmSync(dataRoot, { recursive: true, force: true });
fs.mkdirSync(fix, { recursive: true });

// Fixtures
const zipPath = path.join(fix, 'minimal.mscz');
execFileSync('python3', ['-I', '-c', `import zipfile,sys; z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED); z.writestr('score.mscx','<?xml version="1.0"?><museScore version="4.00"><Score/></museScore>'); z.close()`, zipPath]);
const notZip = path.join(fix, 'notzip.mscz'); fs.writeFileSync(notZip, 'this is plain text, not a zip archive\n');
const empty = path.join(fix, 'empty.mscz'); fs.writeFileSync(empty, '');
const mid = writeLibraryFixtures(fix).find((f) => f.title === 'Delta Scale').file;
const wrongExt = path.join(fix, 'score.mscx'); fs.writeFileSync(wrongExt, '<museScore/>');
console.log('fixtures:', JSON.stringify([zipPath, notZip, empty].map((f) => [path.basename(f), fs.statSync(f).size])), 'zip magic', fs.readFileSync(zipPath).subarray(0, 4).toString('hex'));

const configs = [
  ['A unset', {}],
  ['B missing path', { LUMAKEYS_MUSESCORE_PATH: '/nonexistent/mscore4' }],
  ['C stand-in /bin/true', { LUMAKEYS_MUSESCORE_PATH: '/bin/true' }],
  ['D stand-in /bin/false', { LUMAKEYS_MUSESCORE_PATH: '/bin/false' }],
];
const tmpLeft = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith('lumakeys-mscz-'));

for (const [label, env] of configs) {
  const data = path.join(dataRoot, label.split(' ')[0]);
  console.log(`\n===== config ${label} ${JSON.stringify(env)} =====`);
  await withServer(data, async ({ page, base }) => {
    const post = async (files) => {
      const fd = new FormData();
      for (const f of files) fd.append('files', new Blob([fs.readFileSync(f)]), path.basename(f));
      const r = await fetch(base + '/api/midi/upload', { method: 'POST', body: fd });
      return { status: r.status, body: await r.text() };
    };
    const state = () => ({ files: fs.existsSync(path.join(data, 'midi-files')) ? fs.readdirSync(path.join(data, 'midi-files')).length : 0 });
    for (const f of [zipPath, notZip, empty, wrongExt]) {
      const r = await post([f]);
      console.log(`HTTP ${path.basename(f).padEnd(13)} -> ${r.status} ${r.body}`);
    }
    console.log('files after the four failing uploads:', JSON.stringify(state()), 'temp dirs left:', JSON.stringify(tmpLeft()));
    const mixed = await post([mid, zipPath]);
    console.log('HTTP mixed [valid .mid + zip .mscz] ->', mixed.status, mixed.body.slice(0, 400));
    console.log('files after mixed upload (want 1 stored):', JSON.stringify(state()));
    const noFiles = await fetch(base + '/api/midi/upload', { method: 'POST', body: new FormData() });
    console.log('HTTP no files ->', noFiles.status, await noFiles.text());

    // UI path: one file at a time through the real file chooser.
    await page.goto(base + '/', { waitUntil: 'networkidle' });
    if ((await text(page)).includes('FIRST PRACTICE SETUP')) await page.getByRole('button', { name: 'Skip for now' }).click();
    await page.getByRole('button', { name: 'Play Songs', exact: true }).click(); await page.waitForTimeout(800);
    console.log('UI empty/ready line:', JSON.stringify((await page.locator('.library-header .song-title').first().textContent())?.trim()));
    for (const f of [zipPath, notZip, empty]) {
      const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Upload MIDI / MSCZ' }).click()]);
      await fc.setFiles(f); await page.waitForTimeout(1800);
      console.log(`UI ${path.basename(f).padEnd(13)} message: ${JSON.stringify((await page.locator('.library-header .song-title').first().textContent())?.trim())} | metadata editor opened: ${(await page.locator('.metadata-editor').count()) > 0}`);
    }
    await page.screenshot({ path: path.join(data, 'ui-failure.png') });
    console.log('final files:', JSON.stringify(state()), '(1 expected: the valid .mid from the mixed upload)');
    console.log('server log tail:', JSON.stringify(fs.readFileSync(path.join(data, 'server.log'), 'utf8').split('\n').filter(Boolean).slice(-3)));
  }, { port: portBase, timeout: 15000, env });
}
console.log('\ntemp dirs left in os tmpdir at end:', JSON.stringify(tmpLeft()));
