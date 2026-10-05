// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Midi } from '@tonejs/midi';
import { Hono } from 'hono';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from '../persistence/database';
import { createSongId } from '../persistence/importSong';
import { FileSystemMidiStorageAdapter } from '../storage/midiStorage';
import { createMidiRouter } from './midiRouter';
import { MIDI_UPLOAD_BODY_LIMIT_BYTES } from './webSecurity';

const tempDirs: string[] = [];

function makeMidiBytes(): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(100);
  midi.addTrack().addNote({
    midi: 60,
    time: 0,
    duration: 0.5,
    velocity: 0.8,
  });
  return midi.toArray();
}

function toBlob(bytes: Uint8Array): Blob {
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], {
    type: 'audio/midi',
  });
}

async function makeServer() {
  const dir = await mkdtemp(join(tmpdir(), 'lumakeys-midi-router-'));
  tempDirs.push(dir);
  const midiFilesDir = join(dir, 'midi-files');
  await mkdir(midiFilesDir, { recursive: true });
  const db = new AppDatabase(join(dir, 'test.db'));
  const midiStorage = new FileSystemMidiStorageAdapter(midiFilesDir);
  const app = new Hono();
  app.route('/api/midi', createMidiRouter({ db, midiFilesDir, midiStorage }));
  return { app, db, midiFilesDir };
}

