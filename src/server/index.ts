import { serve } from '@hono/node-server';
import { mkdirSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Hono } from 'hono';
import { AppDatabase } from '../persistence/database';
import { migrateLegacyBrand } from '../persistence/legacyBrandMigration';
import { FileSystemMidiStorageAdapter } from '../storage/midiStorage';
import { createBridgeRouter } from './bridgeRouter';
import { createLibraryRouter } from './libraryRouter';
import { createMidiRouter } from './midiRouter';
import { createStaticFileHandler } from './staticFiles';
import { createApiAccessGate } from './webSecurity';

/** New env first, legacy env as a one-release fallback. */
function resolveAccessToken(): string | undefined {
  return process.env.LUMAKEYS_WEB_ACCESS_TOKEN ?? process.env.PIANOHERO_WEB_ACCESS_TOKEN;
}

/** Legacy-first env precedence so a pre-rename deployment keeps its data during one release. */
function resolveDataDir(): string {
  const explicit = process.env.LUMAKEYS_DATA_DIR;
  if (explicit && explicit.trim()) {
    return resolve(explicit);
  }
  const legacyEnv = process.env.PIANOHERO_DATA_DIR;
  if (legacyEnv && legacyEnv.trim()) {
    return resolve(legacyEnv);
  }
  if (existsSync(join(process.cwd(), '.lumakeys-data'))) {
    return resolve('.lumakeys-data');
  }
  if (existsSync(join(process.cwd(), '.pianohero-data'))) {
    return resolve('.pianohero-data');
  }
  return resolve('.lumakeys-data');
}

async function startServer(): Promise<void> {
  const port = Number(process.env.PORT ?? 3100);
  const dataDir = resolveDataDir();
  const midiFilesDir = join(dataDir, 'midi-files');
  const dbPath = join(dataDir, 'lumakeys.db');
  const webRoot = resolve(process.cwd(), 'dist', 'web');

  migrateLegacyBrand({ destinationDir: dataDir });

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(midiFilesDir, { recursive: true });

  const db = new AppDatabase(dbPath);
  const midiStorage = new FileSystemMidiStorageAdapter(midiFilesDir);
  await db.migrateFromJson(dataDir, midiStorage);
  await db.recoverDurableOperations(midiStorage);
  const app = new Hono();

  app.onError((error, c) => c.json({ error: error.message }, 500));

  app.use('*', async (c, next) => {
    c.header('Permissions-Policy', 'midi=(self)');
    await next();
  });

  app.use('/api/*', createApiAccessGate(resolveAccessToken()));
  app.get('/api/access', (c) => c.json({ ok: true }));

  app.route('/api/bridge', createBridgeRouter({ db, midiFilesDir, midiStorage }));
  app.route('/api/library', createLibraryRouter({ db, midiFilesDir, midiStorage }));
  app.route('/api/midi', createMidiRouter({ db, midiFilesDir, midiStorage }));

  app.get('*', createStaticFileHandler(webRoot));

  const server = serve({
    fetch: app.fetch,
    port,
  });

  process.on('SIGINT', () => {
    db.close();
    server.close();
  });

  process.on('SIGTERM', () => {
    db.close();
    server.close();
  });
}

startServer().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
