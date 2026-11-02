import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  getSafeMidiFilename,
  isSafeSongStorageId,
} from '../lib/storage/storageSafety';
import type {
  LibraryBackup,
  LibraryBackupMidiFile,
  LibraryBackupV1,
  LibraryBackupV2,
  LibraryExportResult,
  LibraryImportResult,
  SongRow,
} from '../shared/dbTypes';
import type { MidiStorageAdapter, MidiStorageStagedFile } from '../storage/midiStorage';
import { isLibraryBackup } from '../shared/libraryBackup';
import type { AppDatabase } from './database';
import {
  LIBRARY_UNCHANGED_RESTORE_MESSAGE,
  RESTORE_ROLLBACK_PENDING_MESSAGE,
  libraryOperationFailure,
} from './crossStoreMutations';
import { computeSongMetadata, createSongId } from '../lib/midi/importMetadata';

const MAX_BACKUP_MIDI_BYTES = 10 * 1024 * 1024;

interface BuildLibraryBackupResult {
  backup: LibraryBackupV2;
  exportResult: Omit<LibraryExportResult, 'filename' | 'target' | 'location'>;
}

function getStoredMidiPath(songId: string, midiStorage: MidiStorageAdapter): string {
  return midiStorage.getPathForSong(songId);
}

function assertBackupMidiFileIsSafe(file: LibraryBackupMidiFile): void {
  if (!isSafeSongStorageId(file.songId)) {
    throw new Error(`Unsafe MIDI backup song id: ${file.songId}.`);
  }
  if (file.filename !== `${file.songId}.mid`) {
    throw new Error(`Invalid MIDI backup filename for ${file.songId}.`);
  }
  if (!Number.isSafeInteger(file.byteLength) || file.byteLength < 0) {
    throw new Error(`Invalid MIDI backup byte length for ${file.songId}.`);
  }
  if (file.byteLength > MAX_BACKUP_MIDI_BYTES) {
    throw new Error(`MIDI backup is larger than the ${MAX_BACKUP_MIDI_BYTES} byte limit for ${file.songId}.`);
  }
}

function decodeBase64(value: string, songId: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`Invalid MIDI backup encoding for ${songId}.`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) {
    throw new Error(`Invalid MIDI backup encoding for ${songId}.`);
  }
  return new Uint8Array(bytes);
}

const MAX_MESSAGE_TITLE_LENGTH = 80;

// Names the song the user can recognise; the id alone when the backup has no usable title.
// A backup file can be hand-edited, so the title is not trusted to be a string.
function describeBackupSong(songs: SongRow[], songId: string): string {
  const rawTitle: unknown = songs.find((song) => song.id === songId)?.title;
  const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
  if (!title) {
    return songId;
  }
  const shown = title.length > MAX_MESSAGE_TITLE_LENGTH
    ? `${title.slice(0, MAX_MESSAGE_TITLE_LENGTH - 1)}…`
    : title;
  return `"${shown}" (id ${songId})`;
}

function assertBackupSongIdIsSafe(song: SongRow): void {
  if (!isSafeSongStorageId(song.id)) {
    throw new Error(`Unsafe backup song id: ${song.id}.`);
  }
}

export async function buildLibraryBackup(
  db: AppDatabase,
  midiStorage: MidiStorageAdapter,
): Promise<BuildLibraryBackupResult> {
  const baseBackup = db.exportLibraryData();
  const midiFiles: LibraryBackupMidiFile[] = [];
  const missingMidiFiles: string[] = [];

  for (const song of baseBackup.songs) {
    const filename = getSafeMidiFilename(song.id);
    if (!filename) {
      missingMidiFiles.push(song.title || song.id);
      continue;
    }

    try {
      const bytes = await midiStorage.read(song.id);
      midiFiles.push({
        songId: song.id,
        filename,
        dataBase64: Buffer.from(bytes).toString('base64'),
        byteLength: bytes.byteLength,
      });
    } catch {
      missingMidiFiles.push(song.title || song.id);
    }
  }

  return {
    backup: {
      ...baseBackup,
      version: 2,
      midiFiles,
    },
    exportResult: {
      songsExported: baseBackup.songs.length,
      midiFilesIncluded: midiFiles.length,
      missingMidiFiles,
    },
  };
}

function normalizeImportedBackup(
  backup: LibraryBackup,
  restoredSongIds: Set<string>,
  midiStorage: MidiStorageAdapter,
): LibraryBackupV1 {
  return {
    ...backup,
    version: 1,
    songs: backup.songs.map((song) => ({
      ...song,
      filePath: restoredSongIds.has(song.id) ? getStoredMidiPath(song.id, midiStorage) : '',
    })),
  };
}

export const UNREADABLE_BACKUP_MESSAGE =
  'LumaKeys could not read that backup file, so nothing was restored and your library is unchanged. Check that the file can be opened, then try the import again.';

// Reads the backup the user picked (desktop import). A read or JSON failure says the
// library is unchanged instead of showing the OS error and the file path.
export async function readLibraryBackupFile(path: string): Promise<LibraryBackup> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch (error) {
    throw libraryOperationFailure(UNREADABLE_BACKUP_MESSAGE, error);
  }
  if (!isLibraryBackup(raw)) {
    throw new Error('Invalid library backup file.');
  }
  return raw;
}

