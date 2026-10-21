// Shared Node-side helper to carry a legacy `pianohero` data set into the
// current `lumakeys` layout. Used by Electron main and the web server before
// `new AppDatabase(...)`. Old brand names survive only inside this module and
// its tests.

import Database from 'better-sqlite3';
import {
  accessSync,
  closeSync,
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

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

/**
 * The only profile a released build moved out of (7cf0c62 moved `<appData>/PianoHero`
 * and renamed inside the data folder), so the only places outside the data folder an
 * interrupted move can have left a sidecar.
 */
const MOVED_PROFILE_NAME = 'PianoHero';

/** App-owned entries that move with a legacy profile. */
const PROFILE_ENTRIES = [
  'midi-files',
  'instrument-sample-packs',
  'song-metadata.json',
  'song-metadata.json.migrated',
  'Local Storage',
];

/** A destination row found by any of these means the user has a library worth keeping. */
const USER_ROW_QUERIES: Array<{ table: string; sql: string }> = [
  { table: 'songs', sql: 'SELECT 1 FROM songs LIMIT 1' },
  { table: 'game_results', sql: 'SELECT 1 FROM game_results LIMIT 1' },
  { table: 'theory_results', sql: 'SELECT 1 FROM theory_results LIMIT 1' },
  { table: 'practice_days', sql: 'SELECT 1 FROM practice_days LIMIT 1' },
  { table: 'achievements', sql: 'SELECT 1 FROM achievements WHERE unlocked_at IS NOT NULL LIMIT 1' },
  { table: 'folders', sql: 'SELECT 1 FROM folders LIMIT 1' },
  { table: 'playlists', sql: 'SELECT 1 FROM playlists LIMIT 1' },
  // Lesson progress lives only in settings (see src/lib/learning/learningProgress.ts),
  // stored as JSON; '[]' and '{}' are what an untouched profile saves.
  {
    table: 'settings',
    sql: "SELECT 1 FROM settings WHERE category = 'learning' "
      + "AND key IN ('completedLessons', 'completedSteps', 'capstoneResults') "
      + "AND value NOT IN ('', '[]', '{}') LIMIT 1",
  },
];

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

/** `earlier` is a `pianohero.db` from an earlier build; `current` is `lumakeys.db`. */
type DbRole = 'earlier' | 'current';

class DatabaseInUseError extends Error {}

const BUSY_CODES = /^SQLITE_(BUSY|LOCKED)/;
const DAMAGED_CODES = /^SQLITE_(NOTADB|CORRUPT)/;
const ACCESS_CODES = /^(EACCES|EPERM|EROFS|SQLITE_(READONLY|CANTOPEN|PERM|AUTH))/;

/** Turns a failure to open or prepare a database into a refusal that names the safe next step. */
function databaseRefusal(dbPath: string, role: DbRole, error: unknown): Error {
  const code = String((error as { code?: unknown } | null)?.code ?? '');
  const renameIt = `rename ${basename(dbPath)} with its -wal and -shm files`;
  if (error instanceof DatabaseInUseError || BUSY_CODES.test(code)) {
    const closeWhat = role === 'earlier'
      ? 'Close the earlier version of LumaKeys'
      : 'Close every other copy of LumaKeys';
    return new Error(
      `${dbPath} is still open in another program (${errorMessage(error)}). Nothing was moved. `
        + `${closeWhat} (and any other program using this file), then start again.`,
    );
  }
  if (DAMAGED_CODES.test(code)) {
    return new Error(
      `${dbPath} is not a readable LumaKeys library (${errorMessage(error)}). Nothing was moved. `
        + `To start without it, ${renameIt} (for example to ${basename(dbPath)}.damaged), then start again.`,
    );
  }
  if (ACCESS_CODES.test(code)) {
    return new Error(
      `LumaKeys cannot read and write ${dbPath} (${errorMessage(error)}). Nothing was moved. `
        + `Give your user account read and write access to ${dirname(dbPath)} and the files in it, `
        + 'then start again.',
    );
  }
  return new Error(
    `Could not prepare ${dbPath} for the move (${errorMessage(error)}). Nothing was moved. `
      + `Start LumaKeys again; if this repeats, ${renameIt} (for example to ${basename(dbPath)}.old) `
      + 'so LumaKeys starts without it.',
  );
}

/**
 * Folds the WAL into the main file, so the database moves as one file. When this is
 * the last connection, SQLite deletes the -wal and -shm files as it closes; if either
 * is still there afterwards, another program (such as an earlier build that is still
 * running) has the database open, and moving it now would split its data.
 */
function checkpoint(dbPath: string, role: DbRole): void {
  let db: Database.Database | undefined;
  try {
    // SQLite opens a read-only file read-only without an error, then cannot remove its
    // -wal and -shm on close, which would read as "still in use"; ask for access instead.
    accessSync(dbPath, constants.R_OK | constants.W_OK);
    db = new Database(dbPath, { fileMustExist: true, timeout: 1000 });
    const [result] = db.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy: number }>;
    if (result && result.busy !== 0) {
      throw new DatabaseInUseError('the checkpoint was blocked');
    }
    db.close();
    db = undefined;
    if (SIDECARS.some((suffix) => existsSync(dbPath + suffix))) {
      throw new DatabaseInUseError('its -wal or -shm file is still in use');
    }
  } catch (error) {
    throw databaseRefusal(dbPath, role, error);
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
    return USER_ROW_QUERIES.some(({ table, sql }) => tables.has(table) && db?.prepare(sql).get() !== undefined);
  } catch (error) {
    throw databaseRefusal(dbPath, 'current', error);
  } finally {
    db?.close();
  }
}

