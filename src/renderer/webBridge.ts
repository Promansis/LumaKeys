import { RPC_BRIDGE_METHOD_SET, WEB_STUB_BRIDGE_METHOD_SET } from '../shared/bridgeMethods';
import {
  buildInstrumentSamplePackStatuses,
  getInstrumentSamplePackDefinition,
  isValidPackManifest,
} from '../lib/audio/instrumentSamplePacks';
import { resolvePublicAssetUrl } from '../lib/audio/publicAssetUrl';
import { navigateToLogin } from './loginRedirect';
import type {
  AppBridge,
  ImportProgressEvent,
  ImportResult,
  InstalledInstrumentSamplePackRecord,
  InstrumentSamplePackManifest,
  ReattachMidiResult,
  ResolvedInstrumentSampleSource,
} from '../shared/ipc';
import type { LibraryBackup, LibraryExportResult, LibraryImportResult } from '../shared/dbTypes';

const WEB_PACK_DB_NAME = 'lumakeys-instrument-sample-packs';
const WEB_PACK_DB_VERSION = 1;
const WEB_PACK_OBJECT_STORE = 'packs';

interface StoredWebInstrumentPack {
  instrumentId: string;
  packLabel: string;
  version: string;
  installedAt: string;
  sourceName: string;
  licenseLabel: string;
  attributionUrl: string;
  assets: Array<{
    note: string;
    fileName: string;
    blob: Blob;
  }>;
}

const objectUrlCache = new Map<string, string[]>();
const importProgressListeners = new Set<(event: ImportProgressEvent) => void>();
let loginRedirectStarted = false;

/**
 * fetch for /api/* routes. With the server's token gate on, a browser without the
 * session cookie gets 401 from every call; the first one sends it to the sign-in page.
 * Not from /login itself: without the gate that path is the app, and a 401 from a proxy
 * would otherwise loop.
 */
async function apiFetch(...args: Parameters<typeof fetch>): Promise<Response> {
  const response = await fetch(...args);
  if (response.status === 401 && !loginRedirectStarted && window.location.pathname !== '/login') {
    loginRedirectStarted = true;
    navigateToLogin();
  }
  return response;
}

async function parseRpcResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json() as { error?: string };
      if (body.error) {
        message = body.error;
      }
    } catch {
      // Fall back to the HTTP status message.
    }
    throw new Error(message);
  }

  const payload = await response.json() as { result: T };
  return payload.result;
}