describe('midiRouter', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('reports invalid web uploads per file', async () => {
    const { app, db } = await makeServer();
    const formData = new FormData();
    formData.append('files', new File(['not-midi'], 'notes.txt', { type: 'text/plain' }));

    const response = await app.request('/api/midi/upload', { method: 'POST', body: formData });
    const payload = await response.json() as { songs: unknown[]; errors: Array<{ message: string }>; skipped: number };
    db.close();

    expect(response.status).toBe(200);
    expect(payload.songs).toEqual([]);
    expect(payload.skipped).toBe(0);
    expect(payload.errors[0].message).toMatch(/Only \.mid, \.midi, and \.mscz/);
  });

  it('returns 400 when upload contains no files', async () => {
    const { app, db } = await makeServer();
    const formData = new FormData();

    const response = await app.request('/api/midi/upload', { method: 'POST', body: formData });
    const payload = await response.json() as { error: string };
    db.close();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/No files/);
  });

  it('uses the MIDI filename as the song title rather than its instrument label', async () => {
    const { app, db } = await makeServer();
    const midi = new Midi();
    midi.header.name = 'Electric Drum Kit';
    const track = midi.addTrack();
    track.name = 'Electric Drum Kit';
    track.addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });
    const formData = new FormData();
    formData.append('files', new File([toBlob(midi.toArray())], 'Rock-a-bye a Bear.mid', { type: 'audio/midi' }));

    const response = await app.request('/api/midi/upload', { method: 'POST', body: formData });
    const result = await response.json();
    db.close();

    expect(response.status).toBe(200);
    expect(result.errors).toEqual([]);
    expect(result.songs).toEqual([expect.objectContaining({ title: 'Rock-a-bye a Bear' })]);
  });

  it('returns 413 for oversized MIDI upload requests', async () => {
    const { app, db } = await makeServer();

    const response = await app.request('/api/midi/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(MIDI_UPLOAD_BODY_LIMIT_BYTES + 1),
      },
      body: new Uint8Array(MIDI_UPLOAD_BODY_LIMIT_BYTES + 1),
    });
    const payload = await response.json() as { error: string };
    db.close();

    expect(response.status).toBe(413);
    expect(payload.error).toMatch(/MIDI upload/);
  });

  it('reports duplicate uploads as skipped', async () => {
    const { app, db, midiFilesDir } = await makeServer();
    const midiBytes = new Uint8Array([77, 84, 104, 100]);
    const songId = await createSongId(midiBytes);
    const existingMidiPath = join(midiFilesDir, `${songId}.mid`);
    await writeFile(existingMidiPath, midiBytes);
    db.addSong({
      id: songId,
      title: 'Duplicate Song',
      artist: '',
      genre: '',
      filePath: existingMidiPath,
      difficulty: 1,
      durationSec: 1,
      bpm: 120,
      noteCount: 1,
      tags: [],
      trackAssignments: {},
    });

    const formData = new FormData();
    formData.append('files', new File([midiBytes], 'duplicate.mid', { type: 'audio/midi' }));

    const response = await app.request('/api/midi/upload', { method: 'POST', body: formData });
    const payload = await response.json() as { songs: unknown[]; errors: unknown[]; skipped: number };
    db.close();

    expect(payload.songs).toEqual([]);
    expect(payload.errors).toEqual([]);
    expect(payload.skipped).toBe(1);
  });

  it('reattaches a missing hash-id MIDI without creating a duplicate song', async () => {
    const { app, db, midiFilesDir } = await makeServer();
    const midiBytes = makeMidiBytes();
    const songId = await createSongId(midiBytes);
    db.addSong({
      id: songId,
      title: 'Missing MIDI',
      artist: '',
      genre: '',
      filePath: '',
      difficulty: 0,
      durationSec: 0,
      bpm: 0,
      noteCount: 0,
      tags: [],
      trackAssignments: {},
    });

    const formData = new FormData();
    formData.append('files', new File([toBlob(midiBytes)], 'missing.mid', { type: 'audio/midi' }));

    const response = await app.request(`/api/midi/${songId}/reattach`, { method: 'POST', body: formData });
    const payload = await response.json() as { reattached: Array<{ songId: string }>; errors: unknown[]; skipped: number };
    const loadResponse = await app.request(`/api/midi/${songId}`);
    const loadedBytes = new Uint8Array(await loadResponse.arrayBuffer());
    const row = db.getSong(songId);
    db.close();

    expect(response.status).toBe(200);
    expect(payload.reattached).toEqual([expect.objectContaining({ songId })]);
    expect(payload.errors).toEqual([]);
    expect(payload.skipped).toBe(0);
    expect(loadResponse.status).toBe(200);
    expect(loadedBytes).toEqual(midiBytes);
    expect(row?.filePath).toBe(join(midiFilesDir, `${songId}.mid`));
  });

  it('rejects hash-id reattach when the selected MIDI hash differs', async () => {
    const { app, db, midiFilesDir } = await makeServer();
    const originalBytes = makeMidiBytes();
    const songId = await createSongId(originalBytes);
    await writeFile(join(midiFilesDir, `${songId}.mid`), originalBytes);
    db.addSong({
      id: songId,
      title: 'Original MIDI',
      artist: '',
      genre: '',
      filePath: '',
      difficulty: 0,
      durationSec: 0,
      bpm: 0,
      noteCount: 0,
      tags: [],
      trackAssignments: {},
    });

    const otherMidi = new Midi();
    otherMidi.addTrack().addNote({ midi: 67, time: 0, duration: 0.5, velocity: 0.8 });
    const formData = new FormData();
    formData.append('files', new File([toBlob(otherMidi.toArray())], 'other.mid', { type: 'audio/midi' }));

    const response = await app.request(`/api/midi/${songId}/reattach`, { method: 'POST', body: formData });
    const payload = await response.json() as { reattached: unknown[]; errors: Array<{ message: string }>; skipped: number };
    db.close();

    expect(response.status).toBe(200);
    expect(payload.reattached).toEqual([]);
    expect(payload.errors[0].message).toMatch(/does not match/);
  });

  it('reattaches a legacy non-hash song id under app-owned storage', async () => {
    const { app, db, midiFilesDir } = await makeServer();
    const songId = 'legacy-song-1';
    const midiBytes = makeMidiBytes();
    db.addSong({
      id: songId,
      title: 'Legacy Song',
      artist: '',
      genre: '',
      filePath: '',
      difficulty: 0,
      durationSec: 0,
      bpm: 0,
      noteCount: 0,
      tags: [],
      trackAssignments: {},
    });

    const formData = new FormData();
    formData.append('files', new File([toBlob(midiBytes)], 'legacy.mid', { type: 'audio/midi' }));

    const response = await app.request(`/api/midi/${songId}/reattach`, { method: 'POST', body: formData });
    const payload = await response.json() as { reattached: Array<{ songId: string }>; errors: unknown[] };
    const row = db.getSong(songId);
    db.close();

    expect(response.status).toBe(200);
    expect(payload.reattached).toEqual([expect.objectContaining({ songId })]);
    expect(payload.errors).toEqual([]);
    expect(row?.filePath).toBe(join(midiFilesDir, `${songId}.mid`));
  });
});
