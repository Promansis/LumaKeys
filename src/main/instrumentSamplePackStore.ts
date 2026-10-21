import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { AppDatabase } from '../persistence/database';
import type { ResetOperation } from '../persistence/crossStoreMutations';
import type {
  InstalledInstrumentSamplePackRecord,
  InstrumentSamplePackManifest,
  InstrumentSamplePackStatus,
  ResolvedInstrumentSampleSource,
} from '../shared/ipc';
import {
  buildInstrumentSamplePackStatuses,
  createUrlsFromFilenames,
  getInstrumentSamplePackDefinition,
  INSTALLED_INSTRUMENT_SAMPLE_PACKS_SETTING_KEY,
  isValidPackManifest,
  parseInstalledInstrumentSamplePacks,
  resolveInstalledInstrumentSampleSource,
} from '../lib/audio/instrumentSamplePacks';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a']);

function listAudioFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((file) => {
      const lower = file.toLowerCase();
      return AUDIO_EXTENSIONS.has(lower.slice(lower.lastIndexOf('.')));
    });
  } catch {
    return [];
  }
}

function getInstalledPacks(db: AppDatabase): Record<string, InstalledInstrumentSamplePackRecord> {
  return parseInstalledInstrumentSamplePacks(db.getSetting('audio', INSTALLED_INSTRUMENT_SAMPLE_PACKS_SETTING_KEY));
}

function saveInstalledPacks(
  db: AppDatabase,
  installedPacks: Record<string, InstalledInstrumentSamplePackRecord>,
): void {
  db.setSetting('audio', INSTALLED_INSTRUMENT_SAMPLE_PACKS_SETTING_KEY, JSON.stringify(installedPacks));
}

function getInstrumentSamplePackDir(userDataPath: string, instrumentId: string): string {
  if (!getInstrumentSamplePackDefinition(instrumentId)) {
    throw new Error(`No sample pack is configured for instrument: ${instrumentId}`);
  }

  const root = resolve(userDataPath, 'instrument-sample-packs');
  const destination = resolve(root, instrumentId);
  const relativePath = relative(root, destination);
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Invalid sample pack path for instrument: ${instrumentId}`);
  }
  return destination;
}

/** The `file:` base URL the renderer's sampler loads a desktop pack from. */
function desktopPackBaseUrl(packDir: string): string {
  return `file:///${packDir.replace(/\\/g, '/').replace(/\/?$/, '/')}`;
}

function resolveBundledFilePath(assetRoot: string, assetPath: string): string {
  const relativePath = assetPath.replace(/^\//, '');
  const absolutePath = join(assetRoot, relativePath);
  if (existsSync(absolutePath)) {
    return absolutePath;
  }
  throw new Error(`Bundled asset not found: ${assetPath}`);
}

function loadBundledManifest(assetRoot: string, manifestPath: string): InstrumentSamplePackManifest {
  const manifestFile = resolveBundledFilePath(assetRoot, manifestPath);
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) as unknown;
  if (!isValidPackManifest(manifest)) {
    throw new Error(`Invalid bundled sample pack manifest: ${manifestPath}`);
  }
  return manifest;
}

function installManagedDesktopInstrumentSamplePack(
  db: AppDatabase,
  userDataPath: string,
  assetRoot: string,
  instrumentId: string,
  manifestPath: string,
): InstrumentSamplePackStatus[] {
  const manifest = loadBundledManifest(assetRoot, manifestPath);
  const destinationDir = getInstrumentSamplePackDir(userDataPath, instrumentId);
  rmSync(destinationDir, { recursive: true, force: true });
  mkdirSync(destinationDir, { recursive: true });

  for (const asset of manifest.assets) {
    const sourceFile = resolveBundledFilePath(assetRoot, asset.url);
    copyFileSync(sourceFile, join(destinationDir, asset.fileName));
  }

  const installedPacks = getInstalledPacks(db);
  installedPacks[instrumentId] = {
    instrumentId,
    packLabel: manifest.packLabel,
    version: manifest.version,
    installedAt: new Date().toISOString(),
    baseUrl: desktopPackBaseUrl(destinationDir),
    urls: Object.fromEntries(manifest.assets.map((asset) => [asset.note, asset.fileName])),
  };
  saveInstalledPacks(db, installedPacks);
  return buildInstrumentSamplePackStatuses('desktop', installedPacks);
}

function installManualDesktopInstrumentSamplePack(
  db: AppDatabase,
  userDataPath: string,
  instrumentId: string,
  sourceDir: string,
): InstrumentSamplePackStatus[] {
  const definition = getInstrumentSamplePackDefinition(instrumentId);
  if (!definition) {
    throw new Error(`No sample pack is configured for instrument: ${instrumentId}`);
  }

  const files = listAudioFiles(sourceDir);
  const urls = createUrlsFromFilenames(files);
  if (Object.keys(urls).length === 0) {
    throw new Error('No compatible audio files were found in the selected directory.');
  }

  const destinationDir = getInstrumentSamplePackDir(userDataPath, instrumentId);
  rmSync(destinationDir, { recursive: true, force: true });
  mkdirSync(destinationDir, { recursive: true });

  for (const file of files) {
    copyFileSync(join(sourceDir, file), join(destinationDir, file));
  }

  const installedPacks = getInstalledPacks(db);
  installedPacks[instrumentId] = {
    instrumentId,
    packLabel: definition.packLabel,
    version: 'manual',
    installedAt: new Date().toISOString(),
    baseUrl: desktopPackBaseUrl(destinationDir),
    urls,
  };
  saveInstalledPacks(db, installedPacks);
  return buildInstrumentSamplePackStatuses('desktop', installedPacks);
}