async function callRpc(method: string, args: unknown[]): Promise<unknown> {
  const response = await apiFetch(`/api/bridge/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ args }),
  });
  return parseRpcResponse(response);
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function pickFiles(options: { accept: string; multiple: boolean }): Promise<File[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.accept;
    input.multiple = options.multiple;
    input.style.display = 'none';

    let settled = false;
    const cleanup = () => {
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      input.remove();
    };

    const settle = (files: File[] | null, error?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error !== undefined) {
        reject(error);
      } else {
        resolve(files ?? []);
      }
    };
    const onChange = () => settle(Array.from(input.files ?? []));
    const onCancel = () => settle([]);

    // Window focus can return before the picker delivers the selected files.
    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    try {
      document.body.append(input);
      input.click();
    } catch (error) {
      settle(null, error);
    }
  });
}

async function uploadMidiFiles(
  files: File[],
  url: string,
  onProgress?: (current: number, total: number, filename: string) => void,
): Promise<ImportResult> {
  const songs: ImportResult['songs'] = [];
  const errors: ImportResult['errors'] = [];
  let skipped = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filename = file.name.replace(/\.(mid|midi|mscz)$/i, '') || 'Untitled';
    const event = { current: i + 1, total: files.length, filename };
    onProgress?.(event.current, event.total, event.filename);
    importProgressListeners.forEach((listener) => listener(event));

    const formData = new FormData();
    formData.append('files', file);
    try {
      const response = await apiFetch(url, { method: 'POST', body: formData });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: `Status ${response.status}` }));
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Upload failed.');
      }
      const batch = await response.json() as ImportResult;
      songs.push(...batch.songs);
      errors.push(...batch.errors);
      skipped += batch.skipped ?? 0;
    } catch (error) {
      errors.push({ filename, message: (error as Error).message });
    }
  }

  return { songs, errors, skipped };
}

function revokeObjectUrls(instrumentId: string): void {
  const cachedUrls = objectUrlCache.get(instrumentId);
  if (!cachedUrls) {
    return;
  }
  for (const url of cachedUrls) {
    URL.revokeObjectURL(url);
  }
  objectUrlCache.delete(instrumentId);
}

function openPackDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(WEB_PACK_DB_NAME, WEB_PACK_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WEB_PACK_OBJECT_STORE)) {
        db.createObjectStore(WEB_PACK_OBJECT_STORE, { keyPath: 'instrumentId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open the instrument pack database.'));
  });
}

async function withPackStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await openPackDatabase();
  try {
    const tx = db.transaction(WEB_PACK_OBJECT_STORE, mode);
    const store = tx.objectStore(WEB_PACK_OBJECT_STORE);
    const result = await run(store);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction was aborted.'));
    });
    return result;
  } finally {
    db.close();
  }
}

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

async function getStoredWebInstrumentPacks(): Promise<Record<string, StoredWebInstrumentPack>> {
  return withPackStore('readonly', async (store) => {
    const records = await readRequest(store.getAll() as IDBRequest<StoredWebInstrumentPack[]>);
    return Object.fromEntries(records.map((record) => [record.instrumentId, record]));
  });
}

async function putStoredWebInstrumentPack(record: StoredWebInstrumentPack): Promise<void> {
  await withPackStore('readwrite', async (store) => {
    await readRequest(store.put(record));
  });
}

async function deleteStoredWebInstrumentPack(instrumentId: string): Promise<void> {
  await withPackStore('readwrite', async (store) => {
    await readRequest(store.delete(instrumentId));
  });
}

function clearWebInstrumentPackDatabase(): Promise<void> {
  for (const instrumentId of objectUrlCache.keys()) {
    revokeObjectUrls(instrumentId);
  }
  if (!window.indexedDB) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.deleteDatabase(WEB_PACK_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Unable to clear instrument sample packs.'));
    request.onblocked = () => reject(new Error('Unable to clear instrument sample packs because the store is busy.'));
  });
}

function toInstalledRecordMap(
  packs: Record<string, StoredWebInstrumentPack>,
): Record<string, InstalledInstrumentSamplePackRecord> {
  return Object.fromEntries(
    Object.values(packs).map((pack) => [
      pack.instrumentId,
      {
        instrumentId: pack.instrumentId,
        packLabel: pack.packLabel,
        version: pack.version,
        installedAt: pack.installedAt,
        urls: {},
        baseUrl: null,
      },
    ]),
  );
}

async function fetchPackManifest(instrumentId: string): Promise<InstrumentSamplePackManifest> {
  const definition = getInstrumentSamplePackDefinition(instrumentId);
  if (!definition?.manifestPath) {
    throw new Error('This pack can only be installed from the desktop app.');
  }

  const response = await fetch(resolvePublicAssetUrl(definition.manifestPath));
  if (!response.ok) {
    throw new Error(`Unable to load the ${definition.packLabel} manifest.`);
  }

  const manifest = await response.json() as unknown;
  if (!isValidPackManifest(manifest)) {
    throw new Error(`Invalid sample pack manifest for ${instrumentId}.`);
  }

  return manifest;
}

async function installManagedWebInstrumentPack(instrumentId: string): Promise<Record<string, StoredWebInstrumentPack>> {
  const manifest = await fetchPackManifest(instrumentId);
  const assets = await Promise.all(
    manifest.assets.map(async (asset) => {
      const response = await fetch(resolvePublicAssetUrl(asset.url));
      if (!response.ok) {
        throw new Error(`Unable to download ${asset.fileName} for ${manifest.packLabel}.`);
      }
      return {
        note: asset.note,
        fileName: asset.fileName,
        blob: await response.blob(),
      };
    }),
  );

  await putStoredWebInstrumentPack({
    instrumentId: manifest.instrumentId,
    packLabel: manifest.packLabel,
    version: manifest.version,
    installedAt: new Date().toISOString(),
    sourceName: manifest.sourceName,
    licenseLabel: manifest.licenseLabel,
    attributionUrl: manifest.attributionUrl,
    assets,
  });

  return getStoredWebInstrumentPacks();
}

async function resolveStoredWebInstrumentPack(
  instrumentId: string,
): Promise<ResolvedInstrumentSampleSource | null> {
  const packs = await getStoredWebInstrumentPacks();
  const pack = packs[instrumentId];
  if (!pack) {
    return null;
  }

  revokeObjectUrls(instrumentId);
  const urls: Record<string, string> = {};
  const createdUrls: string[] = [];
  for (const asset of pack.assets) {
    const objectUrl = URL.createObjectURL(asset.blob);
    createdUrls.push(objectUrl);
    urls[asset.note] = objectUrl;
  }
  objectUrlCache.set(instrumentId, createdUrls);

  return {
    instrumentId,
    source: 'enhanced',
    urls,
    baseUrl: null,
    packLabel: pack.packLabel,
  };
}

export const webBridge = new Proxy({} as AppBridge, {
  get(_target, property) {
    if (typeof property !== 'string') {
      return undefined;
    }

    if (property === 'loadMidiFileData') {
      return async (songId: string): Promise<Uint8Array> => {
        const response = await apiFetch(`/api/midi/${encodeURIComponent(songId)}`);
        if (!response.ok) {
          throw new Error(`Unable to load MIDI: ${response.status}`);
        }
        return new Uint8Array(await response.arrayBuffer());
      };
    }

    if (property === 'loadCurriculumMidi') {
      return async (filename: string): Promise<Uint8Array> => {
        const response = await fetch(resolvePublicAssetUrl(`/curriculum-midis/${encodeURIComponent(filename)}`));
        if (!response.ok) {
          throw new Error(`Unable to load curriculum MIDI: ${response.status}`);
        }
        return new Uint8Array(await response.arrayBuffer());
      };
    }

    if (property === 'importMidiFiles') {
      return async (): Promise<ImportResult> => {
        const files = await pickFiles({ accept: '.mid,.midi,.mscz', multiple: true });
        if (files.length === 0) {
          return { songs: [], errors: [], skipped: 0 };
        }
        return uploadMidiFiles(files, '/api/midi/upload');
      };
    }

    if (property === 'reattachMidiFile') {
      return async (songId: string): Promise<ReattachMidiResult> => {
        const files = await pickFiles({ accept: '.mid,.midi', multiple: false });
        if (files.length === 0) {
          return { reattached: [], errors: [], skipped: 0 };
        }

        const result = await uploadMidiFiles(
          files.slice(0, 1),
          `/api/midi/${encodeURIComponent(songId)}/reattach`,
        );
        return {
          reattached: result.songs,
          skipped: result.skipped,
          errors: result.errors,
        };
      };
    }

    if (property === 'exportLibrary') {
      return async (): Promise<LibraryExportResult> => {
        const response = await apiFetch('/api/library/export');
        if (!response.ok) {
          let message = `Export failed with status ${response.status}`;
          try {
            const body = await response.json() as { error?: string };
            message = body.error ?? message;
          } catch {
            // Fall back to the HTTP status message.
          }
          throw new Error(message);
        }
        const payload = await response.json() as { backup: LibraryBackup; result: LibraryExportResult };
        downloadJson(payload.result.filename, payload.backup);
        return payload.result;
      };
    }

    if (property === 'importLibrary') {
      return async (): Promise<LibraryImportResult | null> => {
        const [file] = await pickFiles({ accept: 'application/json,.json', multiple: false });
        if (!file) {
          return null;
        }

        const backup = JSON.parse(await file.text()) as unknown;
        const response = await apiFetch('/api/library/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(backup),
        });
        return parseRpcResponse<LibraryImportResult>(response);
      };
    }

    if (property === 'resetUserData') {
      return async (): Promise<null> => {
        const result = await callRpc('resetUserData', []) as null;
        window.localStorage.clear();
        await clearWebInstrumentPackDatabase();
        return result;
      };
    }

    if (property === 'onImportProgress') {
      return (cb: (event: ImportProgressEvent) => void) => {
        importProgressListeners.add(cb);
        return () => importProgressListeners.delete(cb);
      };
    }

    if (property === 'listAudioFiles') {
      return async (): Promise<string[]> => [];
    }

    if (property === 'getInstrumentSamplePackStatuses') {
      return async () => buildInstrumentSamplePackStatuses('web', toInstalledRecordMap(await getStoredWebInstrumentPacks()));
    }

    if (property === 'installInstrumentSamplePack') {
      return async (instrumentId: string) =>
        buildInstrumentSamplePackStatuses('web', toInstalledRecordMap(await installManagedWebInstrumentPack(instrumentId)));
    }

    if (property === 'removeInstrumentSamplePack') {
      return async (instrumentId: string) => {
        revokeObjectUrls(instrumentId);
        await deleteStoredWebInstrumentPack(instrumentId);
        return buildInstrumentSamplePackStatuses('web', toInstalledRecordMap(await getStoredWebInstrumentPacks()));
      };
    }

    if (property === 'resolveInstrumentSampleSource') {
      return async (instrumentId: string) => resolveStoredWebInstrumentPack(instrumentId);
    }

    if (WEB_STUB_BRIDGE_METHOD_SET.has(property)) {
      return async (): Promise<null> => null;
    }

    if (RPC_BRIDGE_METHOD_SET.has(property)) {
      return async (...args: unknown[]) => callRpc(property, args);
    }

    return undefined;
  },
});
