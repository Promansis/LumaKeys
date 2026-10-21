import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webBridge } from './webBridge';
import { FakeIndexedDb } from './testUtils/fakeIndexedDb';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

function mockFetch(response: Response): FetchMock {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mockPicker(actions: Array<{ event: 'change' | 'cancel' | 'focus'; files?: unknown[] }>): void {
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
    const element = originalCreateElement(tagName, options);
    if (tagName.toLowerCase() === 'input') {
      const action = actions.shift() ?? { event: 'cancel' };
      Object.defineProperty(element, 'files', {
        configurable: true,
        value: action.files ?? [],
      });
      vi.spyOn(element, 'click').mockImplementation(() => {
        if (action.event === 'focus') {
          window.dispatchEvent(new Event('focus'));
        } else {
          element.dispatchEvent(new Event(action.event));
        }
      });
    }
    return element;
  }) as typeof document.createElement);
}

function mockPickedFile(file: { text: () => Promise<string> }): void {
  mockPicker([{ event: 'change', files: [file] }]);
}

const CURRENT_PACK_DB = 'lumakeys-instrument-sample-packs';
const LEGACY_PACK_DB = 'pianohero-instrument-sample-packs';

function packRecord(instrumentId: string, version = '1') {
  return {
    instrumentId,
    packLabel: `${instrumentId} pack`,
    version,
    installedAt: '2026-05-01T00:00:00.000Z',
    sourceName: 'Test source',
    licenseLabel: 'CC0',
    attributionUrl: 'https://example.test',
    assets: [{ note: 'C4', fileName: 'c4.mp3', blob: new Blob([`${instrumentId}-c4`]) }],
  };
}

async function installedInstrumentIds(): Promise<string[]> {
  const statuses = await webBridge.getInstrumentSamplePackStatuses();
  return statuses.filter((status) => status.isInstalled).map((status) => status.instrumentId).sort();
}

