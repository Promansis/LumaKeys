import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './database';
import { buildLibraryBackup, importLibraryBackup, readLibraryBackupFile } from './libraryBackup';
import { FileSystemMidiStorageAdapter } from '../storage/midiStorage';
import type { LibraryBackupV1, LibraryBackupV2 } from '../shared/dbTypes';
import { isLibraryBackup } from '../shared/libraryBackup';
import { createSongId } from '../lib/midi/importMetadata';
import { deleteSongsAcrossStores, resetUserDataAcrossStores } from './crossStoreMutations';
import { importSongFromBuffer } from './importSong';
import { Midi } from '@tonejs/midi';

const tempDirs: string[] = [];
const songId = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const otherSongId = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'lumakeys-library-backup-'));
  tempDirs.push(dir);
  return dir;
}

function addSong(db: AppDatabase, id: string, filePath: string): void {
  db.addSong({
    id,
    title: `Song ${id}`,
    artist: 'Composer',
    genre: 'Classical',
    filePath,
    difficulty: 3,
    durationSec: 12,
    bpm: 120,
    noteCount: 4,
    tags: ['warmup'],
    trackAssignments: {},
  });
}

const canLockDirectories = process.getuid?.() !== 0;

async function unlockTree(path: string): Promise<void> {
  await chmod(path, 0o755).catch(() => undefined);
  for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory()) {
      await unlockTree(join(path, entry.name));
    }
  }
}

async function buildTwoSongBackup(): Promise<{ backup: LibraryBackupV2; songIds: string[] }> {
  const sourceDir = await makeTempDir();
  const sourceMidiDir = join(sourceDir, 'midi-files');
  await mkdir(sourceMidiDir, { recursive: true });
  const sourceDb = new AppDatabase(join(sourceDir, 'source.db'));
  const songIds: string[] = [];
  for (const pitch of [60, 62]) {
    const midi = new Midi();
    midi.addTrack().addNote({ midi: pitch, time: 0, duration: 0.5, velocity: 0.8 });
    const bytes = midi.toArray();
    const id = await createSongId(bytes);
    const path = join(sourceMidiDir, `${id}.mid`);
    await writeFile(path, bytes);
    addSong(sourceDb, id, path);
    songIds.push(id);
  }
  const { backup } = await buildLibraryBackup(sourceDb, new FileSystemMidiStorageAdapter(sourceMidiDir));
  sourceDb.close();
  return { backup, songIds: backup.songs.map((song) => song.id) };
}

