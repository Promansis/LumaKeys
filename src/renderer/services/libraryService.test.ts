import { describe, expect, it, vi } from 'vitest';
import {
  formatLibraryImportResult,
  formatMidiImportResult,
  formatReattachMidiResult,
  runMidiImport,
} from './libraryService';
import type { AppBridge } from '../../shared/ipc';

describe('libraryService', () => {
  it('formats MIDI import results with skipped and failed files', () => {
    expect(formatMidiImportResult({
      songs: [{ songId: 'song-1' } as never],
      skipped: 2,
      errors: [{ filename: 'Broken.mid', message: 'Bad header' }],
    }, 'Import canceled.')).toBe('Imported 1 song. 2 already in library. 1 failed (Broken.mid: Bad header). Review the metadata before playing.');
  });

  it('does not ask for a metadata review when nothing was imported (PH-UI-009)', () => {
    expect(formatMidiImportResult({
      songs: [],
      skipped: 0,
      errors: [{ filename: 'minimal', message: 'MSCZ import requires MuseScore 4 on the Linux web server.' }],
    }, 'Import canceled.')).toBe('1 failed (minimal: MSCZ import requires MuseScore 4 on the Linux web server.).');
    expect(formatMidiImportResult({
      songs: [],
      skipped: 2,
      errors: [],
    }, 'Import canceled.')).toBe('2 already in library.');
  });

  it('formats missing MIDI backup imports with reattach guidance', () => {
    expect(formatLibraryImportResult({
      songsImported: 2,
      foldersImported: 1,
      playlistsImported: 1,
      midiFilesRestored: 1,
      missingMidiFiles: ['Missing Song'],
    })).toBe('Imported 2 songs, 1 folders, 1 playlists, and 1 MIDI files. 1 song may need MIDI files reattached.');
  });

  it('formats reattach results', () => {
    expect(formatReattachMidiResult({
      reattached: [{ songId: 'song-1' } as never],
      skipped: 0,
      errors: [],
    })).toBe('Reattached 1 MIDI file.');
  });

  it('unsubscribes from import progress after bridge import', async () => {
    const unsubscribe = vi.fn();
    const bridge = {
      onImportProgress: vi.fn().mockReturnValue(unsubscribe),
      importMidiFiles: vi.fn().mockResolvedValue({ songs: [], errors: [], skipped: 0 }),
    } as unknown as AppBridge;

    await expect(runMidiImport(bridge, vi.fn())).resolves.toEqual({ songs: [], errors: [], skipped: 0 });
    expect(unsubscribe).toHaveBeenCalled();
  });
});
