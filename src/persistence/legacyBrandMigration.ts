// Shared Node-side helper to carry a legacy `pianohero` data set into the
// current `lumakeys` layout. Used by Electron main and the web server before
// `new AppDatabase(...)`. Old brand names survive only inside this module and
// its tests.

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** What the user picked when an earlier library and a current one both hold data. */
export type LegacyLibraryChoice = 'use-legacy' | 'keep-current' | 'quit';

export interface LegacyLibraryConflict {
  /** Directory holding the earlier `pianohero.db`. */
  legacyDir: string;
  /** Directory whose `lumakeys.db` already holds user data. */
  destinationDir: string;
}

export interface LegacyBrandMigrationOptions {
  /** The final data directory the app will open (e.g. `${userData}` or `${dataDir}`). */
  destinationDir: string;
  /** Legacy Electron profile directories from released builds (see `legacyProfileDirs`). */
  legacyDirs?: string[];
  /** Asked before a destination with user data is replaced. Without it the migration refuses. */
  chooseOnConflict?: (conflict: LegacyLibraryConflict) => LegacyLibraryChoice;
  /** Clock for the backup directory name. */
  now?: () => Date;
}

export interface LegacyBrandMigrationResult {
  migrated: boolean;
  messages: string[];
  /** Where entries the migration replaced were kept, when it replaced any. */
  backupDir?: string;
  /** The user chose to quit instead of choosing a library. */
  quit?: boolean;
}

const LEGACY_DB = 'pianohero.db';
const NEW_DB = 'lumakeys.db';
const SIDECARS = ['-wal', '-shm'];

/** Profile directory names released desktop builds used, newest first. */
const LEGACY_PROFILE_NAMES = ['luma-keys', 'piano-hero', 'PianoHero'];

/** App-owned entries that move with a legacy profile. */
const PROFILE_ENTRIES = [
  'midi-files',
  'instrument-sample-packs',
  'song-metadata.json',
  'song-metadata.json.migrated',
  'Local Storage',
];

/** A destination row in any of these means the user has a library worth keeping. */
const USER_ROW_QUERIES: Record<string, string> = {
  songs: 'SELECT 1 FROM songs LIMIT 1',
  game_results: 'SELECT 1 FROM game_results LIMIT 1',
  theory_results: 'SELECT 1 FROM theory_results LIMIT 1',
  practice_days: 'SELECT 1 FROM practice_days LIMIT 1',
  achievements: 'SELECT 1 FROM achievements WHERE unlocked_at IS NOT NULL LIMIT 1',
  folders: 'SELECT 1 FROM folders LIMIT 1',
  playlists: 'SELECT 1 FROM playlists LIMIT 1',
};

const BACKUP_PREFIX = 'before-legacy-migration-';
const CHOICE_FILE = 'legacy-library-choice.json';

/** The profile directories released desktop builds wrote, in lookup order. */
export function legacyProfileDirs(appDataDir: string): string[] {
  return LEGACY_PROFILE_NAMES.map((name) => join(appDataDir, name));
}

function isSameFilesystem(a: string, b: string): boolean {
  return statSync(a).dev === statSync(b).dev;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Folds the WAL into the main file, so the database moves as one file. */
function checkpoint(dbPath: string): void {
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { fileMustExist: true });
    const [result] = db.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy: number }>;
    if (result && result.busy !== 0) {
      throw new Error('it is in use by another program');
    }
  } catch (error) {
    throw new Error(
      `Could not prepare ${dbPath} for the move: ${errorMessage(error)}. Nothing was moved. `
        + 'Close every copy of LumaKeys and start it again.',
    );
  } finally {
    db?.close();
  }
}

function hasUserRows(dbPath: string): boolean {
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { fileMustExist: true });
    const tables = new Set(
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").pluck().all() as string[],
    );
    return Object.entries(USER_ROW_QUERIES).some(
      ([table, sql]) => tables.has(table) && db?.prepare(sql).get() !== undefined,
    );
  } catch (error) {
    throw new Error(`Could not read ${dbPath}: ${errorMessage(error)}. Nothing was moved.`);
  } finally {
    db?.close();
  }
}

