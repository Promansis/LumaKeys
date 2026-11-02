// @vitest-environment node

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Midi } from '@tonejs/midi';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDatabase } from './database';
import { createSongId, importSongFromBuffer, reattachSongFromBuffer } from './importSong';
import type { MidiStorageAdapter, MidiStorageStagedFile } from '../storage/midiStorage';

const tempDirs: string[] = [];

async function makeDb(): Promise<AppDatabase> {
  const dir = await mkdtemp(join(tmpdir(), 'lumakeys-import-song-'));
  tempDirs.push(dir);
  return new AppDatabase(join(dir, 'test.db'));
}

function makeMidiBytes(note = 60): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(100);
  midi.addTrack().addNote({
    midi: note,
    time: 0,
    duration: 0.5,
    velocity: 0.8,
  });
  return midi.toArray();
}

function addSong(db: AppDatabase, id: string, filePath: string): void {
  db.addSong({
    id,
    title: 'Existing Song',
    artist: 'Existing Artist',
    genre: 'Classical',
    filePath,
    difficulty: 4,
    durationSec: 40,
    bpm: 90,
    noteCount: 9,
    tags: ['existing'],
    trackAssignments: { existing: 'right' },
  });
}

class FakeMidiStorageAdapter implements MidiStorageAdapter {
  readonly events: string[] = [];
  readonly finalFiles = new Map<string, Uint8Array>();
  readonly stagedFiles: MidiStorageStagedFile[] = [];
  failCommit = false;

  getPathForSong(songId: string): string {
    return `/app-midi/${songId}.mid`;
  }

  async read(songId: string): Promise<Uint8Array> {
    const bytes = this.finalFiles.get(songId);
    if (!bytes) {
      throw new Error(`Missing MIDI: ${songId}`);
    }
    return bytes;
  }

  async write(songId: string, data: Uint8Array): Promise<string> {
    this.finalFiles.set(songId, Uint8Array.from(data));
    this.events.push(`write:${songId}`);
    return this.getPathForSong(songId);
  }

  async delete(songId: string): Promise<void> {
    this.finalFiles.delete(songId);
    this.events.push(`delete:${songId}`);
  }

  async stage(songId: string, data: Uint8Array): Promise<MidiStorageStagedFile> {
    const finalPath = this.getPathForSong(songId);
    const stagedBytes = Uint8Array.from(data);
    this.events.push(`stage:${songId}`);

    const stagedFile: MidiStorageStagedFile = {
      finalPath,
      commit: async () => {
        this.events.push(`commit:${songId}`);
        if (this.failCommit) {
          throw new Error('Commit failed');
        }
        this.finalFiles.set(songId, stagedBytes);
      },
      discard: async () => {
        this.events.push(`discard:${songId}`);
      },
    };
    this.stagedFiles.push(stagedFile);
    return stagedFile;
  }

  async reset(): Promise<void> {
    this.finalFiles.clear();
  }
}