describe('webBridge', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('forwards RPC bridge methods and returns the response result', async () => {
    const fetchMock = mockFetch(jsonResponse({ result: [{ id: 'song-1' }] }));

    await expect(webBridge.getAllSongs()).resolves.toEqual([{ id: 'song-1' }]);

    expect(fetchMock).toHaveBeenCalledWith('/api/bridge/getAllSongs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: [] }),
    });
  });

  it('parses RPC error messages from JSON responses', async () => {
    mockFetch(jsonResponse({ error: 'Nope.' }, { status: 400 }));

    await expect(webBridge.getSong('song-1')).rejects.toThrow('Nope.');
  });

  it('returns null for known desktop-only stubs', async () => {
    await expect(webBridge.pickMidiFile()).resolves.toBeNull();
    await expect(webBridge.saveMidiFile('song.mid', new Uint8Array([1, 2]))).resolves.toBeNull();
    await expect(webBridge.pickSampleDirectory()).resolves.toBeNull();
  });

  it('reports loadMidiFileData HTTP failures with the response status', async () => {
    mockFetch(new Response('missing', { status: 404 }));

    await expect(webBridge.loadMidiFileData('song-1')).rejects.toThrow('Unable to load MIDI: 404');
  });

  it('downloads exported libraries from the browser export endpoint', async () => {
    const result = {
      filename: 'lumakeys-library.json',
      target: 'download',
      songsExported: 0,
      midiFilesIncluded: 0,
      missingMidiFiles: [],
    };
    const fetchMock = mockFetch(jsonResponse({ backup: { version: 2, songs: [], midiFiles: [] }, result }));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:backup'),
      revokeObjectURL: vi.fn(),
    });
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    await expect(webBridge.exportLibrary()).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledWith('/api/library/export');
    expect(anchorClick).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:backup');
  });

  it('imports picked library backups through the browser import endpoint', async () => {
    const backup = { version: 2, exportedAt: '2026-05-27T00:00:00.000Z', songs: [], midiFiles: [] };
    const file = { text: () => Promise.resolve(JSON.stringify(backup)) };
    mockPickedFile(file);
    const result = {
      songsImported: 0,
      foldersImported: 0,
      playlistsImported: 0,
      midiFilesRestored: 0,
      missingMidiFiles: [],
    };
    const fetchMock = mockFetch(jsonResponse({ result }));

    await expect(webBridge.importLibrary()).resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledWith('/api/library/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backup),
    });
  });

  it('settles MIDI picker cancellation, cleans up, and allows retry', async () => {
    const file = new File(['midi'], 'retry.mid', { type: 'audio/midi' });
    const fetchMock = mockFetch(jsonResponse({ songs: [], errors: [], skipped: 0 }));
    mockPicker([
      { event: 'cancel' },
      { event: 'change', files: [file] },
    ]);

    await expect(webBridge.importMidiFiles()).resolves.toEqual({ songs: [], errors: [], skipped: 0 });
    expect(document.querySelectorAll('input')).toHaveLength(0);

    await expect(webBridge.importMidiFiles()).resolves.toEqual({ songs: [], errors: [], skipped: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('input')).toHaveLength(0);
  });

  it('uploads selected MIDI files when window focus returns before the picker change event', async () => {
    vi.useFakeTimers();
    const file = new File(['midi'], 'selected.mid', { type: 'audio/midi' });
    const batch = { songs: [{ songId: 'selected-song' }], errors: [], skipped: 0 };
    const fetchMock = mockFetch(jsonResponse(batch));
    const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {
      window.dispatchEvent(new Event('focus'));
    });

    const result = webBridge.importMidiFiles();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await vi.advanceTimersByTimeAsync(200);
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change'));

    await expect(result).resolves.toEqual(batch);
    expect(inputClick).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('/api/midi/upload', {
      method: 'POST',
      body: expect.any(FormData),
    });
    const formData = fetchMock.mock.calls[0][1].body as FormData;
    expect(formData.get('files')).toBe(file);
    expect(document.querySelectorAll('input')).toHaveLength(0);
  });

  it('accepts MSCZ uploads and reports the score name without its extension', async () => {
    const file = new File(['score'], 'Practice.MSCZ', { type: 'application/octet-stream' });
    const batch = { songs: [{ songId: 'practice' }], errors: [], skipped: 0 };
    const fetchMock = mockFetch(jsonResponse(batch));
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const onProgress = vi.fn();
    const unsubscribe = webBridge.onImportProgress(onProgress);
    try {
      const result = webBridge.importMidiFiles();
      const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
      expect(input.accept.split(',')).toContain('.mscz');
      Object.defineProperty(input, 'files', { configurable: true, value: [file] });
      input.dispatchEvent(new Event('change'));

      await expect(result).resolves.toEqual(batch);
      expect((fetchMock.mock.calls[0][1].body as FormData).get('files')).toBe(file);
      expect(onProgress).toHaveBeenCalledWith({ current: 1, total: 1, filename: 'Practice' });
      expect(document.querySelectorAll('input')).toHaveLength(0);
    } finally {
      unsubscribe();
    }
  });

  it('settles JSON picker cancellation without importing or leaving input state', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockPicker([{ event: 'cancel' }]);

    await expect(webBridge.importLibrary()).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelectorAll('input')).toHaveLength(0);
  });

  it('waits for native cancellation instead of treating window focus as cancellation', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockPicker([{ event: 'focus' }]);

    const result = webBridge.importMidiFiles();
    const settled = vi.fn();
    void result.then(settled);
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await vi.advanceTimersByTimeAsync(1000);

    expect(settled).not.toHaveBeenCalled();
    expect(input.isConnected).toBe(true);
    input.dispatchEvent(new Event('cancel'));

    await expect(result).resolves.toEqual({ songs: [], errors: [], skipped: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.querySelectorAll('input')).toHaveLength(0);
  });

  it('clears browser-local settings after the server reset succeeds', async () => {
    window.localStorage.setItem('lumakeys-test', 'present');
    const fetchMock = mockFetch(jsonResponse({ result: null }));

    await expect(webBridge.resetUserData()).resolves.toBeNull();

    expect(window.localStorage.getItem('lumakeys-test')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/bridge/resetUserData', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: [] }),
    });
  });

  describe('legacy sample pack carry-over (PH-DATA-004)', () => {
    let fakeIndexedDb: FakeIndexedDb;

    beforeEach(() => {
      fakeIndexedDb = new FakeIndexedDb();
      vi.stubGlobal('indexedDB', fakeIndexedDb);
    });

    it('installs packs saved under the pre-rename database name and deletes the legacy database', async () => {
      const flute = packRecord('flute');
      fakeIndexedDb.seed(LEGACY_PACK_DB, 'packs', 'instrumentId', [flute, packRecord('marimba')]);

      await expect(installedInstrumentIds()).resolves.toEqual(['flute', 'marimba']);

      expect(fakeIndexedDb.has(LEGACY_PACK_DB)).toBe(false);
      const copied = fakeIndexedDb.read(CURRENT_PACK_DB, 'packs') as Array<ReturnType<typeof packRecord>>;
      expect(copied.map((record) => record.instrumentId).sort()).toEqual(['flute', 'marimba']);
      expect(copied.find((record) => record.instrumentId === 'flute')?.assets[0].blob).toBe(flute.assets[0].blob);
    });

    it('carries packs into a current database that exists but holds no packs', async () => {
      fakeIndexedDb.seed(CURRENT_PACK_DB, 'packs', 'instrumentId', []);
      fakeIndexedDb.seed(LEGACY_PACK_DB, 'packs', 'instrumentId', [packRecord('cello')]);

      await expect(installedInstrumentIds()).resolves.toEqual(['cello']);

      expect(fakeIndexedDb.has(LEGACY_PACK_DB)).toBe(false);
    });

    it('keeps the current packs and leaves the legacy database untouched when both hold packs', async () => {
      fakeIndexedDb.seed(CURRENT_PACK_DB, 'packs', 'instrumentId', [packRecord('flute', '2')]);
      fakeIndexedDb.seed(LEGACY_PACK_DB, 'packs', 'instrumentId', [packRecord('flute', '1'), packRecord('cello')]);

      await expect(installedInstrumentIds()).resolves.toEqual(['flute']);

      expect(fakeIndexedDb.has(LEGACY_PACK_DB)).toBe(true);
      expect(fakeIndexedDb.read(LEGACY_PACK_DB, 'packs')).toHaveLength(2);
      expect((fakeIndexedDb.read(CURRENT_PACK_DB, 'packs') as Array<{ version: string }>)[0].version).toBe('2');
    });

    it('does not create the legacy database when there is none', async () => {
      await expect(installedInstrumentIds()).resolves.toEqual([]);

      expect(fakeIndexedDb.has(LEGACY_PACK_DB)).toBe(false);
      expect(fakeIndexedDb.has(CURRENT_PACK_DB)).toBe(true);
    });

    it('deletes a legacy database with no pack store without copying anything', async () => {
      fakeIndexedDb.seed(LEGACY_PACK_DB, 'other', 'id', [{ id: 'x' }]);

      await expect(installedInstrumentIds()).resolves.toEqual([]);

      expect(fakeIndexedDb.has(LEGACY_PACK_DB)).toBe(false);
    });

    it('clears both filter preset keys when user data is reset', async () => {
      window.localStorage.setItem('lumakeys-filter-presets', '[]');
      window.localStorage.setItem('pianohero-filter-presets', '[]');
      mockFetch(jsonResponse({ result: null }));

      await webBridge.resetUserData();

      expect(window.localStorage.getItem('lumakeys-filter-presets')).toBeNull();
      expect(window.localStorage.getItem('pianohero-filter-presets')).toBeNull();
    });

    it('clears both database names when user data is reset', async () => {
      fakeIndexedDb.seed(CURRENT_PACK_DB, 'packs', 'instrumentId', [packRecord('flute', '2')]);
      fakeIndexedDb.seed(LEGACY_PACK_DB, 'packs', 'instrumentId', [packRecord('cello')]);
      mockFetch(jsonResponse({ result: null }));

      await expect(webBridge.resetUserData()).resolves.toBeNull();

      expect(fakeIndexedDb.has(CURRENT_PACK_DB)).toBe(false);
      expect(fakeIndexedDb.has(LEGACY_PACK_DB)).toBe(false);
    });
  });
});