describe('library backups', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => unlockTree(dir)));
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('exports MIDI bytes in v2 backups and restores playable file paths', async () => {
    const sourceDir = await makeTempDir();
    const sourceMidiDir = join(sourceDir, 'midi-files');
    await mkdir(sourceMidiDir, { recursive: true });
    const sourceDb = new AppDatabase(join(sourceDir, 'source.db'));
    const midi = new Midi();
    midi.addTrack().addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });
    const midiBytes = midi.toArray();
    const contentSongId = await createSongId(midiBytes);
    const midiPath = join(sourceMidiDir, `${contentSongId}.mid`);
    await writeFile(midiPath, midiBytes);
    addSong(sourceDb, contentSongId, midiPath);

    const { backup, exportResult } = await buildLibraryBackup(sourceDb, new FileSystemMidiStorageAdapter(sourceMidiDir));
    sourceDb.close();

    expect(backup.version).toBe(2);
    expect(backup.midiFiles).toHaveLength(1);
    expect(exportResult.midiFilesIncluded).toBe(1);
    expect(exportResult.missingMidiFiles).toEqual([]);

    const targetDir = await makeTempDir();
    const targetMidiDir = join(targetDir, 'midi-files');
    const targetDb = new AppDatabase(join(targetDir, 'target.db'));
    const importResult = await importLibraryBackup(targetDb, backup, new FileSystemMidiStorageAdapter(targetMidiDir));
    const restoredSong = targetDb.getSong(contentSongId);
    targetDb.close();

    expect(importResult.midiFilesRestored).toBe(1);
    expect(restoredSong?.filePath).toBe(join(targetMidiDir, `${contentSongId}.mid`));
    await expect(readFile(join(targetMidiDir, `${contentSongId}.mid`))).resolves.toEqual(Buffer.from(midiBytes));
  });

  it('exports only app-owned MIDI files under the configured storage root', async () => {
    const sourceDir = await makeTempDir();
    const sourceMidiDir = join(sourceDir, 'midi-files');
    const foreignDir = await makeTempDir();
    await mkdir(sourceMidiDir, { recursive: true });
    const sourceDb = new AppDatabase(join(sourceDir, 'source.db'));

    const appOwnedPath = join(sourceMidiDir, `${songId}.mid`);
    const foreignPath = join(foreignDir, `${otherSongId}.mid`);
    await writeFile(appOwnedPath, new Uint8Array([1, 2, 3]));
    await writeFile(foreignPath, new Uint8Array([4, 5, 6]));
    addSong(sourceDb, songId, foreignPath);
    addSong(sourceDb, otherSongId, foreignPath);

    const { backup, exportResult } = await buildLibraryBackup(sourceDb, new FileSystemMidiStorageAdapter(sourceMidiDir));
    sourceDb.close();

    expect(backup.midiFiles.map((file) => file.songId)).toEqual([songId]);
    expect(exportResult.midiFilesIncluded).toBe(1);
    expect(exportResult.missingMidiFiles).toEqual([`Song ${otherSongId}`]);
  });

  it('rejects crafted backup MIDI entries before writing outside storage', async () => {
    const targetDir = await makeTempDir();
    const targetMidiDir = join(targetDir, 'midi-files');
    const targetDb = new AppDatabase(join(targetDir, 'target.db'));
    const backup: LibraryBackupV2 = {
      version: 2,
      exportedAt: new Date().toISOString(),
      songs: [],
      folders: [],
      playlists: [],
      fingerings: [],
      settings: [],
      midiFiles: [{
        songId: '../escape',
        filename: '../escape.mid',
        dataBase64: Buffer.from([1, 2, 3]).toString('base64'),
        byteLength: 3,
      }],
    };

    await expect(importLibraryBackup(targetDb, backup, new FileSystemMidiStorageAdapter(targetMidiDir))).rejects.toThrow(/Unsafe MIDI backup song id/);
    targetDb.close();

    expect(existsSync(join(targetDir, 'escape.mid'))).toBe(false);
  });

  it('stages restored MIDI files until database import succeeds', async () => {
    const targetDir = await makeTempDir();
    const targetMidiDir = join(targetDir, 'midi-files');
    await mkdir(targetMidiDir, { recursive: true });
    const existingPath = join(targetMidiDir, `${songId}.mid`);
    await writeFile(existingPath, new Uint8Array([9, 9, 9]));
    const targetDb = new AppDatabase(join(targetDir, 'target.db'));
    const validMidi = new Midi();
    validMidi.addTrack().addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });
    const validBytes = validMidi.toArray();
    const validSongId = await createSongId(validBytes);
    const backup: LibraryBackupV2 = {
      version: 2,
      exportedAt: new Date().toISOString(),
      songs: [{
        id: validSongId,
        title: 'Bad Playlist Song',
        artist: '',
        genre: '',
        filePath: '/old/path.mid',
        difficulty: 1,
        durationSec: 1,
        bpm: 120,
        noteCount: 1,
        dateAdded: new Date().toISOString(),
        timesPlayed: 0,
        tags: [],
        isFavorite: false,
        folderId: null,
        trackAssignments: {},
      }],
      folders: [],
      playlists: [{
        id: 'bad-playlist',
        name: null as unknown as string,
        description: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        songIds: [songId],
      }],
      fingerings: [],
      settings: [],
      midiFiles: [{
        songId: validSongId,
        filename: `${validSongId}.mid`,
        dataBase64: Buffer.from(validBytes).toString('base64'),
        byteLength: 3,
      }],
    };

    await expect(importLibraryBackup(targetDb, backup, new FileSystemMidiStorageAdapter(targetMidiDir))).rejects.toThrow();
    const remainingEntries = await readdir(targetMidiDir);
    targetDb.close();

    await expect(readFile(existingPath)).resolves.toEqual(Buffer.from([9, 9, 9]));
    expect(remainingEntries).toEqual([`${songId}.mid`]);
  });

  it.runIf(canLockDirectories)('says the library is unchanged and clears its operation when the song folder is read-only', async () => {
    const { backup } = await buildTwoSongBackup();
    const targetDir = await makeTempDir();
    const targetMidiDir = join(targetDir, 'midi-files');
    await mkdir(targetMidiDir, { recursive: true });
    const targetDb = new AppDatabase(join(targetDir, 'target.db'));
    await chmod(targetMidiDir, 0o555);

    const failure = importLibraryBackup(targetDb, backup, new FileSystemMidiStorageAdapter(targetMidiDir));
    await expect(failure).rejects.toThrow(/your library is unchanged.*try the import again/i);
    await expect(failure).rejects.not.toThrow(/EACCES|mkdir|\.restore-/);
    expect(targetDb.getAllSongs()).toEqual([]);
    expect(targetDb.getDurableOperations()).toEqual([]);
    targetDb.close();
  });

  it.runIf(canLockDirectories)('reports a failure on the second file without EISDIR and rolls back the first file', async () => {
    const { backup, songIds } = await buildTwoSongBackup();
    const targetDir = await makeTempDir();
    const targetMidiDir = join(targetDir, 'midi-files');
    const blocker = join(targetMidiDir, `${songIds[1]}.mid`);
    await mkdir(blocker, { recursive: true });
    await writeFile(join(blocker, 'blocker.txt'), 'x');
    await chmod(blocker, 0o555);
    const targetDb = new AppDatabase(join(targetDir, 'target.db'));
    const storage = new FileSystemMidiStorageAdapter(targetMidiDir);

    const failure = importLibraryBackup(targetDb, backup, storage);
    await expect(failure).rejects.toThrow(/your library is unchanged.*try the import again/i);
    await expect(failure).rejects.not.toThrow(/EISDIR|EACCES/);
    await expect(failure).rejects.toMatchObject({ cause: expect.objectContaining({ code: 'EACCES' }) });
    expect(targetDb.getAllSongs()).toEqual([]);
    expect(targetDb.getDurableOperations()).toEqual([]);
    expect(existsSync(join(targetMidiDir, `${songIds[0]}.mid`))).toBe(false);
    expect(existsSync(join(blocker, 'blocker.txt'))).toBe(true);

    await chmod(blocker, 0o755);
    await rm(blocker, { recursive: true, force: true });
    await expect(importLibraryBackup(targetDb, backup, storage)).resolves.toMatchObject({ midiFilesRestored: 2 });
    targetDb.close();
  });

  it.runIf(canLockDirectories)('keeps the staged files so a restart recovers the song when a restore rollback fails', async () => {
    const { backup, songIds } = await buildTwoSongBackup();
    const targetDir = await makeTempDir();
    const targetMidiDir = join(targetDir, 'midi-files');
    await mkdir(targetMidiDir, { recursive: true });
    const firstPath = join(targetMidiDir, `${songIds[0]}.mid`);
    const firstBytes = new Uint8Array(Buffer.from(backup.midiFiles.find((file) => file.songId === songIds[0])!.dataBase64, 'base64'));
    await writeFile(firstPath, firstBytes);
    const blocker = join(targetMidiDir, `${songIds[1]}.mid`);
    await mkdir(blocker, { recursive: true });
    await chmod(blocker, 0o555);
    const dbPath = join(targetDir, 'target.db');
    const targetDb = new AppDatabase(dbPath);
    addSong(targetDb, songIds[0], firstPath);
    const storage = new FileSystemMidiStorageAdapter(targetMidiDir);
    // The rollback removes the restored copy, then fails before putting the original back.
    storage.rollbackRestore = async () => {
      await rm(firstPath, { force: true });
      throw new Error('rollback failed');
    };

    await expect(importLibraryBackup(targetDb, backup, storage)).rejects.toThrow(/restart LumaKeys/i);
    expect(targetDb.getDurableOperations()).toMatchObject([{ type: 'restore-library', state: 'prepared' }]);
    targetDb.close();

    const restartedDb = new AppDatabase(dbPath);
    const restartedStorage = new FileSystemMidiStorageAdapter(targetMidiDir);
    await expect(restartedDb.recoverDurableOperations(restartedStorage)).resolves.toEqual([]);
    expect(restartedDb.getSong(songIds[0])).not.toBeNull();
    await expect(readFile(firstPath)).resolves.toEqual(Buffer.from(firstBytes));
    expect(restartedDb.getDurableOperations()).toEqual([]);
    expect((await readdir(targetMidiDir)).filter((name) => name.startsWith('.restore-'))).toEqual([]);
    restartedDb.close();
  });

  it.runIf(canLockDirectories)('refuses a same-session retry after a failed restore rollback, so the restart cannot remove its files', async () => {
    const { backup, songIds } = await buildTwoSongBackup();
    const targetDir = await makeTempDir();
    const targetMidiDir = join(targetDir, 'midi-files');
    const blocker = join(targetMidiDir, `${songIds[1]}.mid`);
    await mkdir(blocker, { recursive: true });
    await chmod(blocker, 0o555);
    const dbPath = join(targetDir, 'target.db');
    const targetDb = new AppDatabase(dbPath);
    const storage = new FileSystemMidiStorageAdapter(targetMidiDir);
    const rollbackRestore = storage.rollbackRestore.bind(storage);
    storage.rollbackRestore = async () => { throw new Error('rollback failed'); };

    await expect(importLibraryBackup(targetDb, backup, storage)).rejects.toThrow(/restart LumaKeys/i);
    storage.rollbackRestore = rollbackRestore;
    await chmod(blocker, 0o755);
    await rm(blocker, { recursive: true, force: true });

    // Without a restart the retry would succeed, and the next start's rollback of the
    // failed restore would then remove the first song's file under its new row.
    await expect(importLibraryBackup(targetDb, backup, storage)).rejects.toThrow(/restart LumaKeys/i);
    expect(targetDb.getAllSongs()).toEqual([]);
    targetDb.close();

    const restartedDb = new AppDatabase(dbPath);
    const restartedStorage = new FileSystemMidiStorageAdapter(targetMidiDir);
    await expect(restartedDb.recoverDurableOperations(restartedStorage)).resolves.toEqual([]);
    await expect(importLibraryBackup(restartedDb, backup, restartedStorage)).resolves.toMatchObject({ midiFilesRestored: 2 });
    restartedDb.close();

    const nextStartDb = new AppDatabase(dbPath);
    await expect(nextStartDb.recoverDurableOperations(restartedStorage)).resolves.toEqual([]);
    for (const id of songIds) {
      expect(nextStartDb.getSong(id)).not.toBeNull();
      expect(existsSync(join(targetMidiDir, `${id}.mid`))).toBe(true);
    }
    nextStartDb.close();
  });

  it.runIf(canLockDirectories)('refuses deletes, resets and MIDI imports until a restart finishes a failed restore rollback', async () => {
    const { backup, songIds } = await buildTwoSongBackup();
    const targetDir = await makeTempDir();
    const targetMidiDir = join(targetDir, 'midi-files');
    const blocker = join(targetMidiDir, `${songIds[1]}.mid`);
    await mkdir(blocker, { recursive: true });
    await chmod(blocker, 0o555);
    const dbPath = join(targetDir, 'target.db');
    const targetDb = new AppDatabase(dbPath);
    const storage = new FileSystemMidiStorageAdapter(targetMidiDir);
    const rollbackRestore = storage.rollbackRestore.bind(storage);
    storage.rollbackRestore = async () => { throw new Error('rollback failed'); };
    await expect(importLibraryBackup(targetDb, backup, storage)).rejects.toThrow(/restart LumaKeys/i);
    storage.rollbackRestore = rollbackRestore;
    await chmod(blocker, 0o755);
    await rm(blocker, { recursive: true, force: true });
    const midi = new Midi();
    midi.addTrack().addNote({ midi: 67, time: 0, duration: 0.5, velocity: 0.8 });
    const newSong = midi.toArray();

    await expect(importSongFromBuffer(newSong, 'New', { db: targetDb, midiStorage: storage })).rejects.toThrow(/restart LumaKeys/i);
    await expect(deleteSongsAcrossStores(targetDb, storage, [songIds[0]], () => targetDb.deleteSong(songIds[0]))).rejects.toThrow(/restart LumaKeys/i);
    await expect(resetUserDataAcrossStores(targetDb, storage)).rejects.toThrow(/restart LumaKeys/i);
    expect(targetDb.getDurableOperations()).toMatchObject([{ type: 'restore-library', state: 'prepared' }]);
    targetDb.close();

    const restartedDb = new AppDatabase(dbPath);
    await restartedDb.recoverDurableOperations(storage);
    await expect(importSongFromBuffer(newSong, 'New', { db: restartedDb, midiStorage: storage })).resolves.toMatchObject({ title: 'New' });
    restartedDb.close();
  });

  it.runIf(canLockDirectories)('says the library is unchanged, without the OS error, when the backup file cannot be read', async () => {
    const { backup } = await buildTwoSongBackup();
    const dir = await makeTempDir();
    const backupPath = join(dir, 'backup.json');
    await writeFile(backupPath, JSON.stringify(backup));
    await chmod(backupPath, 0o000);

    const failure = readLibraryBackupFile(backupPath);
    await expect(failure).rejects.toThrow(/could not read.*your library is unchanged.*try the import again/i);
    await expect(failure).rejects.not.toThrow(/EACCES|backup\.json/);
    await expect(failure).rejects.toMatchObject({ cause: expect.objectContaining({ code: 'EACCES' }) });

    await chmod(backupPath, 0o644);
    await expect(readLibraryBackupFile(backupPath)).resolves.toMatchObject({ version: 2 });
  });

  it('rejects same-length MIDI bytes whose content id differs', async () => {
    const targetDir = await makeTempDir();
    const targetMidiDir = join(targetDir, 'midi-files');
    const targetDb = new AppDatabase(join(targetDir, 'target.db'));
    const originalMidi = new Midi();
    originalMidi.addTrack().addNote({ midi: 60, time: 0, duration: 0.5, velocity: 0.8 });
    const substitutedMidi = new Midi();
    substitutedMidi.addTrack().addNote({ midi: 67, time: 0, duration: 0.5, velocity: 0.8 });
    const original = originalMidi.toArray();
    const substituted = substitutedMidi.toArray();
    const id = await createSongId(original);
    const backup: LibraryBackupV2 = {
      version: 2,
      exportedAt: new Date().toISOString(),
      songs: [{
        id,
        title: 'Tampered',
        artist: '',
        genre: '',
        filePath: '',
        difficulty: 1,
        durationSec: 1,
        bpm: 120,
        noteCount: 1,
        dateAdded: new Date().toISOString(),
        timesPlayed: 0,
        tags: [],
        isFavorite: false,
        folderId: null,
        trackAssignments: {},
      }],
      folders: [],
      playlists: [],
      fingerings: [],
      settings: [],
      midiFiles: [{
        songId: id,
        filename: `${id}.mid`,
        dataBase64: Buffer.from(substituted).toString('base64'),
        byteLength: substituted.byteLength,
      }],
    };

    await expect(importLibraryBackup(targetDb, backup, new FileSystemMidiStorageAdapter(targetMidiDir))).rejects.toThrow(
      /content does not match/,
    );
    expect(targetDb.getAllSongs()).toEqual([]);
    expect(existsSync(targetMidiDir)).toBe(false);
    targetDb.close();
  });

  it('keeps v1 backup support while reporting missing MIDI files', async () => {
    const targetDir = await makeTempDir();
    const targetDb = new AppDatabase(join(targetDir, 'target.db'));
    const backup: LibraryBackupV1 = {
      version: 1,
      exportedAt: new Date().toISOString(),
      songs: [{
        id: 'legacy-song',
        title: 'Legacy Song',
        artist: '',
        genre: '',
        filePath: '/old/path.mid',
        difficulty: 1,
        durationSec: 1,
        bpm: 120,
        noteCount: 1,
        dateAdded: new Date().toISOString(),
        timesPlayed: 0,
        tags: [],
        isFavorite: false,
        folderId: null,
        trackAssignments: {},
      }],
      folders: [],
      playlists: [],
      fingerings: [],
      settings: [],
    };

    expect(isLibraryBackup(backup)).toBe(true);

    const result = await importLibraryBackup(targetDb, backup, new FileSystemMidiStorageAdapter(join(targetDir, 'midi-files')));
    targetDb.close();

    expect(result.songsImported).toBe(1);
    expect(result.midiFilesRestored).toBe(0);
    expect(result.missingMidiFiles).toEqual(['Legacy Song']);
  });
});
