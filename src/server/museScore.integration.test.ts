// @vitest-environment node

import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Hono } from 'hono';
import { expect, it } from 'vitest';
import { parseMidiFile } from '../lib/midi/midiFileParser';
import { AppDatabase } from '../persistence/database';
import type { ImportResult } from '../shared/ipc';
import { FileSystemMidiStorageAdapter } from '../storage/midiStorage';
import { createBridgeRouter } from './bridgeRouter';
import { createMidiRouter } from './midiRouter';

const converterPath = process.env.LUMAKEYS_MUSESCORE_PATH;
const run = promisify(execFile);
const singleNoteScore = `<?xml version="1.0" encoding="UTF-8"?>
<museScore version="4.00">
  <Score>
    <Division>480</Division>
    <Part>
      <Staff id="1"><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>
      <trackName>Piano</trackName>
      <Instrument id="piano">
        <longName>Piano</longName><trackName>Piano</trackName>
        <Channel><program value="0"/></Channel>
      </Instrument>
    </Part>
    <Staff id="1">
      <Measure><voice>
        <TimeSig><sigN>4</sigN><sigD>4</sigD></TimeSig>
        <Chord><durationType>whole</durationType><Note><pitch>60</pitch><tpc>14</tpc></Note></Chord>
      </voice></Measure>
    </Staff>
  </Score>
</museScore>`;

it.skipIf(!converterPath)('imports an uploaded MSCZ into a playable MIDI-backed library song', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lumakeys-mscz-integration-'));
  let db: AppDatabase | undefined;
  try {
    const sourcePath = join(dir, 'source.mscx');
    const scorePath = join(dir, 'source.mscz');
    await writeFile(sourcePath, singleNoteScore);
    await run(converterPath!, ['-o', scorePath, sourcePath], {
      timeout: 45000,
      killSignal: 'SIGKILL',
      env: {
        ...process.env,
        LANG: 'C.UTF-8',
        HOME: dir,
        XDG_RUNTIME_DIR: dir,
        QT_QPA_PLATFORM: 'offscreen',
        MU_QT_QPA_PLATFORM: 'offscreen',
      },
    });

    const midiFilesDir = join(dir, 'midi-files');
    await mkdir(midiFilesDir);
    db = new AppDatabase(join(dir, 'library.db'));
    const midiStorage = new FileSystemMidiStorageAdapter(midiFilesDir);
    const app = new Hono();
    app.route('/api/midi', createMidiRouter({ db, midiFilesDir, midiStorage }));
    app.route('/api/bridge', createBridgeRouter({ db, midiFilesDir, midiStorage }));
    const getLibrary = async () => {
      const response = await app.request('/api/bridge/getAllSongs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] }),
      });
      expect(response.status).toBe(200);
      return response.json();
    };
    const damaged = new FormData();
    damaged.append('files', new File(['not a MuseScore archive'], 'Damaged.mscz'));
    const failed = await app.request('/api/midi/upload', { method: 'POST', body: damaged });
    const failure = await failed.json() as ImportResult;
    expect(failure.songs).toEqual([]);
    expect(failure.errors).toEqual([{
      filename: 'Damaged',
      message: expect.stringContaining('Unable to convert this MuseScore score'),
    }]);
    expect(await getLibrary()).toEqual({ result: [] });

    const score = await readFile(scorePath);
    const upload = async () => {
      const body = new FormData();
      body.append('files', new File([score], 'Native Score.MSCZ', { type: 'application/octet-stream' }));
      return app.request('/api/midi/upload', { method: 'POST', body });
    };

    const response = await upload();
    const result = await response.json() as ImportResult;
    expect(response.status).toBe(200);
    expect(result.errors).toEqual([]);
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0].title).toBe('Native Score');
    expect(result.songs[0].noteCount).toBe(1);
    expect(await getLibrary()).toEqual({
      result: [expect.objectContaining({ id: result.songs[0].songId, title: 'Native Score', noteCount: 1 })],
    });

    const loaded = await app.request(`/api/midi/${result.songs[0].songId}`);
    expect(loaded.status).toBe(200);
    const parsed = parseMidiFile(await loaded.arrayBuffer(), { songId: result.songs[0].songId, title: 'Native Score' });
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0]).toMatchObject({ midi: 60 });
    expect(parsed.notes[0].durationSec).toBeGreaterThan(0);

    const duplicate = await upload();
    expect(await duplicate.json()).toMatchObject({ songs: [], errors: [], skipped: 1 });
    const remainingScratchDirs = (await readdir(tmpdir()))
      .filter((name) => name.startsWith('lumakeys-mscz-') && join(tmpdir(), name) !== dir);
    expect(remainingScratchDirs).toEqual([]);
  } finally {
    db?.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 150000);