// Staging or moving a restored file failed before the database changed. Put the
// library's own files back and report that nothing changed; if even that fails, the
// prepared row stays so startup recovery finishes the rollback.
async function rollBackFailedRestore(
  db: AppDatabase,
  storage: { rollbackRestore: (opId: string) => Promise<void> },
  operationId: string,
  error: unknown,
): Promise<Error> {
  try {
    await storage.rollbackRestore(operationId);
  } catch (rollbackError) {
    console.error('Rolling back a failed library restore failed:', rollbackError);
    return libraryOperationFailure(RESTORE_ROLLBACK_PENDING_MESSAGE, error);
  }
  db.completeDurableOperation(operationId);
  return libraryOperationFailure(LIBRARY_UNCHANGED_RESTORE_MESSAGE, error);
}

export async function importLibraryBackup(
  db: AppDatabase,
  backup: LibraryBackup,
  midiStorage: MidiStorageAdapter,
): Promise<LibraryImportResult> {
  const restoredSongIds = new Set<string>();
  const missingMidiFiles: string[] = [];
  const stagedFiles: MidiStorageStagedFile[] = [];
  const supportsRecoverable = midiStorage.stageRestore && midiStorage.rollbackRestore && midiStorage.commitRestore;
  const recoverableStorage = supportsRecoverable
    ? midiStorage as unknown as { stageRestore: (opId: string, songId: string, data: Uint8Array) => Promise<MidiStorageStagedFile>; rollbackRestore: (opId: string) => Promise<void>; commitRestore: (opId: string) => Promise<void> }
    : null;
  let operationId: string | null = null;
  let result: LibraryImportResult | undefined;

  try {
    if (backup.version === 2) {
      const midiFilesBySongId = new Map<string, Uint8Array>();
      backup.songs.forEach(assertBackupSongIdIsSafe);
      backup.midiFiles.forEach(assertBackupMidiFileIsSafe);

      for (const midiFile of backup.midiFiles) {
        if (midiFilesBySongId.has(midiFile.songId)) {
          throw new Error(`Duplicate MIDI backup song id: ${midiFile.songId}.`);
        }
        const bytes = decodeBase64(midiFile.dataBase64, midiFile.songId);
        if (bytes.byteLength !== midiFile.byteLength || await createSongId(bytes) !== midiFile.songId) {
          throw new Error(
            `MIDI backup content does not match ${describeBackupSong(backup.songs, midiFile.songId)}. `
            + 'Nothing was restored, and your library is unchanged. The backup file may be damaged; '
            + 'export a fresh backup from the original library, then try the import again.',
          );
        }
        try {
          computeSongMetadata(bytes, midiFile.songId);
        } catch (error) {
          // The bytes match their id but the parser refuses them (for example an SMPTE time
          // division, PH-MUS-019). Name the song so the user knows which one blocks the restore.
          const reason = (error instanceof Error ? error.message : String(error)).trim().replace(/\.$/, '')
            || 'the MIDI parser refused it';
          throw new Error(
            `MIDI backup file for ${describeBackupSong(backup.songs, midiFile.songId)} cannot be read: ${reason}. `
            + 'Nothing was restored, and your library is unchanged.',
          );
        }
        midiFilesBySongId.set(midiFile.songId, bytes);
      }

      if (recoverableStorage) {
        const restoreOperationId = db.prepareDurableOperation('restore-library', {});
        operationId = restoreOperationId;
        try {
          for (const song of backup.songs) {
            const bytes = midiFilesBySongId.get(song.id);
            if (!bytes) {
              missingMidiFiles.push(song.title || song.id);
              continue;
            }
            stagedFiles.push(await recoverableStorage.stageRestore(restoreOperationId, song.id, bytes));
            restoredSongIds.add(song.id);
          }

          for (const stagedFile of stagedFiles) {
            await stagedFile.commit();
          }
        } catch (error) {
          throw await rollBackFailedRestore(db, recoverableStorage, restoreOperationId, error);
        }

        try {
          result = db.importLibraryData(normalizeImportedBackup(backup, restoredSongIds, midiStorage), restoreOperationId);
        } catch (error) {
          await recoverableStorage.rollbackRestore(restoreOperationId);
          db.completeDurableOperation(restoreOperationId);
          throw error;
        }

        await recoverableStorage.commitRestore(operationId);
        db.completeDurableOperation(operationId);
      } else {
        for (const song of backup.songs) {
          const bytes = midiFilesBySongId.get(song.id);
          if (!bytes) {
            missingMidiFiles.push(song.title || song.id);
            continue;
          }
          stagedFiles.push(await midiStorage.stage(song.id, bytes));
          restoredSongIds.add(song.id);
        }
      }
    } else {
      missingMidiFiles.push(...backup.songs.map((song) => song.title || basename(song.filePath) || song.id));
    }

    if (!recoverableStorage || backup.version !== 2) {
      try {
        for (const stagedFile of stagedFiles) {
          await stagedFile.commit();
        }
      } catch (error) {
        await Promise.allSettled(stagedFiles.map((stagedFile) => stagedFile.rollback?.()));
        throw error;
      }

      try {
        result = db.importLibraryData(normalizeImportedBackup(backup, restoredSongIds, midiStorage));
      } catch (error) {
        await Promise.allSettled(stagedFiles.map((stagedFile) => stagedFile.rollback?.()));
        throw error;
      }
    }

    return {
      ...result!,
      midiFilesRestored: restoredSongIds.size,
      missingMidiFiles,
    };
  } catch (error) {
    throw error;
  } finally {
    // A recoverable restore's staging folder holds the copies startup recovery needs
    // (`.ready`, `.previous`); commitRestore and rollbackRestore remove it themselves.
    if (!recoverableStorage) {
      await Promise.allSettled(stagedFiles.map((stagedFile) => stagedFile.discard()));
    }
  }
}