function readKeptDirs(destinationDir: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(join(destinationDir, CHOICE_FILE), 'utf8')) as unknown;
    const kept = (parsed as { keepCurrentOver?: unknown }).keepCurrentOver;
    return Array.isArray(kept) ? kept.filter((dir): dir is string => typeof dir === 'string') : [];
  } catch {
    return [];
  }
}

function recordKeptDir(destinationDir: string, keptDirs: string[], dir: string): void {
  const file = join(destinationDir, CHOICE_FILE);
  writeFileSync(`${file}.tmp`, JSON.stringify({ keepCurrentOver: [...keptDirs, dir] }, null, 2));
  renameSync(`${file}.tmp`, file);
}

/**
 * Earlier builds renamed the SQLite set one file at a time, main database first. A
 * `lumakeys.db` with a sidecar missing, while a `pianohero.db` sidecar is left beside it
 * or in a legacy profile that no longer holds `pianohero.db`, is such a stopped move:
 * attach the sidecar. A left-over WAL older than the database stays where it is, since
 * the database was written after it and the WAL no longer belongs to it.
 */
function finishInterruptedDbMove(
  destinationDir: string,
  legacyDirs: string[],
  messages: string[],
): boolean {
  const newDb = join(destinationDir, NEW_DB);
  if (!existsSync(newDb)) {
    return false;
  }
  const leftoverDirs = [destinationDir, ...legacyDirs].filter((dir) => !existsSync(join(dir, LEGACY_DB)));
  const staleDirs = new Set<string>();
  let finished = false;
  for (const suffix of SIDECARS) {
    if (existsSync(newDb + suffix)) {
      continue;
    }
    const sources = leftoverDirs.filter(
      (dir) => !staleDirs.has(dir) && existsSync(join(dir, LEGACY_DB + suffix)),
    );
    if (sources.length === 0) {
      continue;
    }
    if (sources.length > 1) {
      throw new Error(
        `Left-over ${LEGACY_DB}${suffix} files exist in ${sources.join(' and ')}, and LumaKeys cannot tell `
          + `which belongs to ${newDb}. Nothing was moved. Rename the ones you do not need `
          + `(for example to ${LEGACY_DB}${suffix}.old), then start again.`,
      );
    }
    const source = join(sources[0], LEGACY_DB + suffix);
    if (suffix === '-wal' && statSync(newDb).mtimeMs > statSync(source).mtimeMs) {
      staleDirs.add(sources[0]);
      messages.push(`Left ${source} in place: ${newDb} was written after it.`);
      continue;
    }
    renameSync(source, newDb + suffix);
    messages.push(`Finished an interrupted rename: ${source} -> ${newDb + suffix}`);
    finished = true;
  }
  return finished;
}

/** Creates `<destination>/before-legacy-migration-<time>` the first time something must be set aside. */
function backupDirFactory(destinationDir: string, now: () => Date): () => string {
  let dir: string | undefined;
  return () => {
    if (dir) {
      return dir;
    }
    const stamp = now().toISOString().replace(/[:.]/g, '-');
    for (let attempt = 1; ; attempt += 1) {
      const candidate = join(destinationDir, `${BACKUP_PREFIX}${stamp}${attempt > 1 ? `-${attempt}` : ''}`);
      if (!existsSync(candidate)) {
        mkdirSync(candidate);
        dir = candidate;
        return candidate;
      }
    }
  };
}

/**
 * One-release compatibility boundary carrying a legacy `pianohero` profile or
 * database into the current `lumakeys` layout at startup.
 *
 * - Finishes a rename an earlier build left half done.
 * - Takes the one source holding `pianohero.db`: the destination itself, or one
 *   legacy profile. Two or more sources are refused, naming each.
 * - A destination `lumakeys.db` with no user rows is set aside and replaced. One with
 *   user rows needs `chooseOnConflict`; without it the migration refuses.
 * - Checkpoints the legacy database first, moves profile entries, then sidecars, and
 *   the main database last, so a source that still holds `pianohero.db` is an
 *   unfinished move the next start resumes.
 *
 * Nothing is deleted: anything replaced goes to `before-legacy-migration-<time>/`
 * inside the destination. Never merges two libraries, and refuses to cross
 * filesystems (where a rename would silently degrade to copy). Idempotent: once the
 * new layout exists, later starts do nothing.
 */
