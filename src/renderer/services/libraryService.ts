import type { LibraryExportResult, LibraryImportResult } from '../../shared/dbTypes';
import type { AppBridge, ImportProgressEvent, ImportResult, ReattachMidiResult } from '../../shared/ipc';

export function formatMidiImportResult(result: ImportResult, emptyMessage: string): string {
  const { songs, errors, skipped } = result;
  if (songs.length === 0 && errors.length === 0 && skipped === 0) {
    return emptyMessage;
  }

  const parts: string[] = [];
  if (songs.length > 0) {
    parts.push(`Imported ${songs.length} song${songs.length === 1 ? '' : 's'}`);
  }
  if (skipped > 0) {
    parts.push(`${skipped} already in library`);
  }
  if (errors.length > 0) {
    parts.push(`${errors.length} failed (${errors.map((error) => `${error.filename}: ${error.message}`).join('; ')})`);
  }
  // The hint points at the metadata editor, which opens only when a song was added.
  return parts.join('. ') + (songs.length > 0 ? '. Review the metadata before playing.' : '.');
}

export function formatFolderImportResult(result: { imported: unknown[]; skipped: number; errors: Array<{ filename: string; message: string }> }): string {
  if (result.imported.length === 0 && result.skipped === 0 && result.errors.length === 0) {
    return 'No MIDI files found in that folder.';
  }

  const parts: string[] = [];
  if (result.imported.length > 0) {
    parts.push(`${result.imported.length} song${result.imported.length === 1 ? '' : 's'} imported`);
  }
  if (result.skipped > 0) {
    parts.push(`${result.skipped} already in library`);
  }
  if (result.errors.length > 0) {
    parts.push(`${result.errors.length} failed (${result.errors.map((error) => `${error.filename}: ${error.message}`).join('; ')})`);
  }
  return parts.join(', ') + '.';
}

export function formatReattachMidiResult(result: ReattachMidiResult): string {
  if (result.reattached.length === 0 && result.errors.length === 0 && result.skipped === 0) {
    return 'Reattach canceled.';
  }

  const parts: string[] = [];
  if (result.reattached.length > 0) {
    parts.push(`Reattached ${result.reattached.length} MIDI file${result.reattached.length === 1 ? '' : 's'}`);
  }
  if (result.skipped > 0) {
    parts.push(`${result.skipped} skipped`);
  }
  if (result.errors.length > 0) {
    parts.push(`${result.errors.length} failed (${result.errors.map((error) => `${error.filename}: ${error.message}`).join('; ')})`);
  }
  return parts.join('. ') + '.';
}

export function formatLibraryExportResult(result: LibraryExportResult): string {
  const missing = result.missingMidiFiles.length > 0
    ? ` ${result.missingMidiFiles.length} MIDI file${result.missingMidiFiles.length === 1 ? '' : 's'} could not be included.`
    : '';
  return `Exported ${result.songsExported} song${result.songsExported === 1 ? '' : 's'} to ${result.location ?? result.filename}.${missing}`;
}

export function formatLibraryImportResult(result: LibraryImportResult): string {
  const missing = result.missingMidiFiles.length > 0
    ? ` ${result.missingMidiFiles.length} song${result.missingMidiFiles.length === 1 ? '' : 's'} may need MIDI files reattached.`
    : '';
  return `Imported ${result.songsImported} songs, ${result.foldersImported} folders, ${result.playlistsImported} playlists, and ${result.midiFilesRestored} MIDI files.${missing}`;
}

export async function runMidiImport(
  bridge: AppBridge,
  onProgress: (event: ImportProgressEvent) => void,
): Promise<ImportResult> {
  const unsubscribe = bridge.onImportProgress(onProgress);
  try {
    return await bridge.importMidiFiles();
  } finally {
    unsubscribe();
  }
}

export async function runFolderImport(
  bridge: AppBridge,
  onProgress: (event: ImportProgressEvent) => void,
) {
  const unsubscribe = bridge.onImportProgress(onProgress);
  try {
    return await bridge.importMidiFolder();
  } finally {
    unsubscribe();
  }
}
