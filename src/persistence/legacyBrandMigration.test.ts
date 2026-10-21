// @vitest-environment node

import Database from 'better-sqlite3';
import type { PathLike } from 'node:fs';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppDatabase } from './database';
import { legacyProfileDirs, migrateLegacyBrand } from './legacyBrandMigration';

// Every rename goes through this wrapper so a test can record the order or stop the
// migration at a chosen rename, as a crash would. `otherDrive` makes paths under it
// report a different device, as a second filesystem would.
const renames = vi.hoisted(() => ({ log: [] as string[], crashAt: 0, otherDrive: '' }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    renameSync: (from: PathLike, to: PathLike) => {
      renames.log.push(`${String(from)} -> ${String(to)}`);
      if (renames.crashAt > 0 && renames.log.length === renames.crashAt) {
        throw new Error('simulated crash');
      }
      actual.renameSync(from, to);
    },
    statSync: ((path: PathLike, options?: unknown) => {
      const stats = actual.statSync(path, options as never);
      if (stats && renames.otherDrive && String(path).startsWith(renames.otherDrive)) {
        Object.defineProperty(stats, 'dev', { value: Number(stats.dev) + 1 });
      }
      return stats;
    }) as typeof actual.statSync,
  };
});

const roots: string[] = [];

afterEach(async () => {
  renames.log = [];
  renames.crashAt = 0;
  renames.otherDrive = '';
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function stagingRoot(): string {
  const root = join(tmpdir(), `lumakeys-brand-migration-${Math.random().toString(36).slice(2)}`);
  roots.push(root);
  mkdirSync(root, { recursive: true });
  return root;
}

const CHECKPOINTED_AT = new Date('2026-08-01T10:00:00Z');
const LAST_COMMIT_AT = new Date('2026-08-01T10:05:00Z');

function rawDb(db: AppDatabase): Database.Database {
  return (db as unknown as { db: Database.Database }).db;
}

/**
 * A legacy database whose last commits live only in its WAL, as an old build leaves it
 * when it exits without a checkpoint. Without the WAL it reads marker `checkpointed`
 * and theory score 7; with it, marker `wal-only` and scores 7 and 9.
 */
function seedWalOnly(dir: string, dbName = 'pianohero.db'): void {
  mkdirSync(join(dir, 'midi-files'), { recursive: true });
  writeFileSync(join(dir, 'midi-files', 'legacy-song.mid'), 'MThd-legacy');
  const seedPath = join(dir, 'seed.db');
  const db = new AppDatabase(seedPath);
  db.addSong({
    id: 'legacy-song',
    title: 'Legacy Song',
    artist: '',
    genre: '',
    filePath: join(dir, 'midi-files', 'legacy-song.mid'),
    difficulty: 1,
    durationSec: 10,
    bpm: 120,
    noteCount: 4,
    tags: [],
    trackAssignments: {},
  });
  db.saveTheoryResult({ type: 'quiz', score: 7, totalQuestions: 10, accuracy: 70 });
  db.setSetting('audit', 'marker', 'checkpointed');
  rawDb(db).pragma('wal_checkpoint(TRUNCATE)');
  rawDb(db).pragma('wal_autocheckpoint = 0');
  db.setSetting('audit', 'marker', 'wal-only');
  db.saveTheoryResult({ type: 'quiz', score: 9, totalQuestions: 10, accuracy: 90 });
  // Copy the set while the writer is still open, so the copy keeps the WAL-only commits.
  for (const ext of ['', '-wal', '-shm']) {
    copyFileSync(seedPath + ext, join(dir, dbName + ext));
  }
  db.close();
  for (const ext of ['', '-wal', '-shm']) {
    rmSync(seedPath + ext, { force: true });
  }
  utimesSync(join(dir, dbName), CHECKPOINTED_AT, CHECKPOINTED_AT);
  utimesSync(join(dir, `${dbName}-wal`), LAST_COMMIT_AT, LAST_COMMIT_AT);
}

function addSong(db: AppDatabase, id: string, dir: string): void {
  db.addSong({
    id,
    title: id,
    artist: '',
    genre: '',
    filePath: join(dir, 'midi-files', `${id}.mid`),
    difficulty: 1,
    durationSec: 10,
    bpm: 120,
    noteCount: 4,
    tags: [],
    trackAssignments: {},
  });
}

/**
 * The -wal and -shm of another library, left in `dir` as `pianohero.db-wal` and -shm
 * after someone renamed its `pianohero.db` (to `pianohero.db.old`) but not the sidecars.
 * Its commits (`songs` foreign songs) live only in the WAL, stamped LAST_COMMIT_AT.
 */
function seedForeignWal(dir: string, { pageSize = 4096, songs = 3 } = {}): void {
  mkdirSync(dir, { recursive: true });
  const seedPath = join(dir, 'foreign-seed.db');
  const pre = new Database(seedPath);
  pre.pragma(`page_size = ${pageSize}`);
  pre.exec('CREATE TABLE seed_marker (v TEXT)');
  pre.close();
  const db = new AppDatabase(seedPath);
  rawDb(db).pragma('wal_checkpoint(TRUNCATE)');
  rawDb(db).pragma('wal_autocheckpoint = 0');
  copyFileSync(seedPath, join(dir, 'pianohero.db.old'));
  for (let i = 0; i < songs; i += 1) {
    addSong(db, `foreign-${i}`, dir);
  }
  for (const ext of ['-wal', '-shm']) {
    copyFileSync(seedPath + ext, join(dir, `pianohero.db${ext}`));
  }
  db.close();
  for (const ext of ['', '-wal', '-shm']) {
    rmSync(seedPath + ext, { force: true });
  }
  utimesSync(join(dir, 'pianohero.db-wal'), LAST_COMMIT_AT, LAST_COMMIT_AT);
}

/** The profile the current build creates on first start: an empty library plus renderer storage. */
function seedCurrentProfile(dir: string, addRows?: (db: Database.Database) => void): void {
  mkdirSync(join(dir, 'midi-files'), { recursive: true });
  mkdirSync(join(dir, 'Local Storage'), { recursive: true });
  writeFileSync(join(dir, 'Local Storage', 'marker'), 'current-profile');
  const db = new AppDatabase(join(dir, 'lumakeys.db'));
  db.setSetting('setup', 'guide-complete', 'true');
  db.close();
  if (addRows) {
    const raw = new Database(join(dir, 'lumakeys.db'));
    addRows(raw);
    raw.close();
  }
}

/** Opens the destination the way startup does and reads back what the user would see. */
function readLibrary(dir: string) {
  const db = new AppDatabase(join(dir, 'lumakeys.db'));
  try {
    return {
      marker: db.getSetting('audit', 'marker'),
      theoryScores: db.getTheoryResults().map((row) => row.score).sort(),
      songs: db.getAllSongs().map((song) => song.id),
      integrity: rawDb(db).pragma('integrity_check', { simple: true }),
    };
  } finally {
    db.close();
  }
}

const LEGACY_LIBRARY = {
  marker: 'wal-only',
  theoryScores: [7, 9],
  songs: ['legacy-song'],
  integrity: 'ok',
};

function backupDirs(dest: string): string[] {
  return readdirSync(dest)
    .filter((name) => name.startsWith('before-legacy-migration-'))
    .map((name) => join(dest, name));
}

describe('migrateLegacyBrand', () => {
  describe('same directory', () => {
    it('renames the legacy SQLite set in place and keeps its WAL-only commits', () => {
      const dir = join(stagingRoot(), 'data');
      seedWalOnly(dir);

      const res = migrateLegacyBrand({ destinationDir: dir });

      expect(res.migrated).toBe(true);
      expect(res.messages).toContainEqual(expect.stringContaining('lumakeys.db'));
      expect(existsSync(join(dir, 'pianohero.db'))).toBe(false);
      expect(readLibrary(dir)).toEqual(LEGACY_LIBRARY);
    });

    it('does nothing on a fresh install with no legacy database', () => {
      const dir = join(stagingRoot(), 'data');

      const res = migrateLegacyBrand({ destinationDir: dir });

      expect(res.migrated).toBe(false);
      expect(existsSync(join(dir, 'lumakeys.db'))).toBe(false);
    });

    it('is a no-op when only the new database exists', () => {
      const dir = join(stagingRoot(), 'data');
      seedCurrentProfile(dir);

      const res = migrateLegacyBrand({ destinationDir: dir });

      expect(res.migrated).toBe(false);
      expect(backupDirs(dir)).toEqual([]);
    });

    it('refuses, naming the safe rename, when both databases hold a library and no one can choose', () => {
      const dir = join(stagingRoot(), 'data');
      seedWalOnly(dir);
      seedCurrentProfile(dir, (db) => db.exec("INSERT INTO songs (id, title, file_path) VALUES ('mine', 'Mine', 'x')"));

      expect(() => migrateLegacyBrand({ destinationDir: dir })).toThrow(/rename.*pianohero\.db/i);
      expect(existsSync(join(dir, 'pianohero.db'))).toBe(true);
      expect(readLibrary(dir).songs).toEqual(['mine']);
    });

    it('is idempotent after a same-directory migration', () => {
      const dir = join(stagingRoot(), 'data');
      seedWalOnly(dir);

      migrateLegacyBrand({ destinationDir: dir });
      const res = migrateLegacyBrand({ destinationDir: dir });

      expect(res.migrated).toBe(false);
      expect(readLibrary(dir)).toEqual(LEGACY_LIBRARY);
    });
  });

  describe('desktop profile lookup (PH-DATA-005)', () => {
    it('lists the profile directories released builds used, newest first', () => {
      expect(legacyProfileDirs('/home/u/.config')).toEqual([
        '/home/u/.config/luma-keys',
        '/home/u/.config/piano-hero',
        '/home/u/.config/PianoHero',
      ]);
    });

    it.each(['luma-keys', 'piano-hero', 'PianoHero'])(
      'carries a profile left at <appData>/%s into <appData>/lumakeys',
      (name) => {
        const appData = stagingRoot();
        const legacy = join(appData, name);
        const dest = join(appData, 'lumakeys');
        seedWalOnly(legacy);
        mkdirSync(join(legacy, 'Local Storage'), { recursive: true });
        writeFileSync(join(legacy, 'Local Storage', 'marker'), 'legacy-profile');

        const res = migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) });

        expect(res.migrated).toBe(true);
        expect(readLibrary(dest)).toEqual(LEGACY_LIBRARY);
        expect(readFileSync(join(dest, 'midi-files', 'legacy-song.mid'), 'utf8')).toBe('MThd-legacy');
        expect(readFileSync(join(dest, 'Local Storage', 'marker'), 'utf8')).toBe('legacy-profile');
        expect(readdirSync(legacy)).toEqual([]);
      },
    );

    it('refuses to choose between two earlier profiles, names both and moves nothing', () => {
      const appData = stagingRoot();
      seedWalOnly(join(appData, 'luma-keys'));
      seedWalOnly(join(appData, 'piano-hero'));
      const dest = join(appData, 'lumakeys');

      let message = '';
      try {
        migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) });
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain(join(appData, 'luma-keys'));
      expect(message).toContain(join(appData, 'piano-hero'));
      expect(message).toMatch(/rename/i);
      expect(existsSync(join(appData, 'luma-keys', 'pianohero.db'))).toBe(true);
      expect(existsSync(join(appData, 'piano-hero', 'pianohero.db'))).toBe(true);
      expect(existsSync(join(dest, 'lumakeys.db'))).toBe(false);
    });

    it('backs up an empty lumakeys.db from the current build and replaces it', () => {
      const appData = stagingRoot();
      const dest = join(appData, 'lumakeys');
      seedCurrentProfile(dest);
      seedWalOnly(join(appData, 'luma-keys'));

      const res = migrateLegacyBrand({
        destinationDir: dest,
        legacyDirs: legacyProfileDirs(appData),
        now: () => new Date('2026-10-21T09:30:00.000Z'),
      });

      expect(res.migrated).toBe(true);
      expect(res.backupDir).toBe(join(dest, 'before-legacy-migration-2026-10-21T09-30-00-000Z'));
      expect(readLibrary(dest)).toEqual(LEGACY_LIBRARY);
      const backup = res.backupDir as string;
      expect(readFileSync(join(backup, 'Local Storage', 'marker'), 'utf8')).toBe('current-profile');
      expect(existsSync(join(backup, 'midi-files'))).toBe(true);
      const kept = new AppDatabase(join(backup, 'lumakeys.db'));
      expect(kept.getSetting('setup', 'guide-complete')).toBe('true');
      kept.close();
    });

    const userRows: Array<[string, string]> = [
      ['a song', "INSERT INTO songs (id, title, file_path) VALUES ('mine', 'Mine', 'x')"],
      [
        'a game result',
        "INSERT INTO songs (id, title, file_path) VALUES ('mine', 'Mine', 'x');"
          + "INSERT INTO game_results (id, song_id, score, accuracy, max_combo) VALUES ('r', 'mine', 1, 1, 1)",
      ],
      [
        'a theory result',
        "INSERT INTO theory_results (id, type, score, total_questions, accuracy) VALUES ('t', 'quiz', 1, 1, 1)",
      ],
      ['a practice day', "INSERT INTO practice_days (date) VALUES ('2026-10-20')"],
      [
        'an unlocked achievement',
        "UPDATE achievements SET unlocked_at = '2026-10-20' WHERE id = (SELECT id FROM achievements LIMIT 1)",
      ],
      ['a folder', "INSERT INTO folders (id, name) VALUES ('f', 'Mine')"],
      ['a playlist', "INSERT INTO playlists (id, name) VALUES ('p', 'Mine')"],
      [
        'completed lessons',
        "INSERT INTO settings (category, key, value) VALUES ('learning', 'completedLessons', '[\"novice-1\"]')",
      ],
      [
        'completed lesson steps',
        "INSERT INTO settings (category, key, value) VALUES ('learning', 'completedSteps', '{\"novice-1\":[0]}')",
      ],
      [
        'a capstone result',
        "INSERT INTO settings (category, key, value) VALUES ('learning', 'capstoneResults', '{\"novice\":92}')",
      ],
    ];

    it.each(userRows)('asks before replacing a lumakeys.db that holds %s', (_label, sql) => {
      const appData = stagingRoot();
      const dest = join(appData, 'lumakeys');
      const legacy = join(appData, 'luma-keys');
      seedCurrentProfile(dest, (db) => db.exec(sql));
      seedWalOnly(legacy);
      const choose = vi.fn(() => 'quit' as const);

      const res = migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData), chooseOnConflict: choose });

      expect(choose).toHaveBeenCalledWith({ legacyDir: legacy, destinationDir: dest });
      expect(res).toMatchObject({ migrated: false, quit: true });
      expect(existsSync(join(legacy, 'pianohero.db'))).toBe(true);
      expect(backupDirs(dest)).toEqual([]);
    });

    it('replaces a lumakeys.db whose lesson progress is still empty without asking', () => {
      const appData = stagingRoot();
      const dest = join(appData, 'lumakeys');
      seedCurrentProfile(dest, (db) => db.exec(
        'INSERT INTO settings (category, key, value) VALUES '
          + "('learning', 'completedLessons', '[]'), ('learning', 'completedSteps', '{}'), "
          + "('learning', 'capstoneResults', '{}'), ('learning', 'gatingEnabled', 'true')",
      ));
      seedWalOnly(join(appData, 'luma-keys'));
      const choose = vi.fn(() => 'quit' as const);

      const res = migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData), chooseOnConflict: choose });

      expect(choose).not.toHaveBeenCalled();
      expect(res.migrated).toBe(true);
      expect(readLibrary(dest)).toEqual(LEGACY_LIBRARY);
    });

    it('uses the earlier library when chosen and keeps the current one as a backup', () => {
      const appData = stagingRoot();
      const dest = join(appData, 'lumakeys');
      seedCurrentProfile(dest, (db) => db.exec("INSERT INTO songs (id, title, file_path) VALUES ('mine', 'Mine', 'x')"));
      seedWalOnly(join(appData, 'luma-keys'));

      const res = migrateLegacyBrand({
        destinationDir: dest,
        legacyDirs: legacyProfileDirs(appData),
        chooseOnConflict: () => 'use-legacy',
      });

      expect(res.migrated).toBe(true);
      expect(readLibrary(dest)).toEqual(LEGACY_LIBRARY);
      expect(readLibrary(res.backupDir as string).songs).toEqual(['mine']);
    });

    it('keeps the current library when chosen and does not ask again', () => {
      const appData = stagingRoot();
      const dest = join(appData, 'lumakeys');
      const legacy = join(appData, 'luma-keys');
      seedCurrentProfile(dest, (db) => db.exec("INSERT INTO songs (id, title, file_path) VALUES ('mine', 'Mine', 'x')"));
      seedWalOnly(legacy);
      const choose = vi.fn(() => 'keep-current' as const);
      const options = { destinationDir: dest, legacyDirs: legacyProfileDirs(appData), chooseOnConflict: choose };

      const first = migrateLegacyBrand(options);
      const second = migrateLegacyBrand(options);

      expect(first.migrated).toBe(false);
      expect(second.migrated).toBe(false);
      expect(choose).toHaveBeenCalledTimes(1);
      expect(readLibrary(dest).songs).toEqual(['mine']);
      expect(existsSync(join(legacy, 'pianohero.db'))).toBe(true);
    });

    it('backs up a destination entry that is in the way instead of refusing', () => {
      const appData = stagingRoot();
      const dest = join(appData, 'lumakeys');
      const legacy = join(appData, 'luma-keys');
      seedWalOnly(legacy);
      mkdirSync(join(legacy, 'Local Storage'), { recursive: true });
      writeFileSync(join(legacy, 'Local Storage', 'marker'), 'legacy-profile');
      mkdirSync(join(dest, 'Local Storage'), { recursive: true });
      writeFileSync(join(dest, 'Local Storage', 'marker'), 'in-the-way');

      const res = migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) });

      expect(res.migrated).toBe(true);
      expect(readLibrary(dest)).toEqual(LEGACY_LIBRARY);
      expect(readFileSync(join(dest, 'Local Storage', 'marker'), 'utf8')).toBe('legacy-profile');
      expect(readFileSync(join(res.backupDir as string, 'Local Storage', 'marker'), 'utf8')).toBe('in-the-way');
    });
  });

  describe('interrupted moves (PH-DATA-006)', () => {
    it('folds the WAL into the legacy database before moving, so it moves as one file', () => {
      const appData = stagingRoot();
      const dest = join(appData, 'lumakeys');
      seedWalOnly(join(appData, 'luma-keys'));

      migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) });

      expect(renames.log.filter((entry) => entry.includes('pianohero.db'))).toEqual([
        `${join(appData, 'luma-keys', 'pianohero.db')} -> ${join(dest, 'lumakeys.db')}`,
      ]);
      expect(readLibrary(dest)).toEqual(LEGACY_LIBRARY);
    });

    it('refuses before any rename while an earlier build still has its database open', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'luma-keys');
      const dest = join(appData, 'lumakeys');
      seedWalOnly(legacy);
      // An idle connection, as a running earlier build holds: the checkpoint is not
      // blocked, but the -wal and -shm stay on disk after LumaKeys closes its own.
      const idle = new Database(join(legacy, 'pianohero.db'));
      idle.prepare('SELECT count(*) FROM songs').get();

      try {
        expect(() => migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) }))
          .toThrow(/still in use.*Close the earlier version of LumaKeys/);
      } finally {
        idle.close();
      }

      expect(renames.log).toEqual([]);
      expect(readdirSync(legacy).sort()).toEqual(['midi-files', 'pianohero.db']);
      expect(existsSync(join(dest, 'lumakeys.db'))).toBe(false);
    });

    it('refuses before any rename when the checkpoint is blocked', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'luma-keys');
      const dest = join(appData, 'lumakeys');
      seedWalOnly(legacy);
      const reader = new Database(join(legacy, 'pianohero.db'));
      reader.exec('BEGIN');
      reader.prepare('SELECT count(*) FROM songs').get();

      try {
        expect(() => migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) }))
          .toThrow(/checkpoint was blocked.*Close the earlier version of LumaKeys/);
      } finally {
        reader.exec('COMMIT');
        reader.close();
      }

      expect(renames.log).toEqual([]);
      expect(existsSync(join(legacy, 'pianohero.db'))).toBe(true);
    });

    it('refuses before any rename while an earlier build holds its database locked', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'luma-keys');
      seedWalOnly(legacy);
      const holder = new Database(join(legacy, 'pianohero.db'));
      holder.pragma('locking_mode = EXCLUSIVE');
      holder.exec("INSERT INTO settings (category, key, value) VALUES ('audit', 'held', '1')");

      try {
        expect(() => migrateLegacyBrand({ destinationDir: join(appData, 'lumakeys'), legacyDirs: legacyProfileDirs(appData) }))
          .toThrow(/database is locked\). Nothing was moved. Close the earlier version of LumaKeys/);
      } finally {
        holder.close();
      }
      expect(renames.log).toEqual([]);
    });

    it('refuses before any rename while another program has the lumakeys.db it would replace open', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'luma-keys');
      const dest = join(appData, 'lumakeys');
      seedCurrentProfile(dest);
      seedWalOnly(legacy);
      const idle = new Database(join(dest, 'lumakeys.db'));
      idle.prepare('SELECT count(*) FROM songs').get();

      try {
        expect(() => migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) }))
          .toThrow(/lumakeys\.db is still open.*Close every other copy of LumaKeys/);
      } finally {
        idle.close();
      }

      expect(renames.log).toEqual([]);
      expect(existsSync(join(legacy, 'pianohero.db'))).toBe(true);
    });

    it('sets aside a stray lumakeys.db-wal so it is not attached to the database moved in', () => {
      const appData = stagingRoot();
      const dest = join(appData, 'lumakeys');
      seedWalOnly(join(appData, 'luma-keys'));
      const foreign = join(appData, 'foreign');
      seedForeignWal(foreign);
      mkdirSync(dest, { recursive: true });
      for (const ext of ['-wal', '-shm']) {
        copyFileSync(join(foreign, `pianohero.db${ext}`), join(dest, `lumakeys.db${ext}`));
      }

      const res = migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) });

      expect(readLibrary(dest)).toEqual(LEGACY_LIBRARY);
      expect(readdirSync(res.backupDir as string).sort()).toEqual(['lumakeys.db-shm', 'lumakeys.db-wal']);
    });

    it('finishes a profile move an earlier build stopped after the database (H2)', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'PianoHero');
      const dest = join(appData, 'lumakeys');
      seedWalOnly(legacy);
      mkdirSync(dest, { recursive: true });
      renameSync(join(legacy, 'midi-files'), join(dest, 'midi-files'));
      renameSync(join(legacy, 'pianohero.db'), join(dest, 'lumakeys.db'));
      const options = { destinationDir: dest, legacyDirs: legacyProfileDirs(appData) };

      const first = migrateLegacyBrand(options);
      const second = migrateLegacyBrand(options);

      expect(first.migrated).toBe(true);
      expect(second.migrated).toBe(false);
      expect(readdirSync(legacy)).toEqual([]);
      expect(readLibrary(dest)).toEqual(LEGACY_LIBRARY);
    });

    it('finishes a same-directory rename an earlier build stopped after the database (H3)', () => {
      const dir = join(stagingRoot(), 'data');
      seedWalOnly(dir);
      renameSync(join(dir, 'pianohero.db'), join(dir, 'lumakeys.db'));

      const res = migrateLegacyBrand({ destinationDir: dir });

      expect(res.migrated).toBe(true);
      expect(readdirSync(dir).filter((name) => name.startsWith('pianohero'))).toEqual([]);
      expect(readLibrary(dir)).toEqual(LEGACY_LIBRARY);
    });

    it('finishes a same-directory rename an earlier build stopped before the -shm (H4)', () => {
      const dir = join(stagingRoot(), 'data');
      seedWalOnly(dir);
      renameSync(join(dir, 'pianohero.db'), join(dir, 'lumakeys.db'));
      renameSync(join(dir, 'pianohero.db-wal'), join(dir, 'lumakeys.db-wal'));

      const res = migrateLegacyBrand({ destinationDir: dir });

      expect(res.migrated).toBe(true);
      expect(readdirSync(dir).filter((name) => name.startsWith('pianohero'))).toEqual([]);
      expect(readLibrary(dir)).toEqual(LEGACY_LIBRARY);
    });

    it('leaves a left-over WAL alone when the database was written after it', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'PianoHero');
      const dest = join(appData, 'lumakeys');
      seedWalOnly(legacy);
      rmSync(join(legacy, 'pianohero.db'));
      seedCurrentProfile(dest, (db) => db.exec("INSERT INTO songs (id, title, file_path) VALUES ('mine', 'Mine', 'x')"));
      const later = new Date('2026-10-20T10:00:00Z');
      utimesSync(join(dest, 'lumakeys.db'), later, later);

      const res = migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) });

      expect(res.migrated).toBe(false);
      expect(existsSync(join(legacy, 'pianohero.db-wal'))).toBe(true);
      expect(readLibrary(dest)).toMatchObject({ songs: ['mine'], integrity: 'ok' });
    });

    it('never takes a sidecar from a folder that still holds pianohero.db as left over', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'PianoHero');
      const dest = join(appData, 'lumakeys');
      seedWalOnly(legacy);
      seedCurrentProfile(dest, (db) => db.exec("INSERT INTO songs (id, title, file_path) VALUES ('mine', 'Mine', 'x')"));
      // Older than the earlier library's WAL, so the time rule alone would attach it.
      const earlier = new Date('2026-07-01T10:00:00Z');
      utimesSync(join(dest, 'lumakeys.db'), earlier, earlier);

      const res = migrateLegacyBrand({
        destinationDir: dest,
        legacyDirs: legacyProfileDirs(appData),
        chooseOnConflict: () => 'quit',
      });

      expect(res).toMatchObject({ migrated: false, quit: true });
      expect(readdirSync(legacy).sort()).toEqual(['midi-files', 'pianohero.db', 'pianohero.db-shm', 'pianohero.db-wal']);
      expect(backupDirs(dest)).toEqual([]);
      expect(readLibrary(dest).songs).toEqual(['mine']);
    });

    it('keeps a copy of the current library before attaching a newer stray WAL', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'PianoHero');
      const dest = join(appData, 'lumakeys');
      seedForeignWal(legacy, { songs: 42 });
      seedCurrentProfile(dest, (db) => db.exec(
        "INSERT INTO songs (id, title, file_path) VALUES ('mine-1', 'A', 'x'), ('mine-2', 'B', 'x'), ('mine-3', 'C', 'x')",
      ));
      const earlier = new Date('2026-07-01T10:00:00Z');
      utimesSync(join(dest, 'lumakeys.db'), earlier, earlier);

      const res = migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) });

      expect(res.migrated).toBe(true);
      expect(res.messages).toContainEqual(expect.stringContaining('Kept a copy of'));
      expect(readdirSync(res.backupDir as string)).toEqual(['lumakeys.db']);
      const kept = readLibrary(res.backupDir as string);
      expect(kept.songs.sort()).toEqual(['mine-1', 'mine-2', 'mine-3']);
      expect(kept.integrity).toBe('ok');
    });

    it('leaves a left-over WAL alone when its page size differs from the database', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'PianoHero');
      const dest = join(appData, 'lumakeys');
      seedForeignWal(legacy, { pageSize: 8192 });
      seedCurrentProfile(dest, (db) => db.exec("INSERT INTO songs (id, title, file_path) VALUES ('mine', 'Mine', 'x')"));
      const earlier = new Date('2026-07-01T10:00:00Z');
      utimesSync(join(dest, 'lumakeys.db'), earlier, earlier);

      const res = migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) });

      expect(res.migrated).toBe(false);
      expect(res.messages).toContainEqual(expect.stringContaining('page size (8192)'));
      expect(readdirSync(legacy).sort()).toEqual(['pianohero.db-shm', 'pianohero.db-wal', 'pianohero.db.old']);
      expect(backupDirs(dest)).toEqual([]);
      expect(readLibrary(dest)).toMatchObject({ songs: ['mine'], integrity: 'ok' });
    });

    it.each(['luma-keys', 'piano-hero'])('leaves a stray WAL in %s alone, since no released build moved that profile', (name) => {
      const appData = stagingRoot();
      const stray = join(appData, name);
      const dest = join(appData, 'lumakeys');
      seedForeignWal(stray);
      seedCurrentProfile(dest, (db) => db.exec("INSERT INTO songs (id, title, file_path) VALUES ('mine', 'Mine', 'x')"));
      const earlier = new Date('2026-07-01T10:00:00Z');
      utimesSync(join(dest, 'lumakeys.db'), earlier, earlier);

      const res = migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) });

      expect(res.migrated).toBe(false);
      expect(res.messages).toContainEqual(expect.stringContaining(`Left ${join(stray, 'pianohero.db-wal')} in place`));
      expect(readdirSync(stray).sort()).toEqual(['pianohero.db-shm', 'pianohero.db-wal', 'pianohero.db.old']);
      expect(renames.log).toEqual([]);
      expect(backupDirs(dest)).toEqual([]);
      expect(readLibrary(dest)).toMatchObject({ songs: ['mine'], integrity: 'ok' });
    });

    it('still finishes a move from PianoHero while luma-keys holds a stray WAL', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'PianoHero');
      const dest = join(appData, 'lumakeys');
      seedWalOnly(legacy);
      mkdirSync(dest, { recursive: true });
      renameSync(join(legacy, 'midi-files'), join(dest, 'midi-files'));
      renameSync(join(legacy, 'pianohero.db'), join(dest, 'lumakeys.db'));
      seedForeignWal(join(appData, 'luma-keys'));

      const res = migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) });

      expect(res.migrated).toBe(true);
      expect(readdirSync(legacy)).toEqual([]);
      expect(readLibrary(dest)).toEqual(LEGACY_LIBRARY);
      expect(readdirSync(join(appData, 'luma-keys')).sort())
        .toEqual(['pianohero.db-shm', 'pianohero.db-wal', 'pianohero.db.old']);
    });

    it('refuses to choose between left-over WALs in the data folder and in PianoHero', () => {
      const appData = stagingRoot();
      const dest = join(appData, 'lumakeys');
      seedForeignWal(dest);
      seedForeignWal(join(appData, 'PianoHero'));
      seedCurrentProfile(dest);

      expect(() => migrateLegacyBrand({ destinationDir: dest, legacyDirs: legacyProfileDirs(appData) }))
        .toThrow(/Left-over pianohero\.db-wal files exist in .*lumakeys and .*PianoHero.*Rename the ones you do not need/);
      expect(renames.log).toEqual([]);
      expect(backupDirs(dest)).toEqual([]);
    });

    it('keeps the copy made before attaching apart from a database it then replaces', () => {
      // PianoHero stopped after its database moved; luma-keys holds another earlier library.
      const appData = stagingRoot();
      const moved = join(appData, 'PianoHero');
      const dest = join(appData, 'lumakeys');
      seedWalOnly(moved);
      mkdirSync(dest, { recursive: true });
      renameSync(join(moved, 'midi-files'), join(dest, 'midi-files'));
      renameSync(join(moved, 'pianohero.db'), join(dest, 'lumakeys.db'));
      const other = join(appData, 'luma-keys');
      mkdirSync(other, { recursive: true });
      const otherDb = new AppDatabase(join(other, 'pianohero.db'));
      addSong(otherDb, 'other-song', other);
      otherDb.close();

      const res = migrateLegacyBrand({
        destinationDir: dest,
        legacyDirs: legacyProfileDirs(appData),
        chooseOnConflict: () => 'use-legacy',
      });

      expect(res.migrated).toBe(true);
      expect(readLibrary(dest).songs).toEqual(['other-song']);
      // One folder holds lumakeys.db as found (without the WAL), the other the library replaced.
      const kept = backupDirs(dest).map((dir) => readLibrary(dir).marker).sort();
      expect(kept).toEqual(['checkpointed', 'wal-only']);
    });

    it('recovers from a stop at every rename without losing either library', () => {
      // An uninterrupted run over this fixture: three renames set the current profile
      // aside, three move the legacy profile in.
      const fixture = () => {
        const appData = stagingRoot();
        const dest = join(appData, 'lumakeys');
        seedCurrentProfile(dest);
        const legacy = join(appData, 'luma-keys');
        seedWalOnly(legacy);
        mkdirSync(join(legacy, 'Local Storage'), { recursive: true });
        writeFileSync(join(legacy, 'Local Storage', 'marker'), 'legacy-profile');
        return { appData, dest, legacy };
      };
      const clean = fixture();
      migrateLegacyBrand({ destinationDir: clean.dest, legacyDirs: legacyProfileDirs(clean.appData) });
      const total = renames.log.length;
      expect(total).toBe(6);

      for (let stopAt = 1; stopAt <= total; stopAt += 1) {
        const { appData, dest, legacy } = fixture();
        const options = { destinationDir: dest, legacyDirs: legacyProfileDirs(appData) };
        renames.log = [];
        renames.crashAt = stopAt;
        expect(() => migrateLegacyBrand(options), `stop at rename ${stopAt}`).toThrow('simulated crash');
        renames.crashAt = 0;

        migrateLegacyBrand(options);

        expect(readLibrary(dest), `stop at rename ${stopAt}`).toEqual(LEGACY_LIBRARY);
        expect(readFileSync(join(dest, 'Local Storage', 'marker'), 'utf8')).toBe('legacy-profile');
        expect(readdirSync(legacy)).toEqual([]);
        const kept = backupDirs(dest).flatMap((dir) => readdirSync(dir));
        expect(kept.sort(), `stop at rename ${stopAt}`).toEqual(['Local Storage', 'lumakeys.db', 'midi-files']);
        const keptStorage = backupDirs(dest)
          .map((dir) => join(dir, 'Local Storage', 'marker'))
          .filter((file) => existsSync(file));
        expect(keptStorage.map((file) => readFileSync(file, 'utf8'))).toEqual(['current-profile']);
      }
    });
  });

  describe('refusals name the safe next step', () => {
    it('asks to rename an earlier library that is not a database', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'luma-keys');
      mkdirSync(legacy, { recursive: true });
      writeFileSync(join(legacy, 'pianohero.db'), 'this is not a SQLite file, it is long enough to have a header');

      expect(() => migrateLegacyBrand({ destinationDir: join(appData, 'lumakeys'), legacyDirs: legacyProfileDirs(appData) }))
        .toThrow(/not a readable LumaKeys library.*rename pianohero\.db with its -wal and -shm files/);
      expect(renames.log).toEqual([]);
    });

    it.skipIf(process.getuid?.() === 0)('asks for access when the earlier library cannot be opened', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'luma-keys');
      seedWalOnly(legacy);
      chmodSync(join(legacy, 'pianohero.db'), 0o000);

      try {
        expect(() => migrateLegacyBrand({ destinationDir: join(appData, 'lumakeys'), legacyDirs: legacyProfileDirs(appData) }))
          .toThrow(/Give your user account read and write access to/);
      } finally {
        chmodSync(join(legacy, 'pianohero.db'), 0o644);
      }
      expect(renames.log).toEqual([]);
    });

    it.skipIf(process.getuid?.() === 0)('asks for access when the earlier library is read-only', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'luma-keys');
      seedWalOnly(legacy);
      chmodSync(join(legacy, 'pianohero.db'), 0o444);

      try {
        expect(() => migrateLegacyBrand({ destinationDir: join(appData, 'lumakeys'), legacyDirs: legacyProfileDirs(appData) }))
          .toThrow(/Give your user account read and write access to/);
      } finally {
        chmodSync(join(legacy, 'pianohero.db'), 0o644);
      }
      expect(renames.log).toEqual([]);
    });

    it('says how to carry over an earlier library on another drive', () => {
      const appData = stagingRoot();
      const legacy = join(appData, 'luma-keys');
      seedWalOnly(legacy);
      renames.otherDrive = legacy;

      expect(() => migrateLegacyBrand({ destinationDir: join(appData, 'lumakeys'), legacyDirs: legacyProfileDirs(appData) }))
        .toThrow(/copy everything in .*luma-keys into .*lumakeys, then rename .*luma-keys \(for example to luma-keys\.old\)/);
      expect(renames.log).toEqual([]);
    });
  });
});