export function migrateLegacyBrand(
  options: LegacyBrandMigrationOptions,
): LegacyBrandMigrationResult {
  const { destinationDir, legacyDirs = [], chooseOnConflict, now = () => new Date() } = options;
  const messages: string[] = [];
  mkdirSync(destinationDir, { recursive: true });

  const finished = finishInterruptedDbMove(destinationDir, legacyDirs, messages);
  const notMigrated = { migrated: finished, messages };

  const keptDirs = readKeptDirs(destinationDir);
  const sources = [destinationDir, ...legacyDirs].filter(
    (dir) => existsSync(join(dir, LEGACY_DB)) && !keptDirs.includes(dir),
  );
  if (sources.length === 0) {
    return notMigrated;
  }
  if (sources.length > 1) {
    throw new Error(
      `LumaKeys found earlier libraries (${LEGACY_DB}) in ${sources.join(' and ')} and will not choose `
        + `between them or merge them. Nothing was moved. Rename the ${LEGACY_DB} you do not want to use, `
        + `with its -wal and -shm files (for example to ${LEGACY_DB}.old), then start LumaKeys again.`,
    );
  }
  const sourceDir = sources[0];
  const newDb = join(destinationDir, NEW_DB);

  if (existsSync(newDb) && hasUserRows(newDb)) {
    if (!chooseOnConflict) {
      throw new Error(
        `${newDb} already holds a library, and ${sourceDir} holds an earlier one (${LEGACY_DB}). `
          + 'LumaKeys will not merge or overwrite either. Nothing was moved. '
          + `To keep the current library, rename ${LEGACY_DB} to ${LEGACY_DB}.old; `
          + `to use the earlier one, rename ${NEW_DB} to ${NEW_DB}.old (each with its -wal and -shm files). `
          + 'Then start again.',
      );
    }
    const choice = chooseOnConflict({ legacyDir: sourceDir, destinationDir });
    if (choice === 'quit') {
      return { ...notMigrated, quit: true };
    }
    if (choice === 'keep-current') {
      recordKeptDir(destinationDir, keptDirs, sourceDir);
      messages.push(`Kept the current library; ${sourceDir} stays where it is.`);
      return notMigrated;
    }
  }

  const profileMove = sourceDir !== destinationDir;
  if (profileMove && !isSameFilesystem(sourceDir, destinationDir)) {
    throw new Error(
      `Legacy profile ${sourceDir} and ${destinationDir} are on different filesystems. `
        + 'Move them manually; do not merge here.',
    );
  }

  checkpoint(join(sourceDir, LEGACY_DB));
  if (existsSync(newDb)) {
    checkpoint(newDb);
  }

  const backupDir = backupDirFactory(destinationDir, now);
  let usedBackup = false;
  const setAside = (name: string) => {
    renameSync(join(destinationDir, name), join(backupDir(), name));
    usedBackup = true;
  };

  // Set aside the replaced database main file first: once it is gone, a restart sees
  // a destination without a database and only resumes the move.
  const replacingDb = existsSync(newDb);
  for (const suffix of ['', ...SIDECARS]) {
    if (existsSync(newDb + suffix)) {
      setAside(NEW_DB + suffix);
    }
  }
  if (profileMove) {
    for (const name of PROFILE_ENTRIES) {
      const inDestination = existsSync(join(destinationDir, name));
      // The replaced profile goes as a whole; otherwise only an entry in the way.
      if (inDestination && (replacingDb || existsSync(join(sourceDir, name)))) {
        setAside(name);
      }
    }
    for (const name of PROFILE_ENTRIES) {
      if (existsSync(join(sourceDir, name))) {
        renameSync(join(sourceDir, name), join(destinationDir, name));
      }
    }
  }

  for (const suffix of SIDECARS) {
    if (existsSync(join(sourceDir, LEGACY_DB + suffix))) {
      renameSync(join(sourceDir, LEGACY_DB + suffix), newDb + suffix);
    }
  }
  renameSync(join(sourceDir, LEGACY_DB), newDb);

  messages.push(
    profileMove
      ? `Migrated legacy profile ${sourceDir}`
      : `Renamed legacy SQLite set (${LEGACY_DB}) to ${NEW_DB}`,
  );
  if (usedBackup) {
    messages.push(`Kept the replaced entries in ${backupDir()}`);
  }
  return { migrated: true, messages, ...(usedBackup ? { backupDir: backupDir() } : {}) };
}
