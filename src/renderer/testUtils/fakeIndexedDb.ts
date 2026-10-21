// Small in-memory IndexedDB for unit tests. It models only what webBridge uses:
// versioned databases, keyPath object stores, request/transaction events, an
// abortable upgrade transaction, and a synchronous DataError from `put` when the
// key path yields no key.

type Handler = ((event?: unknown) => void) | null;

function fakeEvent(target: unknown): unknown {
  return { target, preventDefault: () => undefined };
}

function later(callback: () => void): void {
  setTimeout(callback, 0);
}

class FakeRequest<T = unknown> {
  result: T = undefined as T;
  error: DOMException | null = null;
  transaction: FakeTransaction | null = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onblocked: Handler = null;
  onupgradeneeded: Handler = null;
}

interface FakeStoreData {
  keyPath: string;
  records: Map<unknown, unknown>;
}

interface FakeDatabaseData {
  version: number;
  stores: Map<string, FakeStoreData>;
  connections: number;
}

class FakeObjectStore {
  constructor(
    private readonly data: FakeStoreData,
    private readonly transaction: FakeTransaction,
  ) {}

  private request<T>(run: () => T): FakeRequest<T> {
    const request = new FakeRequest<T>();
    this.transaction.track(request, () => {
      request.result = run();
    });
    return request;
  }

  getAll(): FakeRequest<unknown[]> {
    return this.request(() => [...this.data.records.values()]);
  }

  count(): FakeRequest<number> {
    return this.request(() => this.data.records.size);
  }

  put(value: unknown): FakeRequest<unknown> {
    this.transaction.assertWritable();
    const key = (value as Record<string, unknown> | null)?.[this.data.keyPath];
    if (key === undefined) {
      // Real IndexedDB throws this synchronously, before any request is queued.
      throw new DOMException('The key path yielded no key.', 'DataError');
    }
    return this.request(() => {
      this.data.records.set(key, value);
      return key;
    });
  }

  delete(key: unknown): FakeRequest<undefined> {
    return this.request(() => {
      this.transaction.assertWritable();
      this.data.records.delete(key);
      return undefined;
    });
  }
}

class FakeTransaction {
  error: DOMException | null = null;
  oncomplete: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  aborted = false;
  private pending = 0;
  private finished = false;
  private readonly snapshot: Map<string, Map<unknown, unknown>>;

  constructor(
    private readonly database: FakeDatabaseData,
    private readonly mode: IDBTransactionMode,
    private readonly storeNames: string[],
    autoComplete: boolean,
  ) {
    this.snapshot = new Map(
      [...database.stores].map(([name, store]) => [name, new Map(store.records)]),
    );
    if (autoComplete) {
      this.scheduleFinish();
    }
  }

  assertWritable(): void {
    if (this.mode === 'readonly') {
      throw new DOMException('Transaction is read-only.', 'ReadOnlyError');
    }
  }

  objectStore(name: string): FakeObjectStore {
    const data = this.database.stores.get(name);
    if (!data || !this.storeNames.includes(name)) {
      throw new DOMException(`No object store ${name}.`, 'NotFoundError');
    }
    return new FakeObjectStore(data, this);
  }

  track<T>(request: FakeRequest<T>, run: () => void): void {
    this.pending += 1;
    later(() => {
      try {
        if (this.aborted) {
          throw new DOMException('The transaction was aborted.', 'AbortError');
        }
        run();
        request.onsuccess?.(fakeEvent(request));
      } catch (error) {
        request.error = error as DOMException;
        request.onerror?.(fakeEvent(request));
        this.abort();
      } finally {
        this.pending -= 1;
        this.scheduleFinish();
      }
    });
  }

  abort(): void {
    if (this.aborted || this.finished) {
      return;
    }
    this.aborted = true;
    for (const [name, records] of this.snapshot) {
      const store = this.database.stores.get(name);
      if (store) {
        store.records = new Map(records);
      }
    }
    this.finished = true;
    later(() => this.onabort?.(fakeEvent(this)));
  }

