import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryScreen, withinDateRange } from './LibraryScreen';

function createAudioEngineStub() {
  return {
    allNotesOff: vi.fn(),
    init: vi.fn().mockResolvedValue(undefined),
    noteOn: vi.fn().mockResolvedValue(undefined),
    noteOff: vi.fn(),
  };
}

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mediaQuery = {
    matches,
    media: '(max-width: 780px)',
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeListener: (listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatch(nextMatches: boolean) {
      this.matches = nextMatches;
      const event = { matches: nextMatches } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => mediaQuery),
  });

  return mediaQuery;
}

describe('LibraryScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_WEB', true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          songs: [],
          errors: [{ filename: 'Broken', message: 'Bad header' }],
        }),
      }),
    );

    window.appBridge = {
      getAllSongs: vi.fn().mockResolvedValue([]),
      getAllFolders: vi.fn().mockResolvedValue([]),
      getAllPlaylists: vi.fn().mockResolvedValue([]),
      getRecommendations: vi.fn().mockResolvedValue(null),
      getUserStats: vi.fn().mockResolvedValue(null),
      getSetting: vi.fn().mockResolvedValue(null),
      importMidiFiles: vi.fn().mockResolvedValue({ songs: [], errors: [], skipped: 0 }),
      onImportProgress: vi.fn().mockReturnValue(() => undefined),
    } as unknown as typeof window.appBridge;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('shows actual web import error messages in the library feedback', async () => {
    window.appBridge = {
      ...window.appBridge,
      importMidiFiles: vi.fn().mockResolvedValue({
        songs: [],
        errors: [{ filename: 'Broken', message: 'Bad header' }],
        skipped: 0,
      }),
    } as unknown as typeof window.appBridge;

    render(
      <LibraryScreen
        audioEngine={createAudioEngineStub() as unknown as import('../../lib/audio/audioEngine').AudioEngine}
        onStartSession={vi.fn()}
        onStartPlaylistQueue={vi.fn()}
        onStartTheoryPractice={vi.fn()}
      />,
    );

    await screen.findByText('Build your library by importing MIDI or MSCZ files.');

    fireEvent.click(screen.getByRole('button', { name: 'Upload MIDI / MSCZ' }));

    await waitFor(() => {
      expect(screen.getByText(/Broken: Bad header/)).toBeInTheDocument();
    });
  });

  it('clears loading and reports refresh failures', async () => {
    window.appBridge = {
      getAllSongs: vi.fn().mockRejectedValue(new Error('database unavailable')),
      getAllFolders: vi.fn().mockResolvedValue([]),
      getAllPlaylists: vi.fn().mockResolvedValue([]),
      getRecommendations: vi.fn().mockResolvedValue(null),
      getUserStats: vi.fn().mockResolvedValue(null),
      getSetting: vi.fn().mockResolvedValue(null),
    } as unknown as typeof window.appBridge;

    render(
      <LibraryScreen
        audioEngine={createAudioEngineStub() as unknown as import('../../lib/audio/audioEngine').AudioEngine}
        onStartSession={vi.fn()}
        onStartPlaylistQueue={vi.fn()}
        onStartTheoryPractice={vi.fn()}
      />,
    );

    await screen.findByText(/Unable to load library: database unavailable/);
    expect(screen.queryByText('Loading library')).not.toBeInTheDocument();
  });

  it('uses the typed bridge for web MIDI imports', async () => {
    const fetchMock = vi.mocked(fetch);
    const importMidiFiles = vi.fn().mockResolvedValue({
      songs: [{ songId: 'song-1' }],
      errors: [],
      skipped: 0,
    });
    window.appBridge = {
      ...window.appBridge,
      importMidiFiles,
    } as unknown as typeof window.appBridge;

    render(
      <LibraryScreen
        audioEngine={createAudioEngineStub() as unknown as import('../../lib/audio/audioEngine').AudioEngine}
        onStartSession={vi.fn()}
        onStartPlaylistQueue={vi.fn()}
        onStartTheoryPractice={vi.fn()}
      />,
    );

    await screen.findByText('Build your library by importing MIDI or MSCZ files.');

    fireEvent.click(screen.getByRole('button', { name: 'Upload MIDI / MSCZ' }));

    await waitFor(() => {
      expect(importMidiFiles).toHaveBeenCalled();
    });
    expect(fetchMock).not.toHaveBeenCalledWith('/api/midi/upload', expect.anything());
  });

  it('deletes a song from the metadata editor', async () => {
    const bulkDeleteSongs = vi.fn().mockResolvedValue(undefined);
    const song = {
      id: 'song-1',
      title: 'Etude',
      artist: 'Composer',
      genre: 'Classical',
      difficulty: 4,
      durationSec: 120,
      bpm: 120,
      noteCount: 240,
      filePath: '/tmp/etude.mid',
      dateAdded: '2026-04-18T00:00:00.000Z',
      lastPlayed: null,
      timesPlayed: 0,
      isFavorite: false,
      folderId: null,
      tags: [],
      trackAssignments: {},
    };

    window.appBridge = {
      getAllSongs: vi.fn().mockResolvedValueOnce([song]).mockResolvedValue([]),
      getAllFolders: vi.fn().mockResolvedValue([]),
      getAllPlaylists: vi.fn().mockResolvedValue([]),
      getRecommendations: vi.fn().mockResolvedValue(null),
      getUserStats: vi.fn().mockResolvedValue(null),
      getSetting: vi.fn().mockResolvedValue(null),
      bulkDeleteSongs,
    } as unknown as typeof window.appBridge;

    render(
      <LibraryScreen
        audioEngine={createAudioEngineStub() as unknown as import('../../lib/audio/audioEngine').AudioEngine}
        onStartSession={vi.fn()}
        onStartPlaylistQueue={vi.fn()}
        onStartTheoryPractice={vi.fn()}
      />,
    );

    await screen.findByText('1 song ready to play.');

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Metadata' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Song' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete 1 song' }));

    await waitFor(() => {
      expect(bulkDeleteSongs).toHaveBeenCalledWith(['song-1']);
    });

    await waitFor(() => {
      expect(screen.queryByText('Metadata Review')).not.toBeInTheDocument();
      expect(screen.getByText('Deleted 1 song from the library.')).toBeInTheDocument();
    });
  });

  it('shows the unchanged-library retry message, without the IPC or OS error, when a delete fails', async () => {
    const unchanged = 'Nothing was deleted, and your library is unchanged. Check that the LumaKeys data folder can be written to, then try again.';
    const bulkDeleteSongs = vi.fn().mockRejectedValue(
      new Error(`Error invoking remote method 'bulk:delete-songs': Error: ${unchanged}`),
    );
    const song = {
      id: 'song-1',
      title: 'Etude',
      artist: 'Composer',
      genre: 'Classical',
      difficulty: 4,
      durationSec: 120,
      bpm: 120,
      noteCount: 240,
      filePath: '/tmp/etude.mid',
      dateAdded: '2026-04-18T00:00:00.000Z',
      lastPlayed: null,
      timesPlayed: 0,
      isFavorite: false,
      folderId: null,
      tags: [],
      trackAssignments: {},
    };

    window.appBridge = {
      getAllSongs: vi.fn().mockResolvedValue([song]),
      getAllFolders: vi.fn().mockResolvedValue([]),
      getAllPlaylists: vi.fn().mockResolvedValue([]),
      getRecommendations: vi.fn().mockResolvedValue(null),
      getUserStats: vi.fn().mockResolvedValue(null),
      getSetting: vi.fn().mockResolvedValue(null),
      bulkDeleteSongs,
      importLibrary: vi.fn().mockRejectedValue(
        new Error("Error invoking remote method 'library:import': Error: Nothing was restored, and your library is unchanged. Check that the LumaKeys data folder can be written to, then try the import again."),
      ),
    } as unknown as typeof window.appBridge;

    render(
      <LibraryScreen
        audioEngine={createAudioEngineStub() as unknown as import('../../lib/audio/audioEngine').AudioEngine}
        onStartSession={vi.fn()}
        onStartPlaylistQueue={vi.fn()}
        onStartTheoryPractice={vi.fn()}
      />,
    );

    await screen.findByText('1 song ready to play.');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Metadata' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Song' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete 1 song' }));

    expect(await screen.findByText(`Delete failed. ${unchanged}`)).toBeInTheDocument();
    expect(screen.queryByText(/Error invoking remote method/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Import Library' }));
    expect(
      await screen.findByText('Import failed. Nothing was restored, and your library is unchanged. Check that the LumaKeys data folder can be written to, then try the import again.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Error invoking remote method/)).not.toBeInTheDocument();
  });

  it('reattaches MIDI for the selected song through the bridge', async () => {
    const reattachMidiFile = vi.fn().mockResolvedValue({
      reattached: [{ songId: 'song-1' }],
      errors: [],
      skipped: 0,
    });
    const song = {
      id: 'song-1',
      title: 'Etude',
      artist: 'Composer',
      genre: 'Classical',
      difficulty: 4,
      durationSec: 120,
      bpm: 120,
      noteCount: 240,
      filePath: '',
      dateAdded: '2026-04-18T00:00:00.000Z',
      lastPlayed: null,
      timesPlayed: 0,
      isFavorite: false,
      folderId: null,
      tags: [],
      trackAssignments: {},
    };

    window.appBridge = {
      getAllSongs: vi.fn().mockResolvedValue([song]),
      getAllFolders: vi.fn().mockResolvedValue([]),
      getAllPlaylists: vi.fn().mockResolvedValue([]),
      getRecommendations: vi.fn().mockResolvedValue(null),
      getUserStats: vi.fn().mockResolvedValue(null),
      getSetting: vi.fn().mockResolvedValue(null),
      reattachMidiFile,
    } as unknown as typeof window.appBridge;

    render(
      <LibraryScreen
        audioEngine={createAudioEngineStub() as unknown as import('../../lib/audio/audioEngine').AudioEngine}
        onStartSession={vi.fn()}
        onStartPlaylistQueue={vi.fn()}
        onStartTheoryPractice={vi.fn()}
      />,
    );

    await screen.findByText('1 song ready to play.');
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Metadata' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reattach MIDI' }));

    await waitFor(() => {
      expect(reattachMidiFile).toHaveBeenCalledWith('song-1');
    });
    expect(await screen.findByText('Reattached 1 MIDI file.')).toBeInTheDocument();
  });

  it('removes a tag from selected songs through bulk actions', async () => {
    const bulkRemoveTag = vi.fn().mockResolvedValue(undefined);
    const song = {
      id: 'song-1',
      title: 'Etude',
      artist: 'Composer',
      genre: 'Classical',
      difficulty: 4,
      durationSec: 120,
      bpm: 120,
      noteCount: 240,
      filePath: '/tmp/etude.mid',
      dateAdded: '2026-04-18T00:00:00.000Z',
      lastPlayed: null,
      timesPlayed: 0,
      isFavorite: false,
      folderId: null,
      tags: ['warmup'],
      trackAssignments: {},
    };

    window.appBridge = {
      getAllSongs: vi.fn().mockResolvedValue([song]),
      getAllFolders: vi.fn().mockResolvedValue([]),
      getAllPlaylists: vi.fn().mockResolvedValue([]),
      getRecommendations: vi.fn().mockResolvedValue(null),
      getUserStats: vi.fn().mockResolvedValue(null),
      getSetting: vi.fn().mockResolvedValue(null),
      bulkRemoveTag,
    } as unknown as typeof window.appBridge;

    render(
      <LibraryScreen
        audioEngine={createAudioEngineStub() as unknown as import('../../lib/audio/audioEngine').AudioEngine}
        onStartSession={vi.fn()}
        onStartPlaylistQueue={vi.fn()}
        onStartTheoryPractice={vi.fn()}
      />,
    );

    await screen.findByText('1 song ready to play.');
    fireEvent.click(screen.getByRole('checkbox'));
    const tagInputs = screen.getAllByPlaceholderText('Tag name');
    fireEvent.change(tagInputs[1], { target: { value: 'warmup' } });
    fireEvent.keyDown(tagInputs[1], { key: 'Enter' });

    await waitFor(() => {
      expect(bulkRemoveTag).toHaveBeenCalledWith(['song-1'], 'warmup');
    });
    expect(await screen.findByText(/Removed "warmup" from 1 song/)).toBeInTheDocument();
  });

  it('defaults to list mode with closed mobile disclosures on compact layouts', async () => {
    mockMatchMedia(true);
    const song = {
      id: 'song-1',
      title: 'Etude',
      artist: 'Composer',
      genre: 'Classical',
      difficulty: 4,
      durationSec: 120,
      bpm: 120,
      noteCount: 240,
      filePath: '/tmp/etude.mid',
      dateAdded: '2026-04-18T00:00:00.000Z',
      lastPlayed: null,
      timesPlayed: 0,
      isFavorite: false,
      folderId: null,
      tags: [],
      trackAssignments: {},
    };

    window.appBridge = {
      getAllSongs: vi.fn().mockResolvedValue([song]),
      getAllFolders: vi.fn().mockResolvedValue([]),
      getAllPlaylists: vi.fn().mockResolvedValue([]),
      getRecommendations: vi.fn().mockResolvedValue({
        nextChallenge: [{ song, reason: 'Push into a slightly harder run.' }],
        skillBuilder: [],
        youMightLike: [],
        revisit: [{ song, reason: 'Revisit a recent piece.' }],
      }),
      getUserStats: vi.fn().mockResolvedValue(null),
      getSetting: vi.fn().mockResolvedValue(null),
    } as unknown as typeof window.appBridge;

    const { container } = render(
      <LibraryScreen
        audioEngine={createAudioEngineStub() as unknown as import('../../lib/audio/audioEngine').AudioEngine}
        onStartSession={vi.fn()}
        onStartPlaylistQueue={vi.fn()}
        onStartTheoryPractice={vi.fn()}
      />,
    );

    await screen.findByText('1 song ready to play.');

    expect(screen.queryByRole('button', { name: 'Grid' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'List' })).not.toBeInTheDocument();
    expect(container.querySelector('.song-list')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Show Collections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Suggestions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Plan' })).toBeInTheDocument();
    expect(screen.queryByText('Favorites')).not.toBeInTheDocument();
    expect(screen.queryByText('Next Challenge')).not.toBeInTheDocument();
    expect(screen.queryByText('A ready-made routine for your next practice slot.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show Collections' }));
    expect(screen.getByText('Favorites')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show Suggestions' }));
    expect(screen.getByText('Next Challenge')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show Plan' }));
    expect(screen.getByText('A ready-made routine for your next practice slot.')).toBeInTheDocument();
  });

  it('keeps recommendations and the practice plan expanded on desktop layouts', async () => {
    mockMatchMedia(false);
    const song = {
      id: 'song-1',
      title: 'Etude',
      artist: 'Composer',
      genre: 'Classical',
      difficulty: 4,
      durationSec: 120,
      bpm: 120,
      noteCount: 240,
      filePath: '/tmp/etude.mid',
      dateAdded: '2026-04-18T00:00:00.000Z',
      lastPlayed: null,
      timesPlayed: 0,
      isFavorite: false,
      folderId: null,
      tags: [],
      trackAssignments: {},
    };

    window.appBridge = {
      getAllSongs: vi.fn().mockResolvedValue([song]),
      getAllFolders: vi.fn().mockResolvedValue([]),
      getAllPlaylists: vi.fn().mockResolvedValue([]),
      getRecommendations: vi.fn().mockResolvedValue({
        nextChallenge: [{ song, reason: 'Push into a slightly harder run.' }],
        skillBuilder: [],
        youMightLike: [],
        revisit: [{ song, reason: 'Revisit a recent piece.' }],
      }),
      getUserStats: vi.fn().mockResolvedValue(null),
      getSetting: vi.fn().mockResolvedValue(null),
    } as unknown as typeof window.appBridge;

    render(
      <LibraryScreen
        audioEngine={createAudioEngineStub() as unknown as import('../../lib/audio/audioEngine').AudioEngine}
        onStartSession={vi.fn()}
        onStartPlaylistQueue={vi.fn()}
        onStartTheoryPractice={vi.fn()}
      />,
    );

    await screen.findByText('1 song ready to play.');

    expect(screen.queryByRole('button', { name: 'Show Collections' })).not.toBeInTheDocument();
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide Suggestions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide Plan' })).toBeInTheDocument();
    expect(screen.getByText('Next Challenge')).toBeInTheDocument();
    expect(screen.getByText('A ready-made routine for your next practice slot.')).toBeInTheDocument();
  });

  describe('filter presets saved before the rename (PH-DATA-007)', () => {
    const presetJson = (label: string) =>
      JSON.stringify([
        {
          label,
          difficulty: 'all',
          advanced: {
            durationMin: '',
            durationMax: '',
            scoreMin: '',
            scoreMax: '',
            playedState: 'unplayed',
            dateAddedFrom: '',
            dateAddedTo: '',
          },
        },
      ]);

    const renderLibrary = () =>
      render(
        <LibraryScreen
          audioEngine={createAudioEngineStub() as unknown as import('../../lib/audio/audioEngine').AudioEngine}
          onStartSession={vi.fn()}
          onStartPlaylistQueue={vi.fn()}
          onStartTheoryPractice={vi.fn()}
        />,
      );

    it('lists a preset saved under the pre-rename key and moves it to the current key', async () => {
      localStorage.setItem('pianohero-filter-presets', presetJson('Legacy Preset'));

      renderLibrary();

      expect(await screen.findByRole('button', { name: 'Legacy Preset' })).toBeInTheDocument();
      expect(localStorage.getItem('lumakeys-filter-presets')).toBe(presetJson('Legacy Preset'));
      expect(localStorage.getItem('pianohero-filter-presets')).toBeNull();
    });

    it('keeps the current presets and leaves the legacy key alone when both exist', async () => {
      localStorage.setItem('lumakeys-filter-presets', presetJson('Current Preset'));
      localStorage.setItem('pianohero-filter-presets', presetJson('Legacy Preset'));

      renderLibrary();

      expect(await screen.findByRole('button', { name: 'Current Preset' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Legacy Preset' })).not.toBeInTheDocument();
      expect(localStorage.getItem('pianohero-filter-presets')).toBe(presetJson('Legacy Preset'));
    });
  });
  describe('delete confirmation', () => {
    const makeSong = (id: string, title: string) => ({
      id,
      title,
      artist: 'Composer',
      genre: 'Classical',
      difficulty: 4,
      durationSec: 120,
      bpm: 120,
      noteCount: 240,
      filePath: `/tmp/${id}.mid`,
      dateAdded: '2026-04-18T00:00:00.000Z',
      lastPlayed: null,
      timesPlayed: 0,
      isFavorite: false,
      folderId: null,
      tags: [],
      trackAssignments: {},
    });

    const renderLibrary = async (bulkDeleteSongs: ReturnType<typeof vi.fn>) => {
      const songs = [makeSong('song-1', 'Etude'), makeSong('song-2', 'Waltz'), makeSong('song-3', 'March')];
      const getAllSongs = vi.fn().mockResolvedValue(songs);
      window.appBridge = {
        getAllSongs,
        getAllFolders: vi.fn().mockResolvedValue([]),
        getAllPlaylists: vi.fn().mockResolvedValue([]),
        getRecommendations: vi.fn().mockResolvedValue(null),
        getUserStats: vi.fn().mockResolvedValue(null),
        getSetting: vi.fn().mockResolvedValue(null),
        bulkDeleteSongs,
      } as unknown as typeof window.appBridge;
      render(
        <LibraryScreen
          audioEngine={createAudioEngineStub() as unknown as import('../../lib/audio/audioEngine').AudioEngine}
          onStartSession={vi.fn()}
          onStartPlaylistQueue={vi.fn()}
          onStartTheoryPractice={vi.fn()}
        />,
      );
      await screen.findByText('3 songs ready to play.');
      return { getAllSongs };
    };

    const selectSongs = (...titles: string[]) => {
      for (const title of titles) {
        const card = screen.getByRole('heading', { name: title }).closest('article') as HTMLElement;
        fireEvent.click(within(card).getByRole('checkbox'));
      }
    };

    it('asks before the bulk bar deletes, names the count and the history that goes, and focuses Cancel', async () => {
      const bulkDeleteSongs = vi.fn().mockResolvedValue(undefined);
      await renderLibrary(bulkDeleteSongs);
      selectSongs('Etude', 'Waltz');

      fireEvent.click(within(document.querySelector('.bulk-action-bar') as HTMLElement).getByRole('button', { name: 'Delete' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('heading', { name: 'Delete 2 songs?' })).toBeInTheDocument();
      expect(dialog.textContent).toContain('results');
      expect(dialog.textContent).toContain('practice history');
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
      expect(bulkDeleteSongs).not.toHaveBeenCalled();
    });

    it('keeps everything and makes no bridge call when the bulk prompt is cancelled', async () => {
      const bulkDeleteSongs = vi.fn().mockResolvedValue(undefined);
      const { getAllSongs } = await renderLibrary(bulkDeleteSongs);
      selectSongs('Etude', 'Waltz');
      fireEvent.click(within(document.querySelector('.bulk-action-bar') as HTMLElement).getByRole('button', { name: 'Delete' }));
      const callsBefore = getAllSongs.mock.calls.length;

      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(bulkDeleteSongs).not.toHaveBeenCalled();
      expect(getAllSongs.mock.calls.length).toBe(callsBefore);
      expect(screen.getByRole('heading', { name: 'Etude' })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '2 selected' })).toBeInTheDocument();
      expect(screen.queryByText(/Deleted \d+ song/)).not.toBeInTheDocument();
    });

    it('cancels the prompt on Escape without deleting', async () => {
      const bulkDeleteSongs = vi.fn().mockResolvedValue(undefined);
      await renderLibrary(bulkDeleteSongs);
      selectSongs('Etude');
      fireEvent.click(within(document.querySelector('.bulk-action-bar') as HTMLElement).getByRole('button', { name: 'Delete' }));
      await screen.findByRole('dialog');

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(bulkDeleteSongs).not.toHaveBeenCalled();
    });

    it('deletes only the selected songs, once, when the bulk prompt is confirmed', async () => {
      const bulkDeleteSongs = vi.fn().mockResolvedValue(undefined);
      await renderLibrary(bulkDeleteSongs);
      selectSongs('Etude', 'Waltz');
      fireEvent.click(within(document.querySelector('.bulk-action-bar') as HTMLElement).getByRole('button', { name: 'Delete' }));

      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete 2 songs' }));

      await waitFor(() => expect(bulkDeleteSongs).toHaveBeenCalledTimes(1));
      expect(bulkDeleteSongs).toHaveBeenCalledWith(['song-1', 'song-2']);
      expect(await screen.findByText('Deleted 2 songs from the library.')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('shows the delete error in the status line when a confirmed bulk delete fails', async () => {
      const restart = 'LumaKeys needs a restart before it can delete songs. Restart the app, then try again.';
      const bulkDeleteSongs = vi.fn().mockRejectedValue(new Error(restart));
      await renderLibrary(bulkDeleteSongs);
      selectSongs('Etude');
      fireEvent.click(within(document.querySelector('.bulk-action-bar') as HTMLElement).getByRole('button', { name: 'Delete' }));

      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete 1 song' }));

      expect(await screen.findByText(/Delete failed\./)).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Etude' })).toBeInTheDocument();
    });

    it('asks before the metadata editor deletes a song, and Cancel leaves the editor open', async () => {
      const bulkDeleteSongs = vi.fn().mockResolvedValue(undefined);
      await renderLibrary(bulkDeleteSongs);
      const card = screen.getByRole('heading', { name: 'Etude' }).closest('article') as HTMLElement;
      fireEvent.click(within(card).getByRole('button', { name: 'More' }));
      fireEvent.click(within(card).getByRole('button', { name: 'Edit Metadata' }));

      fireEvent.click(screen.getByRole('button', { name: 'Delete Song' }));

      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('heading', { name: 'Delete 1 song?' })).toBeInTheDocument();
      expect(dialog.textContent).toContain('practice history');
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(bulkDeleteSongs).not.toHaveBeenCalled();
      expect(screen.getByText('Metadata Review')).toBeInTheDocument();
    });
  });
});

describe('withinDateRange', () => {
  // SQLite stores `datetime('now')`: UTC, "YYYY-MM-DD HH:MM:SS". Build the stored string from a
  // local wall-clock time so the same cases hold under any TZ the suite runs in.
  const stored = (year: number, month: number, day: number, hour: number, minute: number) =>
    new Date(year, month - 1, day, hour, minute, 0).toISOString().slice(0, 19).replace('T', ' ');

  it.each([
    ['just after local midnight', 0, 30],
    ['midday', 12, 0],
    ['just before local midnight', 23, 30],
  ])('includes a song added %s on the chosen local day', (_label, hour, minute) => {
    const added = stored(2026, 10, 19, hour, minute);
    expect(withinDateRange(added, '2026-10-19', '2026-10-19')).toBe(true);
    expect(withinDateRange(added, '2026-10-19', '')).toBe(true);
    expect(withinDateRange(added, '', '2026-10-19')).toBe(true);
    expect(withinDateRange(added, '2026-10-20', '')).toBe(false);
    expect(withinDateRange(added, '', '2026-10-18')).toBe(false);
    expect(withinDateRange(added, '2026-10-18', '2026-10-18')).toBe(false);
    expect(withinDateRange(added, '2026-10-20', '2026-10-20')).toBe(false);
  });

  it('reads the stored zone-less timestamp as UTC', () => {
    const local = new Date(Date.UTC(2026, 9, 19, 14, 24, 46));
    const pad = (n: number) => String(n).padStart(2, '0');
    const localDay = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
    expect(withinDateRange('2026-10-19 14:24:46', localDay, localDay)).toBe(true);
  });

  it('keeps everything when no bounds are set', () => {
    expect(withinDateRange('2026-10-19 14:24:46', '', '')).toBe(true);
  });
});

describe('LibraryScreen playlist reorder', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('keeps the playlist view mounted through a reorder so focus and the announcement survive', async () => {
    vi.stubGlobal('IS_WEB', true);
    mockMatchMedia(false);
    const makeSong = (id: string, title: string) => ({
      id,
      title,
      artist: 'Composer',
      genre: 'Classical',
      difficulty: 4,
      durationSec: 120,
      bpm: 120,
      noteCount: 240,
      filePath: `/tmp/${id}.mid`,
      dateAdded: '2026-04-18T00:00:00.000Z',
      lastPlayed: null,
      timesPlayed: 0,
      isFavorite: false,
      folderId: null,
      tags: [],
      trackAssignments: {},
    });
    const alpha = makeSong('song-1', 'Alpha Waltz');
    const beta = makeSong('song-2', 'Beta March');
    const gamma = makeSong('song-3', 'Gamma Etude');
    let order = [alpha, beta, gamma];
    const reorderPlaylistSong = vi.fn().mockImplementation(async (_playlistId: string, songId: string, newOrder: number) => {
      const moving = order.find((song) => song.id === songId)!;
      const rest = order.filter((song) => song.id !== songId);
      rest.splice(newOrder, 0, moving);
      order = rest;
    });
    window.appBridge = {
      getAllSongs: vi.fn().mockResolvedValue([alpha, beta, gamma]),
      getAllFolders: vi.fn().mockResolvedValue([]),
      getAllPlaylists: vi.fn().mockResolvedValue([
        { id: 'pl-1', name: 'Warmups', description: '', createdAt: '', updatedAt: '', songCount: 3 },
      ]),
      getPlaylistSongs: vi.fn().mockImplementation(async () => order),
      reorderPlaylistSong,
      getRecommendations: vi.fn().mockResolvedValue(null),
      getUserStats: vi.fn().mockResolvedValue(null),
      getSetting: vi.fn().mockResolvedValue(null),
    } as unknown as typeof window.appBridge;

    render(
      <LibraryScreen
        audioEngine={createAudioEngineStub() as unknown as import('../../lib/audio/audioEngine').AudioEngine}
        onStartSession={vi.fn()}
        onStartPlaylistQueue={vi.fn()}
        onStartTheoryPractice={vi.fn()}
      />,
    );
    await screen.findByText('3 songs ready to play.');
    fireEvent.click(await screen.findByRole('button', { name: /^Warmups/ }));
    const moveDown = await screen.findByRole('button', { name: 'Move down: Alpha Waltz' });

    fireEvent.click(moveDown);

    await waitFor(() => expect(reorderPlaylistSong).toHaveBeenCalledWith('pl-1', 'song-1', 1));
    expect(await screen.findByText('Moved Alpha Waltz to position 2 of 3.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move down: Alpha Waltz' })).toHaveFocus();
  });
});
