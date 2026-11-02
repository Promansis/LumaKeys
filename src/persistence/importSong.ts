import type { SongRow } from '../shared/dbTypes';
import type { ImportedSong, ImportError, RecomputeDifficultiesResult } from '../shared/ipc';
import { computeSongMetadata, createSongId, calculateDifficulty } from '../lib/midi/importMetadata';
import { isSafeSongStorageId } from '../lib/storage/storageSafety';
import type { MidiStorageAdapter, MidiStorageStagedFile } from '../storage/midiStorage';
import type { AppDatabase } from './database';

interface ImportSongOptions {
  db: AppDatabase;
  midiStorage: MidiStorageAdapter;
  readSongBytes?: (song: SongRow) => Promise<Uint8Array>;
}

export { createSongId, calculateDifficulty };

function restoreSong(db: AppDatabase, song: SongRow): void {
  db.updateSong(song.id, {
    artist: song.artist,
    bpm: song.bpm,
    difficulty: song.difficulty,
    durationSec: song.durationSec,
    filePath: song.filePath,
    genre: song.genre,
    isFavorite: song.isFavorite,
    noteCount: song.noteCount,
    tags: song.tags,
    title: song.title,
    folderId: song.folderId,
    trackAssignments: song.trackAssignments,
  });
}

async function discardStagedFile(stagedFile: MidiStorageStagedFile): Promise<void> {
  await stagedFile.discard().catch(() => undefined);
}

export async function importSongFromBuffer(
  buffer: Uint8Array,
  title: string,
  { db, midiStorage }: ImportSongOptions,
): Promise<ImportedSong> {
  db.assertNoPendingRollback();
  const fileData = Uint8Array.from(buffer);
  const songId = await createSongId(fileData);
  const existingSong = db.getSong(songId);
  const stagedFile = await midiStorage.stage(songId, fileData);
  const destPath = stagedFile.finalPath;

  try {
    const metadata = computeSongMetadata(fileData, title, existingSong?.trackAssignments);

    if (existingSong) {
      const shouldRefreshDescriptiveMetadata =
        existingSong.filePath.trim() === '' && existingSong.noteCount === 0;
      db.updateSong(songId, {
        artist: shouldRefreshDescriptiveMetadata ? metadata.artist : existingSong.artist,
        bpm: metadata.bpm,
        difficulty: metadata.difficulty,
        durationSec: metadata.durationSec,
        filePath: destPath,
        noteCount: metadata.noteCount,
        title: shouldRefreshDescriptiveMetadata ? metadata.title : existingSong.title,
        trackAssignments: metadata.trackAssignments,
      });
    } else {
      db.addSong({
        id: songId,
        title: metadata.title,
        artist: metadata.artist,
        genre: '',
        filePath: destPath,
        difficulty: metadata.difficulty,
        durationSec: metadata.durationSec,
        bpm: metadata.bpm,
        noteCount: metadata.noteCount,
        tags: [],
        trackAssignments: metadata.trackAssignments,
      });
    }

    try {
      await stagedFile.commit();
    } catch (error) {
      try {
        if (existingSong) {
          restoreSong(db, existingSong);
        } else {
          db.deleteSong(songId);
        }
      } catch {
        // Preserve the storage failure that made the DB row unsafe.
      }
      throw error;
    }

    const row = db.getSong(songId)!;

    return {
      songId,
      destPath,
      fileData,
      title: row.title,
      durationSec: row.durationSec,
      bpm: row.bpm,
      noteCount: row.noteCount,
      difficulty: row.difficulty,
    };
  } finally {
    await discardStagedFile(stagedFile);
  }
}

export async function reattachSongFromBuffer(
  songId: string,
  buffer: Uint8Array,
  title: string,
  { db, midiStorage }: ImportSongOptions,
): Promise<ImportedSong> {
  db.assertNoPendingRollback();
  const existingSong = db.getSong(songId);
  if (!existingSong) {
    throw new Error(`Song not found: ${songId}`);
  }

  const fileData = Uint8Array.from(buffer);
  const fileHash = await createSongId(fileData);
  if (isSafeSongStorageId(songId) && fileHash !== songId) {
    throw new Error('Selected MIDI does not match this song.');
  }

  const shouldRefreshDescriptiveMetadata =
    existingSong.filePath.trim() === '' && existingSong.noteCount === 0;
  const stagedFile = await midiStorage.stage(songId, fileData);
  const destPath = stagedFile.finalPath;

  try {
    const metadata = computeSongMetadata(fileData, title, existingSong.trackAssignments);

    db.updateSong(songId, {
      artist: shouldRefreshDescriptiveMetadata ? metadata.artist : existingSong.artist,
      bpm: metadata.bpm,
      difficulty: metadata.difficulty,
      durationSec: metadata.durationSec,
      filePath: destPath,
      noteCount: metadata.noteCount,
      title: shouldRefreshDescriptiveMetadata ? metadata.title : existingSong.title,
      trackAssignments: metadata.trackAssignments,
    });

    try {
      await stagedFile.commit();
    } catch (error) {
      try {
        restoreSong(db, existingSong);
      } catch {
        // Preserve the storage failure that made the DB row unsafe.
      }
      throw error;
    }

    const row = db.getSong(songId)!;
    return {
      songId,
      destPath,
      fileData,
      title: row.title,
      durationSec: row.durationSec,
      bpm: row.bpm,
      noteCount: row.noteCount,
      difficulty: row.difficulty,
    };
  } finally {
    await discardStagedFile(stagedFile);
  }
}

export async function recomputeAllSongDifficulties(
  { db, midiStorage, readSongBytes }: ImportSongOptions,
): Promise<RecomputeDifficultiesResult> {
  const songs = db.getAllSongs();
  const errors: ImportError[] = [];
  let updated = 0;

  for (const song of songs) {
    try {
      const buffer = readSongBytes ? await readSongBytes(song) : await midiStorage.read(song.id);
      const metadata = computeSongMetadata(buffer, song.title, song.trackAssignments);
      db.updateSong(song.id, {
        bpm: metadata.bpm,
        difficulty: metadata.difficulty,
        durationSec: metadata.durationSec,
        noteCount: metadata.noteCount,
        trackAssignments: metadata.trackAssignments,
      });
      updated += 1;
    } catch (error) {
      errors.push({
        filename: song.title,
        message: (error as Error).message,
      });
    }
  }

  return { updated, errors };
}