export function getDesktopInstrumentSamplePackStatuses(db: AppDatabase): InstrumentSamplePackStatus[] {
  return buildInstrumentSamplePackStatuses('desktop', getInstalledPacks(db));
}

/**
 * The stored `baseUrl` is the absolute pack directory at install time, which goes stale
 * when the profile moves (for example by the legacy profile migration). The pack always
 * lives in the current profile, so the URL is derived from `userDataPath` on each read.
 */
export function resolveDesktopInstrumentSampleSource(
  db: AppDatabase,
  userDataPath: string,
  instrumentId: string,
): ResolvedInstrumentSampleSource | null {
  const source = resolveInstalledInstrumentSampleSource(getInstalledPacks(db), instrumentId);
  if (!source || !getInstrumentSamplePackDefinition(instrumentId)) {
    return source;
  }
  return { ...source, baseUrl: desktopPackBaseUrl(getInstrumentSamplePackDir(userDataPath, instrumentId)) };
}

export function installDesktopInstrumentSamplePack(
  db: AppDatabase,
  userDataPath: string,
  assetRoot: string,
  instrumentId: string,
  sourceDir?: string,
): InstrumentSamplePackStatus[] {
  const definition = getInstrumentSamplePackDefinition(instrumentId);
  if (!definition) {
    throw new Error(`No sample pack is configured for instrument: ${instrumentId}`);
  }

  if (definition.installMode === 'managed') {
    if (!definition.manifestPath) {
      throw new Error(`Managed pack manifest missing for ${instrumentId}.`);
    }
    return installManagedDesktopInstrumentSamplePack(db, userDataPath, assetRoot, instrumentId, definition.manifestPath);
  }

  if (!sourceDir) {
    throw new Error(`A source directory is required to install the ${definition.packLabel}.`);
  }

  return installManualDesktopInstrumentSamplePack(db, userDataPath, instrumentId, sourceDir);
}

export function removeDesktopInstrumentSamplePack(
  db: AppDatabase,
  userDataPath: string,
  instrumentId: string,
): InstrumentSamplePackStatus[] {
  const destinationDir = getInstrumentSamplePackDir(userDataPath, instrumentId);
  const installedPacks = getInstalledPacks(db);
  const previousRecord = installedPacks[instrumentId];
  const removalDir = resolve(userDataPath, `.remove-${instrumentId}-${randomUUID()}`);
  if (!removalDir.startsWith(resolve(userDataPath))) {
    throw new Error(`Invalid sample pack removal path for instrument: ${instrumentId}`);
  }

  const hadPack = existsSync(destinationDir);
  if (hadPack) {
    renameSync(destinationDir, removalDir);
  }

  delete installedPacks[instrumentId];
  try {
    saveInstalledPacks(db, installedPacks);
  } catch (error) {
    if (hadPack && !existsSync(destinationDir) && existsSync(removalDir)) {
      renameSync(removalDir, destinationDir);
    }
    installedPacks[instrumentId] = previousRecord;
    try {
      saveInstalledPacks(db, installedPacks);
    } catch {
      // ponytail: metadata rollback already reported; last-known state is best-effort
    }
    throw error;
  }

  try {
    rmSync(removalDir, { recursive: true, force: true });
  } catch (error) {
    installedPacks[instrumentId] = previousRecord;
    try {
      if (hadPack && !existsSync(destinationDir) && existsSync(removalDir)) {
        renameSync(removalDir, destinationDir);
      }
      saveInstalledPacks(db, installedPacks);
    } catch {
      // ponytail: filesystem/metadata rollback failure; owner may need manual recovery
    }
    throw new Error(`Failed to remove sample pack files: ${(error as Error).message}`);
  }

  return buildInstrumentSamplePackStatuses('desktop', installedPacks);
}

function getPackResetBackupPath(userDataPath: string, operationId: string): string {
  return resolve(userDataPath, `.instrument-sample-packs-reset-${operationId}`);
}

export function prepareDesktopInstrumentSamplePackReset(userDataPath: string, operationId: string): ResetOperation {
  const packRoot = resolve(userDataPath, 'instrument-sample-packs');
  if (!existsSync(packRoot)) {
    return { commit: () => undefined, rollback: () => undefined };
  }

  const backupRoot = getPackResetBackupPath(userDataPath, operationId || randomUUID());
  renameSync(packRoot, backupRoot);
  return {
    commit: () => rmSync(backupRoot, { recursive: true, force: true }),
    rollback: () => {
      rmSync(packRoot, { recursive: true, force: true });
      renameSync(backupRoot, packRoot);
    },
  };
}

export async function recoverDesktopInstrumentSamplePackReset(
  userDataPath: string,
  operationId: string,
  state: 'prepared' | 'db-committed',
): Promise<void> {
  const packRoot = resolve(userDataPath, 'instrument-sample-packs');
  const backupRoot = getPackResetBackupPath(userDataPath, operationId);
  if (state === 'prepared') {
    if (existsSync(backupRoot)) {
      rmSync(packRoot, { recursive: true, force: true });
      renameSync(backupRoot, packRoot);
    }
    return;
  }
  rmSync(backupRoot, { recursive: true, force: true });
}
