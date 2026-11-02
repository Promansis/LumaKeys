import type { AppDatabase } from './database';
import type { MidiStorageAdapter, MidiStorageSnapshot } from '../storage/midiStorage';

export interface ResetOperation {
  commit: () => Promise<void> | void;
  rollback: () => Promise<void> | void;
}

export type ResetRecovery = (operationId: string, state: 'prepared' | 'db-committed') => Promise<void>;

export const LIBRARY_UNCHANGED_DELETE_MESSAGE =
  'Nothing was deleted, and your library is unchanged. Check that the LumaKeys data folder can be written to, then try again.';
export const DELETE_ROLLBACK_PENDING_MESSAGE =
  'Nothing was deleted, and your songs are still in the library, but LumaKeys could not put all of their files back yet. Restart LumaKeys to finish, then try again.';
export const LIBRARY_UNCHANGED_RESTORE_MESSAGE =
  'Nothing was restored, and your library is unchanged. Check that the LumaKeys data folder can be written to, then try the import again.';
export const RESTORE_ROLLBACK_PENDING_MESSAGE =
  'Nothing was restored, but LumaKeys could not put all of your song files back yet. Restart LumaKeys to finish, then try the import again.';

/**
 * A failed delete or restore, worded for the user. The filesystem or database error
 * that caused it stays in `cause` and in the host log, not in the message.
 */
export class LibraryOperationError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = 'LibraryOperationError';
  }
}

export function libraryOperationFailure(message: string, cause: unknown): LibraryOperationError {
  console.error(`${message} Cause:`, cause);
  return new LibraryOperationError(message, cause);
}

// A reset that failed after its database commit leaves the old files in a hidden
// directory and its operation row at `db-committed`. Rolling the database back would
// need a copy of the deleted rows, so a later reset finishes that cleanup first and
// fails, as the first attempt did, until the old files are gone.
async function finishCommittedResets(
  db: AppDatabase,
  midiStorage: MidiStorageAdapter,
  recoverSecondaryReset?: ResetRecovery,
): Promise<void> {
  for (const operation of db.getDurableOperations()) {
    if (operation.type !== 'reset-user-data' || operation.state !== 'db-committed') {
      continue;
    }
    await midiStorage.commitReset?.(operation.id);
    await recoverSecondaryReset?.(operation.id, operation.state);
    db.completeDurableOperation(operation.id);
  }
}

export async function deleteSongsAcrossStores(
  db: AppDatabase,
  midiStorage: MidiStorageAdapter,
  songIds: string[],
  deleteFromDatabase: () => void,
): Promise<void> {
  const ids = [...new Set(songIds)];
  if (midiStorage.stageDelete && midiStorage.commitDelete && midiStorage.rollbackDelete) {
    const operationId = db.prepareDurableOperation('delete-songs', { songIds: ids });
    try {
      await midiStorage.stageDelete(operationId, ids);
      db.commitSongDeletion(operationId, ids);
      await midiStorage.commitDelete(operationId);
      db.completeDurableOperation(operationId);
    } catch (error) {
      if (db.getDurableOperations().some((operation) => operation.id === operationId && operation.state === 'prepared')) {
        try {
          await midiStorage.rollbackDelete(operationId);
        } catch (rollbackError) {
          // The prepared row stays, so startup recovery moves the files back.
          console.error('Rolling back a failed delete failed:', rollbackError);
          throw libraryOperationFailure(DELETE_ROLLBACK_PENDING_MESSAGE, error);
        }
        db.completeDurableOperation(operationId);
        throw libraryOperationFailure(LIBRARY_UNCHANGED_DELETE_MESSAGE, error);
      }
      throw error;
    }
    return;
  }

  const snapshot = midiStorage.snapshot && midiStorage.restoreSnapshot ? await midiStorage.snapshot() : null;
  const files = new Map<string, Uint8Array>();

  for (const songId of ids) {
    try {
      files.set(songId, await midiStorage.read(songId));
    } catch {
      // Missing app-owned MIDI is already a recoverable library state.
    }
  }

  try {
    for (const songId of ids) {
      await midiStorage.delete(songId);
    }
    deleteFromDatabase();
  } catch (error) {
    if (snapshot && midiStorage.restoreSnapshot) {
      await midiStorage.restoreSnapshot(snapshot).catch(() => undefined);
    } else {
      await Promise.allSettled([...files].map(([songId, data]) => midiStorage.write(songId, data)));
    }
    throw error;
  }
}

export async function resetUserDataAcrossStores(
  db: AppDatabase,
  midiStorage: MidiStorageAdapter,
  prepareSecondaryReset?: (operationId: string) => Promise<ResetOperation> | ResetOperation,
  recoverSecondaryReset?: ResetRecovery,
): Promise<void> {
  if (midiStorage.stageReset && midiStorage.commitReset && midiStorage.rollbackReset) {
    await finishCommittedResets(db, midiStorage, recoverSecondaryReset);
    const operationId = db.prepareDurableOperation('reset-user-data', {});
    let secondaryReset: ResetOperation | undefined;
    try {
      secondaryReset = await prepareSecondaryReset?.(operationId);
      await midiStorage.stageReset(operationId);
      db.commitUserDataReset(operationId);
      await midiStorage.commitReset(operationId);
      await secondaryReset?.commit();
      db.completeDurableOperation(operationId);
    } catch (error) {
      const isPrepared = db.getDurableOperations().some((operation) => operation.id === operationId && operation.state === 'prepared');
      if (isPrepared) {
        await secondaryReset?.rollback?.();
        await midiStorage.rollbackReset(operationId).catch(() => undefined);
        db.completeDurableOperation(operationId);
      }
      throw error;
    }
    return;
  }

  const snapshot: MidiStorageSnapshot | null =
    midiStorage.snapshot && midiStorage.restoreSnapshot ? await midiStorage.snapshot() : null;

  let secondaryReset: ResetOperation | undefined;
  try {
    secondaryReset = await prepareSecondaryReset?.('in-process-reset');
    await midiStorage.reset();
    await secondaryReset?.commit();
    db.resetUserData();
  } catch (error) {
    await Promise.allSettled([secondaryReset?.rollback?.() ?? Promise.resolve()]);
    if (snapshot && midiStorage.restoreSnapshot) {
      await midiStorage.restoreSnapshot(snapshot).catch(() => undefined);
    }
    throw error;
  }
}