describe('importSongFromBuffer', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('stages bytes, adds the DB row with the final path, then commits the staged file', async () => {
    const db = await makeDb();
    const midiStorage = new FakeMidiStorageAdapter();
    const bytes = makeMidiBytes();
    const songId = await createSongId(bytes);
    const originalAddSong = db.addSong.bind(db);
    vi.spyOn(db, 'addSong').mockImplementation((payload) => {
      midiStorage.events.push(`db:add:${payload.id}:${payload.filePath}`);
      return originalAddSong(payload);
    });

    const result = await importSongFromBuffer(bytes, 'New Song', { db, midiStorage });
    const row = db.getSong(songId);
    db.close();

    expect(result.destPath).toBe(`/app-midi/${songId}.mid`);
    expect(row?.filePath).toBe(`/app-midi/${songId}.mid`);
    expect(midiStorage.finalFiles.get(songId)).toEqual(bytes);
    expect(midiStorage.events).toEqual([
      `stage:${songId}`,
      `db:add:${songId}:/app-midi/${songId}.mid`,
      `commit:${songId}`,
      `discard:${songId}`,
    ]);
  });

  it('rejects an SMPTE time-division file and leaves no row or final file (PH-MUS-019)', async () => {
    const db = await makeDb();
    const midiStorage = new FakeMidiStorageAdapter();
    // Format 0, one track, division 0xE728 (-25 fps x 40 ticks), one note.
    const track = [0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x00, 0x90, 0x3c, 0x64, 0x28, 0x80, 0x3c, 0x00, 0x00, 0xff, 0x2f, 0x00];
    const bytes = new Uint8Array([
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0xe7, 0x28,
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length, ...track,
    ]);
    const songId = await createSongId(bytes);

    await expect(importSongFromBuffer(bytes, 'Smpte', { db, midiStorage })).rejects.toThrow(/SMPTE/i);
    const row = db.getSong(songId);
    db.close();

    expect(row).toBeNull();
    expect(midiStorage.finalFiles.size).toBe(0);
    expect(midiStorage.events).toContain(`discard:${songId}`);
  });

  it('discards staging and leaves no final MIDI file when DB add fails', async () => {
    const db = await makeDb();
    const midiStorage = new FakeMidiStorageAdapter();
    const bytes = makeMidiBytes();
    const songId = await createSongId(bytes);
    vi.spyOn(db, 'addSong').mockImplementation(() => {
      throw new Error('DB add failed');
    });

    await expect(importSongFromBuffer(bytes, 'New Song', { db, midiStorage })).rejects.toThrow(/DB add failed/);
    const row = db.getSong(songId);
    db.close();

    expect(row).toBeNull();
    expect(midiStorage.finalFiles.has(songId)).toBe(false);
    expect(midiStorage.events).toEqual([`stage:${songId}`, `discard:${songId}`]);
  });

  it('rolls back a new DB row when final commit fails', async () => {
    const db = await makeDb();
    const midiStorage = new FakeMidiStorageAdapter();
    midiStorage.failCommit = true;
    const bytes = makeMidiBytes();
    const songId = await createSongId(bytes);

    await expect(importSongFromBuffer(bytes, 'New Song', { db, midiStorage })).rejects.toThrow(/Commit failed/);
    const row = db.getSong(songId);
    db.close();

    expect(row).toBeNull();
    expect(midiStorage.finalFiles.has(songId)).toBe(false);
    expect(midiStorage.events).toEqual([
      `stage:${songId}`,
      `commit:${songId}`,
      `discard:${songId}`,
    ]);
  });

  it('preserves an edited title when the same MIDI is reimported or reattached', async () => {
    const db = await makeDb();
    const midiStorage = new FakeMidiStorageAdapter();
    const midi = new Midi();
    midi.header.name = 'Piano';
    midi.addTrack().addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });
    const bytes = midi.toArray();
    const imported = await importSongFromBuffer(bytes, 'Let it Go', { db, midiStorage });
    db.updateSong(imported.songId, { title: 'Let it Go (easy)' });

    try {
      const reimported = await importSongFromBuffer(bytes, 'Different filename', { db, midiStorage });
      expect(reimported.title).toBe('Let it Go (easy)');
      const reattached = await reattachSongFromBuffer(imported.songId, bytes, 'Different filename', { db, midiStorage });
      expect(reattached.title).toBe('Let it Go (easy)');
      expect(db.getSong(imported.songId)?.title).toBe('Let it Go (easy)');
    } finally {
      db.close();
    }
  });
});

describe('reattachSongFromBuffer', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('preserves the existing MIDI file and discards staging when DB update fails', async () => {
    const db = await makeDb();
    const midiStorage = new FakeMidiStorageAdapter();
    const bytes = makeMidiBytes();
    const songId = await createSongId(bytes);
    addSong(db, songId, '/app-midi/original.mid');
    midiStorage.finalFiles.set(songId, new Uint8Array([9, 9, 9]));
    vi.spyOn(db, 'updateSong').mockImplementation(() => {
      throw new Error('DB update failed');
    });

    await expect(reattachSongFromBuffer(songId, bytes, 'Reattached', { db, midiStorage })).rejects.toThrow(/DB update failed/);
    const row = db.getSong(songId);
    db.close();

    expect(row?.filePath).toBe('/app-midi/original.mid');
    expect(midiStorage.finalFiles.get(songId)).toEqual(new Uint8Array([9, 9, 9]));
    expect(midiStorage.events).toEqual([`stage:${songId}`, `discard:${songId}`]);
  });

  it('rolls back the existing DB row when final commit fails', async () => {
    const db = await makeDb();
    const midiStorage = new FakeMidiStorageAdapter();
    midiStorage.failCommit = true;
    const bytes = makeMidiBytes();
    const songId = await createSongId(bytes);
    addSong(db, songId, '/app-midi/original.mid');
    midiStorage.finalFiles.set(songId, new Uint8Array([9, 9, 9]));

    await expect(reattachSongFromBuffer(songId, bytes, 'Reattached', { db, midiStorage })).rejects.toThrow(/Commit failed/);
    const row = db.getSong(songId);
    db.close();

    expect(row).toMatchObject({
      title: 'Existing Song',
      artist: 'Existing Artist',
      genre: 'Classical',
      filePath: '/app-midi/original.mid',
      difficulty: 4,
      durationSec: 40,
      bpm: 90,
      noteCount: 9,
      tags: ['existing'],
      trackAssignments: { existing: 'right' },
    });
    expect(midiStorage.finalFiles.get(songId)).toEqual(new Uint8Array([9, 9, 9]));
    expect(midiStorage.events).toEqual([
      `stage:${songId}`,
      `commit:${songId}`,
      `discard:${songId}`,
    ]);
  });

  it('does not stage mismatched MIDI bytes for a hash-id reattach', async () => {
    const db = await makeDb();
    const midiStorage = new FakeMidiStorageAdapter();
    const existingBytes = makeMidiBytes(60);
    const otherBytes = makeMidiBytes(67);
    const songId = await createSongId(existingBytes);
    addSong(db, songId, '');

    await expect(reattachSongFromBuffer(songId, otherBytes, 'Wrong Song', { db, midiStorage })).rejects.toThrow(/does not match/);
    db.close();

    expect(midiStorage.events).toEqual([]);
  });
});