  private scheduleFinish(): void {
    later(() => {
      if (this.finished || this.pending > 0) {
        return;
      }
      this.finished = true;
      this.oncomplete?.(fakeEvent(this));
    });
  }

  // Marks an upgrade transaction done without firing `complete`; the open request reports it.
  settleUpgrade(): void {
    this.finished = true;
  }
}

class FakeConnection {
  private closed = false;
  readonly objectStoreNames: { contains: (name: string) => boolean };

  constructor(
    private readonly database: FakeDatabaseData,
    private readonly upgrade: FakeTransaction | null,
  ) {
    database.connections += 1;
    this.objectStoreNames = { contains: (name) => database.stores.has(name) };
  }

  createObjectStore(name: string, options: { keyPath: string }): FakeObjectStore {
    if (!this.upgrade) {
      throw new DOMException('Not in an upgrade transaction.', 'InvalidStateError');
    }
    const data: FakeStoreData = { keyPath: options.keyPath, records: new Map() };
    this.database.stores.set(name, data);
    return new FakeObjectStore(data, this.upgrade);
  }

  transaction(storeNames: string | string[], mode: IDBTransactionMode = 'readonly'): FakeTransaction {
    if (this.closed) {
      throw new DOMException('The connection is closed.', 'InvalidStateError');
    }
    return new FakeTransaction(this.database, mode, Array.isArray(storeNames) ? storeNames : [storeNames], true);
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.database.connections -= 1;
    }
  }
}

export class FakeIndexedDb {
  private readonly databases = new Map<string, FakeDatabaseData>();

  has(name: string): boolean {
    return this.databases.has(name);
  }

  /** Test setup: creates a database with one keyPath store and the given records. */
  seed(name: string, storeName: string, keyPath: string, records: unknown[], version = 1): void {
    this.databases.set(name, {
      version,
      stores: new Map([
        [storeName, { keyPath, records: new Map(records.map((record) => [(record as Record<string, unknown>)[keyPath], record])) }],
      ]),
      connections: 0,
    });
  }

  /** Test inspection: the records now in a store, or null when the database is absent. */
  read(name: string, storeName: string): unknown[] | null {
    return this.databases.get(name)?.stores.get(storeName)
      ? [...this.databases.get(name)!.stores.get(storeName)!.records.values()]
      : null;
  }

  open(name: string, version?: number): FakeRequest<FakeConnection> {
    const request = new FakeRequest<FakeConnection>();
    later(() => {
      const existing = this.databases.get(name);
      if (existing && version !== undefined && version < existing.version) {
        request.error = new DOMException('Requested version is lower.', 'VersionError');
        request.onerror?.(fakeEvent(request));
        return;
      }
      const needsUpgrade = !existing || (version !== undefined && version > existing.version);
      const database = existing ?? { version: 0, stores: new Map(), connections: 0 };
      if (!needsUpgrade) {
        request.result = new FakeConnection(database, null);
        request.onsuccess?.(fakeEvent(request));
        return;
      }

      database.version = version ?? 1;
      if (!existing) {
        this.databases.set(name, database);
      }
      const upgrade = new FakeTransaction(database, 'versionchange', [], false);
      const connection = new FakeConnection(database, upgrade);
      request.result = connection;
      request.transaction = upgrade;
      request.onupgradeneeded?.(fakeEvent(request));
      if (upgrade.aborted) {
        connection.close();
        if (!existing) {
          this.databases.delete(name);
        }
        request.error = new DOMException('The upgrade transaction was aborted.', 'AbortError');
        request.onerror?.(fakeEvent(request));
        return;
      }
      upgrade.settleUpgrade();
      request.onsuccess?.(fakeEvent(request));
    });
    return request;
  }

  deleteDatabase(name: string): FakeRequest<undefined> {
    const request = new FakeRequest<undefined>();
    later(() => {
      const existing = this.databases.get(name);
      if (existing && existing.connections > 0) {
        request.onblocked?.(fakeEvent(request));
        return;
      }
      this.databases.delete(name);
      request.onsuccess?.(fakeEvent(request));
    });
    return request;
  }
}