/** Reads a big-endian unsigned integer from a file header; null when the file is too short. */
function readHeaderUInt(file: string, offset: number, length: 2 | 4): number | null {
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(length);
    if (readSync(fd, buffer, 0, length, offset) < length) {
      return null;
    }
    return length === 2 ? buffer.readUInt16BE(0) : buffer.readUInt32BE(0);
  } finally {
    closeSync(fd);
  }
}

const WAL_MAGIC = new Set([0x377f0682, 0x377f0683]);

/**
 * Why a left-over WAL cannot belong to `dbPath`, or null when it may. SQLite does not
 * check that a WAL belongs to its database, so these cheap header checks run first.
 * An empty WAL holds no commits and is harmless.
 */
function walMismatch(walPath: string, dbPath: string): string | null {
  if (statSync(walPath).size === 0) {
    return null;
  }
  if (!WAL_MAGIC.has(readHeaderUInt(walPath, 0, 4) ?? 0)) {
    return 'it is not a SQLite WAL file';
  }
  const walPageSize = readHeaderUInt(walPath, 8, 4);
  const rawDbPageSize = readHeaderUInt(dbPath, 16, 2);
  const dbPageSize = rawDbPageSize === 1 ? 65536 : rawDbPageSize;
  if (walPageSize !== dbPageSize) {
    return `its page size (${walPageSize}) differs from the database's (${dbPageSize})`;
  }
  return null;
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
 * or in `<appData>/PianoHero` once that no longer holds `pianohero.db`, is such a stopped
 * move: attach the sidecar. No released build moved the other earlier profiles, so a
 * sidecar there is only logged and left alone. A left-over file can also be a stray, for
 * example when someone renamed `pianohero.db` but not its -wal, so a copy of
 * `lumakeys.db` (with any sidecar it has) is kept in the backup folder before anything
 * is attached. A left-over WAL stays where it is when the database was written after
 * it, or when its header shows it belongs to another database.
 */
function finishInterruptedDbMove(
  destinationDir: string,
  legacyDirs: string[],
  messages: string[],
  backupDir: () => string,
): boolean {
  const newDb = join(destinationDir, NEW_DB);
  if (!existsSync(newDb)) {
    return false;
  }
  const searched = [destinationDir, ...legacyDirs.filter((dir) => basename(dir) === MOVED_PROFILE_NAME)];
  const leftoverDirs = searched.filter((dir) => !existsSync(join(dir, LEGACY_DB)));
  for (const dir of legacyDirs) {
    if (searched.includes(dir) || existsSync(join(dir, LEGACY_DB))) {
      continue;
    }
    for (const suffix of SIDECARS) {
      const stray = join(dir, LEGACY_DB + suffix);
      if (existsSync(stray)) {
        messages.push(`Left ${stray} in place: no released build moved a library out of ${dir}.`);
      }
    }
  }
  const staleDirs = new Set<string>();
  let finished = false;
  const keepCopyOfCurrentDb = () => {
    if (finished) {
      return;
    }
    const dir = backupDir();
    for (const suffix of ['', ...SIDECARS]) {
      if (existsSync(newDb + suffix)) {
        copyFileSync(newDb + suffix, join(dir, NEW_DB + suffix));
      }
    }
    messages.push(`Kept a copy of ${newDb} in ${dir} before attaching left-over files.`);
  };
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
    if (suffix === '-wal') {
      const reason = statSync(newDb).mtimeMs > statSync(source).mtimeMs
        ? `${newDb} was written after it`
        : walMismatch(source, newDb);
      if (reason) {
        staleDirs.add(sources[0]);
        messages.push(`Left ${source} in place: ${reason}.`);
        continue;
      }
    }
    keepCopyOfCurrentDb();
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
 * - Checkpoints both databases and refuses while another program still has either
 *   open, so each database moves as one file. Profile entries move first and the
 *   main database last, so a source that still holds `pianohero.db` is an unfinished
 *   move the next start resumes.
 *
 * Nothing is deleted: anything replaced goes to `before-legacy-migration-<time>/`
 * inside the destination. Never merges two libraries, and refuses to cross
 * filesystems (where a rename would silently degrade to copy). Every refusal names
 * the safe next step. Idempotent: once the new layout exists, later starts do nothing.
 */
export function migrateLegacyBrand(
  options: LegacyBrandMigrationOptions,
): LegacyBrandMigrationResult {
  const { destinationDir, legacyDirs = [], chooseOnConflict, now = () => new Date() } = options;
  const messages: string[] = [];
  mkdirSync(destinationDir, { recursive: true });

  // The copy kept before attaching left-over files gets its own folder, so setting
  // aside a replaced database later in this run cannot overwrite it.
  const leftoverBackupDir = backupDirFactory(destinationDir, now);
  const finished = finishInterruptedDbMove(destinationDir, legacyDirs, messages, leftoverBackupDir);
  const notMigrated = { migrated: finished, messages, ...(finished ? { backupDir: leftoverBackupDir() } : {}) };

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
      `The earlier library in ${sourceDir} is on a different drive from ${destinationDir}, and LumaKeys `
        + 'only moves files within one drive. Nothing was moved. To carry it over, copy everything in '
        + `${sourceDir} into ${destinationDir}, then rename ${sourceDir} (for example to `
        + `${basename(sourceDir)}.old) and start LumaKeys again.`,
    );
  }

  checkpoint(join(sourceDir, LEGACY_DB), 'earlier');
  if (existsSync(newDb)) {
    checkpoint(newDb, 'current');
  }

  const backupDir = backupDirFactory(destinationDir, now);
  let usedBackup = false;
  const setAside = (name: string) => {
    renameSync(join(destinationDir, name), join(backupDir(), name));
    usedBackup = true;
  };

  // Set aside the replaced database main file first: once it is gone, a restart sees
  // a destination without a database and only resumes the move. Stray -wal and -shm
  // files go too, so SQLite cannot attach them to the database moved in.
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

  // The checkpoint left no -wal or -shm beside the earlier database, so it moves as one file.
  renameSync(join(sourceDir, LEGACY_DB), newDb);

  messages.push(
    profileMove
      ? `Migrated legacy profile ${sourceDir}`
      : `Renamed legacy SQLite set (${LEGACY_DB}) to ${NEW_DB}`,
  );
  if (usedBackup) {
    messages.push(`Kept the replaced entries in ${backupDir()}`);
  }
  const keptIn = usedBackup ? backupDir() : notMigrated.backupDir;
  return { migrated: true, messages, ...(keptIn ? { backupDir: keptIn } : {}) };
}
