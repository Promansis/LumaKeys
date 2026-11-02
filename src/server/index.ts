import { serve } from '@hono/node-server';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Hono } from 'hono';
import { AppDatabase } from '../persistence/database';
import { dataLocationLine, legacyNamesWarning, migrateLegacyBrand } from '../persistence/legacyBrandMigration';
import { FileSystemMidiStorageAdapter } from '../storage/midiStorage';
import { createBridgeRouter } from './bridgeRouter';
import { resolveDataDir } from './dataDir';
import { createLibraryRouter } from './libraryRouter';
import { createMidiRouter } from './midiRouter';
import { createStaticFileHandler } from './staticFiles';
import { htmlSecurityHeaders, installWebAccess, resolveWebAccessPolicy } from './webSecurity';

async function startServer(): Promise<void> {
  // Checked before any data is touched: no gate and no upstream trust means no server.
  const accessPolicy = resolveWebAccessPolicy(process.env);
  if (accessPolicy.mode === 'trust-upstream') {
    console.warn('LUMAKEYS_TRUST_UPSTREAM_AUTH=1: /api/* has no app-level gate. Cloudflare Access or another login must protect this host.');
  }

  const port = Number(process.env.PORT ?? 3100);
  // Throws on a relative LUMAKEYS_DATA_DIR before anything is created.
  const { dataDir, legacyNames } = resolveDataDir(process.env);
  const midiFilesDir = join(dataDir, 'midi-files');
  const dbPath = join(dataDir, 'lumakeys.db');
  const webRoot = resolve(process.cwd(), 'dist', 'web');

  // legacy-brand: remove in 0.3.0 (ADR 0002). Carries a pre-rename data directory over.
  const migration = migrateLegacyBrand({ destinationDir: dataDir });
  console.log(dataLocationLine(dataDir, legacyNames.length > 0 || migration.migrated));
  // Names only: the token variable's value never reaches the log.
  const legacyWarning = legacyNamesWarning([
    ...legacyNames,
    ...(accessPolicy.mode === 'token' && accessPolicy.legacyVariable ? [accessPolicy.legacyVariable] : []),
  ]);
  if (legacyWarning) {
    console.warn(legacyWarning);
  }

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
  app.use('*', htmlSecurityHeaders());

  installWebAccess(app, accessPolicy);

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
