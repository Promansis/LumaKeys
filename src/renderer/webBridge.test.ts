import { afterEach, describe, expect, it, vi } from 'vitest';
import { navigateToLogin } from './loginRedirect';
import { webBridge } from './webBridge';

vi.mock('./loginRedirect', () => ({ navigateToLogin: vi.fn() }));

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

  it('stays on the page for API errors other than 401', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'Server error.' }, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(webBridge.getAllSongs()).rejects.toThrow('Server error.');

    expect(navigateToLogin).not.toHaveBeenCalled();
  });

  // Without the server's token gate (trust mode), /login is the app itself; a proxy that
  // answers 401 must not send it to /login again and again.
  it('does not redirect when the app is already on /login', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'Unauthorized.' }, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/login');

    try {
      await expect(webBridge.getAllSongs()).rejects.toThrow('Unauthorized.');
      expect(navigateToLogin).not.toHaveBeenCalled();
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  // PH-SEC-002: with the token gate on, a browser without the session cookie gets 401
  // from every /api call; it should land on the sign-in form, and only once.
  it('sends an unsigned browser to /login once when the API answers 401', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'Web API access token required. Sign in at /login.' }, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(webBridge.getAllSongs()).rejects.toThrow(/Sign in at \/login/);
    await expect(webBridge.getSong('song-1')).rejects.toThrow(/Sign in at \/login/);
    await expect(webBridge.loadMidiFileData('song-1')).rejects.toThrow('Unable to load MIDI: 401');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(navigateToLogin).toHaveBeenCalledTimes(1);
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
});
