// @vitest-environment node

import { chmod, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppDatabase } from './database';
import { LIBRARY_UNCHANGED_DELETE_MESSAGE, deleteSongsAcrossStores, resetUserDataAcrossStores } from './crossStoreMutations';
import { FileSystemMidiStorageAdapter } from '../storage/midiStorage';

const roots: string[] = [];
const songId = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const canLockDirectories = process.getuid?.() !== 0;

async function unlockTree(path: string): Promise<void> {
  await chmod(path, 0o755).catch(() => undefined);
  for (const entry of await readdir(path, { withFileTypes: true }).catch(() => [])) {
    if (entry.isDirectory()) {
      await unlockTree(join(path, entry.name));
    }
  }
}

afterEach(async () => {
  await Promise.all(roots.map((root) => unlockTree(root)));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function addSong(db: AppDatabase): void {
  db.addSong({ id: songId, title: 'Song', artist: '', genre: '', filePath: '', difficulty: 1, durationSec: 1, bpm: 120, noteCount: 1, tags: [], trackAssignments: {} });
}

describe('cross-store mutations', () => {
  it('keeps the database row and MIDI bytes when deletion fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lumakeys-cross-store-delete-'));
    roots.push(root);
    const db = new AppDatabase(join(root, 'db'));
    addSong(db);
    const storage = new FileSystemMidiStorageAdapter(join(root, 'midi'));
    await storage.write(songId, new Uint8Array([1, 2, 3]));
    storage.stageDelete = async () => { throw new Error('delete failed'); };

    const failure = deleteSongsAcrossStores(db, storage, [songId], () => db.deleteSong(songId));
    await expect(failure).rejects.toThrow(LIBRARY_UNCHANGED_DELETE_MESSAGE);
    await expect(failure).rejects.toMatchObject({ cause: expect.objectContaining({ message: 'delete failed' }) });
    expect(db.getSong(songId)).not.toBeNull();
    await expect(storage.read(songId)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    db.close();
  });

  it.runIf(canLockDirectories)('says the library is unchanged, without the OS error, when the song folder is read-only', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lumakeys-cross-store-delete-locked-'));
    roots.push(root);
    const db = new AppDatabase(join(root, 'db'));
    addSong(db);
    const midiDir = join(root, 'midi');
    const storage = new FileSystemMidiStorageAdapter(midiDir);
    await storage.write(songId, new Uint8Array([1, 2, 3]));
    await chmod(midiDir, 0o555);

    const failure = deleteSongsAcrossStores(db, storage, [songId], () => db.deleteSong(songId));
    await expect(failure).rejects.toThrow(/your library is unchanged.*try again/i);
    await expect(failure).rejects.not.toThrow(/EACCES|mkdir|\.delete-/);
    expect(db.getSong(songId)).not.toBeNull();
    expect(db.getDurableOperations()).toEqual([]);

    await chmod(midiDir, 0o755);
    await deleteSongsAcrossStores(db, storage, [songId], () => db.deleteSong(songId));
    expect(db.getSong(songId)).toBeNull();
    db.close();
  });

  it('keeps a prepared delete for startup recovery when its rollback fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lumakeys-cross-store-delete-rollback-'));
    roots.push(root);
    const db = new AppDatabase(join(root, 'db'));
    addSong(db);
    const storage = new FileSystemMidiStorageAdapter(join(root, 'midi'));
    await storage.write(songId, new Uint8Array([1, 2, 3]));
    const stageDelete = storage.stageDelete.bind(storage);
    storage.stageDelete = async (operationId, ids) => {
      await stageDelete(operationId, ids);
      throw new Error('stage failed after moving');
    };
    const rollbackDelete = storage.rollbackDelete.bind(storage);
    storage.rollbackDelete = async () => { throw new Error('rollback failed'); };

    const failure = deleteSongsAcrossStores(db, storage, [songId], () => db.deleteSong(songId));
    await expect(failure).rejects.toThrow(/restart LumaKeys/i);
    expect(db.getSong(songId)).not.toBeNull();
    expect(db.getDurableOperations()).toMatchObject([{ type: 'delete-songs', state: 'prepared' }]);

    storage.rollbackDelete = rollbackDelete;
    await db.recoverDurableOperations(storage);
    await expect(storage.read(songId)).resolves.toEqual(new Uint8Array([1, 2, 3]));
    expect(db.getDurableOperations()).toEqual([]);
    db.close();
  });

  it('restores MIDI data when reset fails before database commit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lumakeys-cross-store-reset-'));
    roots.push(root);
    const db = new AppDatabase(join(root, 'db'));
    addSong(db);
    const storage = new FileSystemMidiStorageAdapter(join(root, 'midi'));
    await storage.write(songId, new Uint8Array([4, 5, 6]));
    storage.stageReset = async () => { throw new Error('reset failed'); };

    await expect(resetUserDataAcrossStores(db, storage)).rejects.toThrow('reset failed');
    expect(db.getSong(songId)).not.toBeNull();
    db.close();
  });

  it.runIf(canLockDirectories)('keeps failing a reset retry until the hidden reset directory is gone', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lumakeys-cross-store-reset-retry-'));
    roots.push(root);
    const db = new AppDatabase(join(root, 'db'));
    addSong(db);
    const midiDir = join(root, 'midi-files');
    const storage = new FileSystemMidiStorageAdapter(midiDir);
    await storage.write(songId, new Uint8Array([4, 5, 6]));
    await chmod(midiDir, 0o555);

    await expect(resetUserDataAcrossStores(db, storage)).rejects.toThrow();
    const hidden = (await readdir(root)).filter((name) => name.startsWith('.midi-files-reset-'));
    expect(hidden).toHaveLength(1);
    expect(db.getDurableOperations()).toMatchObject([{ type: 'reset-user-data', state: 'db-committed' }]);

    await expect(resetUserDataAcrossStores(db, storage)).rejects.toThrow();
    await expect(resetUserDataAcrossStores(db, storage)).rejects.toThrow();
    expect((await readdir(root)).filter((name) => name.startsWith('.midi-files-reset-'))).toEqual(hidden);

    await unlockTree(root);
    await resetUserDataAcrossStores(db, storage);
    expect((await readdir(root)).filter((name) => name.startsWith('.midi-files-reset-'))).toEqual([]);
    expect(db.getDurableOperations()).toEqual([]);
    db.close();
  });

  it('finishes a leftover secondary reset before reporting a reset retry as done', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lumakeys-cross-store-reset-secondary-'));
    roots.push(root);
    const db = new AppDatabase(join(root, 'db'));
    const storage = new FileSystemMidiStorageAdapter(join(root, 'midi-files'));
    let packLeftover = true;
    const recoverSecondary = async (_operationId: string, state: 'prepared' | 'db-committed') => {
      if (state === 'db-committed' && packLeftover) {
        throw new Error('pack dir locked');
      }
    };
    const prepareSecondary = () => ({
      commit: () => { if (packLeftover) throw new Error('pack dir locked'); },
      rollback: () => undefined,
    });

    await expect(resetUserDataAcrossStores(db, storage, prepareSecondary, recoverSecondary)).rejects.toThrow();
    await expect(resetUserDataAcrossStores(db, storage, prepareSecondary, recoverSecondary)).rejects.toThrow();
    expect(db.getDurableOperations()).toHaveLength(1);

    packLeftover = false;
    await resetUserDataAcrossStores(db, storage, prepareSecondary, recoverSecondary);
    expect(db.getDurableOperations()).toEqual([]);
    db.close();
  });

  it.runIf(canLockDirectories)('lets startup recovery continue past a locked reset leftover and keeps it for the next start', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lumakeys-cross-store-reset-startup-'));
    roots.push(root);
    const dbPath = join(root, 'db');
    const db = new AppDatabase(dbPath);
    addSong(db);
    const midiDir = join(root, 'midi-files');
    const storage = new FileSystemMidiStorageAdapter(midiDir);
    await storage.write(songId, new Uint8Array([4, 5, 6]));
    await chmod(midiDir, 0o555);
    await expect(resetUserDataAcrossStores(db, storage)).rejects.toThrow();
    db.prepareDurableOperation('delete-songs', { songIds: [] });
    db.close();

    const reopened = new AppDatabase(dbPath);
    const failures = await reopened.recoverDurableOperations(storage);
    expect(failures).toMatchObject([{ operation: { type: 'reset-user-data', state: 'db-committed' } }]);
    expect(reopened.getDurableOperations()).toMatchObject([{ type: 'reset-user-data', state: 'db-committed' }]);

    await unlockTree(root);
    await expect(reopened.recoverDurableOperations(storage)).resolves.toEqual([]);
    expect(reopened.getDurableOperations()).toEqual([]);
    expect((await readdir(root)).filter((name) => name.startsWith('.midi-files-reset-'))).toEqual([]);
    reopened.close();
  });

  it('recovers a prepared delete after reopening the database', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lumakeys-cross-store-recovery-'));
    roots.push(root);
    const dbPath = join(root, 'db');
    const storage = new FileSystemMidiStorageAdapter(join(root, 'midi'));
    const db = new AppDatabase(dbPath);
    addSong(db);
    await storage.write(songId, new Uint8Array([7, 8, 9]));
    const operationId = db.prepareDurableOperation('delete-songs', { songIds: [songId] });
    await storage.stageDelete(operationId, [songId]);
    db.close();

    const reopenedDb = new AppDatabase(dbPath);
    await reopenedDb.recoverDurableOperations(storage);

    expect(reopenedDb.getSong(songId)).not.toBeNull();
    await expect(storage.read(songId)).resolves.toEqual(new Uint8Array([7, 8, 9]));
    expect(reopenedDb.getDurableOperations()).toEqual([]);
    reopenedDb.close();
  });
});
