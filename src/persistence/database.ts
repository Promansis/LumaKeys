import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { getUnlockableAchievementIds, type AchievementMetrics } from '../lib/achievements/achievementChecker';
import { ACHIEVEMENTS } from '../lib/achievements/achievementDefinitions';
import type { Hand, TrackAssignment } from '../lib/game/types';
import { generateRecommendations } from '../lib/recommendations/recommendationEngine';
import type {
  AddSongPayload,
  AchievementRow,
  FingeringRow,
  FolderRow,
  GameResultRow,
  GlobalTroubleSpot,
  LibraryBackup,
  LibraryBackupV1,
  LibraryImportResult,
  LibrarySnapshot,
  MeasureAccuracyHistoryRow,
  PlaylistRow,
  PracticeDayRow,
  PracticeStreak,
  ProgressStatsResult,
  RecommendationResult,
  SaveResultOutcome,
  SaveGameResultPayload,
  SaveTheoryResultPayload,
  SettingRow,
  SongRow,
  TheoryResultRow,
  TheoryStatsRow,
  TopSongStat,
  TroubleSpotRow,
  UpdateSongPayload,
  UpdateTroubleSpotPayload,
  UserStatsRow,
} from '../shared/dbTypes';
import { SettingsRepository } from './settingsRepository';
import type { MidiStorageAdapter, MidiStorageStagedFile } from '../storage/midiStorage';
import { computeSongMetadata } from '../lib/midi/importMetadata';
import { createSongId } from '../lib/midi/importMetadata';
import { isPathContainedInRoot, isSafeSongStorageId } from '../lib/storage/storageSafety';

type DbRow = Record<string, unknown>;

export interface DurableOperation {
  id: string;
  type: 'delete-songs' | 'reset-user-data' | 'restore-library';
  state: 'prepared' | 'db-committed';
  payload: { songIds?: string[] };
}

export class AppDatabase {
  private db: Database.Database;
  private settings: SettingsRepository;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.settings = new SettingsRepository(this.db);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS songs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL DEFAULT '',
        genre TEXT NOT NULL DEFAULT '',
        file_path TEXT NOT NULL,
        difficulty INTEGER NOT NULL DEFAULT 0,
        duration_sec REAL NOT NULL DEFAULT 0,
        bpm REAL NOT NULL DEFAULT 0,
        note_count INTEGER NOT NULL DEFAULT 0,
        date_added TEXT NOT NULL DEFAULT (datetime('now')),
        times_played INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '[]',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        track_assignments TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS user_stats (
        song_id TEXT PRIMARY KEY REFERENCES songs(id) ON DELETE CASCADE,
        play_count INTEGER NOT NULL DEFAULT 0,
        best_score INTEGER NOT NULL DEFAULT 0,
        average_score REAL NOT NULL DEFAULT 0,
        best_accuracy REAL NOT NULL DEFAULT 0,
        last_played TEXT,
        total_practice_time_sec REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS game_results (
        id TEXT PRIMARY KEY,
        song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        score INTEGER NOT NULL,
        accuracy REAL NOT NULL,
        max_combo INTEGER NOT NULL,
        perfect_hits INTEGER NOT NULL DEFAULT 0,
        good_hits INTEGER NOT NULL DEFAULT 0,
        ok_hits INTEGER NOT NULL DEFAULT 0,
        misses INTEGER NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        tempo REAL NOT NULL DEFAULT 1.0,
        mode TEXT NOT NULL DEFAULT 'luma-keys',
        duration_sec REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS theory_results (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('quiz', 'interval-trainer', 'scale-practice')),
        score INTEGER NOT NULL,
        total_questions INTEGER NOT NULL,
        accuracy REAL NOT NULL,
        details TEXT NOT NULL DEFAULT '{}',
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS settings (
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (category, key)
      );

      CREATE TABLE IF NOT EXISTS fingerings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        note_index INTEGER NOT NULL,
        note_id TEXT,
        finger INTEGER NOT NULL CHECK(finger BETWEEN 1 AND 5),
        hand TEXT NOT NULL CHECK(hand IN ('left', 'right'))
      );

      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS playlist_songs (
        playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (playlist_id, song_id)
      );

      CREATE TABLE IF NOT EXISTS practice_days (
        date TEXT PRIMARY KEY,
        total_practice_time_sec REAL NOT NULL DEFAULT 0,
        songs_played INTEGER NOT NULL DEFAULT 0,
        theory_sessions INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        unlocked_at TEXT
      );

      CREATE TABLE IF NOT EXISTS trouble_spots (
        id TEXT PRIMARY KEY,
        song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        measure_start INTEGER NOT NULL,
        measure_end INTEGER NOT NULL,
        first_detected TEXT NOT NULL,
        last_practiced TEXT,
        resolution_count INTEGER NOT NULL DEFAULT 0,
        is_resolved INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS measure_accuracy_history (
        id TEXT PRIMARY KEY,
        game_result_id TEXT NOT NULL REFERENCES game_results(id) ON DELETE CASCADE,
        measure INTEGER NOT NULL,
        accuracy REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS durable_operations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK(type IN ('delete-songs', 'reset-user-data', 'restore-library')),
        state TEXT NOT NULL CHECK(state IN ('prepared', 'db-committed')),
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    this.ensureDurableOperationsTable();
    this.ensureSongFolderColumn();
    this.ensureFingeringIdentityColumn();

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_game_results_song_id ON game_results(song_id);
      CREATE INDEX IF NOT EXISTS idx_game_results_timestamp ON game_results(timestamp);
      CREATE INDEX IF NOT EXISTS idx_theory_results_type ON theory_results(type);
      CREATE INDEX IF NOT EXISTS idx_theory_results_timestamp ON theory_results(timestamp);
      CREATE INDEX IF NOT EXISTS idx_songs_date_added ON songs(date_added);
      CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_songs_folder_id ON songs(folder_id);
      CREATE INDEX IF NOT EXISTS idx_game_results_song_timestamp ON game_results(song_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_user_stats_last_played ON user_stats(last_played DESC);
      CREATE INDEX IF NOT EXISTS idx_practice_days_date ON practice_days(date DESC);
      CREATE INDEX IF NOT EXISTS idx_trouble_spots_song ON trouble_spots(song_id, is_resolved);
      CREATE INDEX IF NOT EXISTS idx_measure_accuracy_history_game_result ON measure_accuracy_history(game_result_id, measure);
      CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_id ON playlist_songs(playlist_id, sort_order);
      CREATE INDEX IF NOT EXISTS idx_folders_sort_order ON folders(sort_order, name COLLATE NOCASE);
      CREATE INDEX IF NOT EXISTS idx_playlists_name ON playlists(name COLLATE NOCASE);
    `);

    this.db.prepare(`UPDATE songs SET tags = '[]' WHERE tags = '' OR tags IS NULL`).run();
    this.db.prepare(`UPDATE songs SET track_assignments = '{}' WHERE track_assignments = '' OR track_assignments IS NULL`).run();
    this.db.prepare(`UPDATE game_results SET mode = 'luma-keys' WHERE mode IN ('normal', '') OR mode IS NULL`).run();
    this.db.prepare(`UPDATE game_results SET mode = 'luma-keys' WHERE mode = 'piano-hero'`).run();
    this.db
      .prepare(`INSERT OR IGNORE INTO settings (category, key, value) VALUES ('fingering', 'handSize', 'medium')`)
      .run();
    this.seedAchievements();
  }

  private ensureDurableOperationsTable(): void {
    const table = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'durable_operations'")
      .get() as { sql: string } | undefined;
    if (!table || table.sql.includes("'restore-library'")) {
      return;
    }

    this.db.transaction(() => {
      this.db.prepare('ALTER TABLE durable_operations RENAME TO durable_operations_legacy').run();
      this.db.exec(`
        CREATE TABLE durable_operations (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK(type IN ('delete-songs', 'reset-user-data', 'restore-library')),
          state TEXT NOT NULL CHECK(state IN ('prepared', 'db-committed')),
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO durable_operations (id, type, state, payload, created_at)
        SELECT id, type, state, payload, created_at FROM durable_operations_legacy;
        DROP TABLE durable_operations_legacy;
      `);
    })();
  }

  private ensureSongFolderColumn(): void {
    const columns = this.db.prepare(`PRAGMA table_info(songs)`).all() as Array<{ name: string }>;
    const hasFolderId = columns.some((column) => column.name === 'folder_id');
    if (!hasFolderId) {
      this.db.prepare(`ALTER TABLE songs ADD COLUMN folder_id TEXT`).run();
    }
  }

  private ensureFingeringIdentityColumn(): void {
    const columns = this.db.prepare('PRAGMA table_info(fingerings)').all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === 'note_id')) {
      this.db.exec(`
        ALTER TABLE fingerings RENAME TO fingerings_legacy;
        CREATE TABLE fingerings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          song_id TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
          note_index INTEGER NOT NULL,
          note_id TEXT,
          finger INTEGER NOT NULL CHECK(finger BETWEEN 1 AND 5),
          hand TEXT NOT NULL CHECK(hand IN ('left', 'right'))
        );
        INSERT INTO fingerings (song_id, note_index, finger, hand)
        SELECT song_id, note_index, finger, hand FROM fingerings_legacy;
        DROP TABLE fingerings_legacy;
      `);
    }
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fingerings_source_note
        ON fingerings(song_id, note_id) WHERE note_id IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_fingerings_legacy_index
        ON fingerings(song_id, note_index) WHERE note_id IS NULL;
    `);
  }

  private seedAchievements(): void {
    const insert = this.db.prepare('INSERT OR IGNORE INTO achievements (id, unlocked_at) VALUES (?, NULL)');
    for (const achievement of ACHIEVEMENTS) {
      insert.run(achievement.id);
    }
  }

  async migrateFromJson(userDataPath: string, midiStorage?: MidiStorageAdapter): Promise<void> {
    const jsonPath = join(userDataPath, 'song-metadata.json');
    const migratedJsonPath = existsSync(jsonPath) ? jsonPath : existsSync(jsonPath + '.migrated') ? jsonPath + '.migrated' : null;
    if (!migratedJsonPath) {
      return;
    }

    const count = (this.db.prepare('SELECT COUNT(*) as n FROM songs').get() as { n: number }).n;
    if (count > 0) {
      await this.repairLegacyMidiReferences(migratedJsonPath, midiStorage);
      return;
    }

    try {
      const raw = JSON.parse(readFileSync(jsonPath, 'utf8')) as {
        songs: Record<
          string,
          { title: string; sourcePath?: string; trackAssignments: Record<string, string>; updatedAt: string }
        >;
      };
      const stagedFiles: Array<{ id: string; stagedFile: MidiStorageStagedFile }> = [];
      try {
        for (const [id, meta] of Object.entries(raw.songs)) {
          if (!midiStorage || !meta.sourcePath) {
            continue;
          }
          try {
            const bytes = new Uint8Array(await readFile(meta.sourcePath));
            if (isSafeSongStorageId(id) && await createSongId(bytes) !== id) {
              continue;
            }
            computeSongMetadata(bytes, meta.title, meta.trackAssignments as unknown as Record<string, TrackAssignment>);
            stagedFiles.push({ id, stagedFile: await midiStorage.stage(id, bytes) });
          } catch {
            // Keep the migrated row recoverable without claiming unavailable bytes are playable.
          }
        }

        const insert = this.db.prepare(`
          INSERT OR IGNORE INTO songs (id, title, file_path, track_assignments, date_added, tags)
          VALUES (@id, @title, @filePath, @trackAssignments, @dateAdded, '[]')
        `);
        const entries = Object.entries(raw.songs).map(([id, meta]) => ({
          id,
          title: meta.title,
          filePath: stagedFiles.find((entry) => entry.id === id)?.stagedFile.finalPath ?? '',
          trackAssignments: JSON.stringify(meta.trackAssignments),
          dateAdded: meta.updatedAt,
        }));
        const insertMany = this.db.transaction(() => entries.forEach((entry) => insert.run(entry)));
        insertMany();

        try {
          for (const { stagedFile } of stagedFiles) {
            await stagedFile.commit();
          }
        } catch (error) {
          await Promise.allSettled(stagedFiles.map(({ stagedFile }) => stagedFile.rollback?.()));
          for (const entry of entries) {
            this.db.prepare('DELETE FROM songs WHERE id = ?').run(entry.id);
          }
          throw error;
        }
      } finally {
        await Promise.allSettled(stagedFiles.map(({ stagedFile }) => stagedFile.discard()));
      }
      renameSync(jsonPath, jsonPath + '.migrated');
    } catch {
      // Migration failure is non-fatal.
    }
  }

  private async repairLegacyMidiReferences(
    migratedJsonPath: string,
    midiStorage?: MidiStorageAdapter,
  ): Promise<void> {
    if (!midiStorage) {
      return;
    }

    let metadata: Record<string, { sourcePath?: string }>;
    try {
      metadata = JSON.parse(readFileSync(migratedJsonPath, 'utf8')).songs as Record<string, { sourcePath?: string }>;
    } catch {
      return;
    }

    const appOwnedRoot = dirname(midiStorage.getPathForSong('0'.repeat(64)));

    const rows = (this.db.prepare("SELECT id, file_path FROM songs WHERE file_path != ''").all() as Array<{ id: string; file_path: string }>)
      .filter((row) => !isPathContainedInRoot(appOwnedRoot, row.file_path));

    for (const row of rows) {
      const meta = metadata[row.id];
      if (!meta?.sourcePath) {
        if (row.file_path) {
          this.db.prepare('UPDATE songs SET file_path = ? WHERE id = ?').run('', row.id);
        }
        continue;
      }

      try {
        const bytes = new Uint8Array(await readFile(meta.sourcePath));
        if (isSafeSongStorageId(row.id) && (await createSongId(bytes)) !== row.id) {
          this.db.prepare('UPDATE songs SET file_path = ? WHERE id = ?').run('', row.id);
          continue;
        }

        const stagedFile = await midiStorage.stage(row.id, bytes);
        await stagedFile.commit();
        this.db.prepare('UPDATE songs SET file_path = ? WHERE id = ?').run(stagedFile.finalPath, row.id);
        await stagedFile.discard();
      } catch {
        this.db.prepare('UPDATE songs SET file_path = ? WHERE id = ?').run('', row.id);
      }
    }
  }

  getAllSongs(): SongRow[] {
    const rows = this.db.prepare('SELECT * FROM songs ORDER BY date_added DESC').all() as DbRow[];
    return rows.map(rowToSong);
  }

  getSong(id: string): SongRow | null {
    const row = this.db.prepare('SELECT * FROM songs WHERE id = ?').get(id) as DbRow | undefined;
    return row ? rowToSong(row) : null;
  }

  addSong(payload: AddSongPayload): SongRow {
    this.db
      .prepare(`
        INSERT OR IGNORE INTO songs
          (id, title, artist, genre, file_path, difficulty, duration_sec, bpm, note_count, tags, track_assignments, folder_id)
        VALUES
          (@id, @title, @artist, @genre, @filePath, @difficulty, @durationSec, @bpm, @noteCount, @tags, @trackAssignments, @folderId)
      `)
      .run({
        id: payload.id,
        title: payload.title,
        artist: payload.artist,
        genre: payload.genre,
        filePath: payload.filePath,
        difficulty: payload.difficulty,
        durationSec: payload.durationSec,
        bpm: payload.bpm,
        noteCount: payload.noteCount,
        tags: JSON.stringify(payload.tags),
        trackAssignments: JSON.stringify(payload.trackAssignments),
        folderId: payload.folderId ?? null,
      });

    return this.getSong(payload.id)!;
  }

  updateSong(id: string, updates: UpdateSongPayload): void {
    const fields: string[] = [];
    const params: Record<string, unknown> = { id };

    if (updates.title !== undefined) {
      fields.push('title = @title');
      params.title = updates.title;
    }
    if (updates.artist !== undefined) {
      fields.push('artist = @artist');
      params.artist = updates.artist;
    }
    if (updates.genre !== undefined) {
      fields.push('genre = @genre');
      params.genre = updates.genre;
    }
    if (updates.filePath !== undefined) {
      fields.push('file_path = @filePath');
      params.filePath = updates.filePath;
    }
    if (updates.difficulty !== undefined) {
      fields.push('difficulty = @difficulty');
      params.difficulty = updates.difficulty;
    }
    if (updates.durationSec !== undefined) {
      fields.push('duration_sec = @durationSec');
      params.durationSec = updates.durationSec;
    }
    if (updates.bpm !== undefined) {
      fields.push('bpm = @bpm');
      params.bpm = updates.bpm;
    }
    if (updates.noteCount !== undefined) {
      fields.push('note_count = @noteCount');
      params.noteCount = updates.noteCount;
    }
    if (updates.tags !== undefined) {
      fields.push('tags = @tags');
      params.tags = JSON.stringify(updates.tags);
    }
    if (updates.isFavorite !== undefined) {
      fields.push('is_favorite = @isFavorite');
      params.isFavorite = updates.isFavorite ? 1 : 0;
    }
    if (updates.folderId !== undefined) {
      fields.push('folder_id = @folderId');
      params.folderId = updates.folderId;
    }
    if (updates.trackAssignments !== undefined) {
      fields.push('track_assignments = @trackAssignments');
      params.trackAssignments = JSON.stringify(updates.trackAssignments);
    }

    if (fields.length === 0) {
      return;
    }

    this.db.prepare(`UPDATE songs SET ${fields.join(', ')} WHERE id = @id`).run(params);
  }

  deleteSong(id: string): void {
    this.db.prepare('DELETE FROM songs WHERE id = ?').run(id);
  }

  bulkDeleteSongs(songIds: string[]): void {
    const ids = dedupeIds(songIds);
    if (ids.length === 0) {
      return;
    }

    const removeMany = this.db.transaction((nextIds: string[]) => {
      const stmt = this.db.prepare('DELETE FROM songs WHERE id = ?');
      for (const songId of nextIds) {
        stmt.run(songId);
      }
    });
    removeMany(ids);
  }

  prepareDurableOperation(type: DurableOperation['type'], payload: DurableOperation['payload']): string {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO durable_operations (id, type, state, payload) VALUES (?, ?, ?, ?)')
      .run(id, type, 'prepared', JSON.stringify(payload));
    return id;
  }

  getDurableOperations(): DurableOperation[] {
    const rows = this.db
      .prepare('SELECT id, type, state, payload FROM durable_operations ORDER BY created_at, id')
      .all() as Array<{ id: string; type: DurableOperation['type']; state: DurableOperation['state']; payload: string }>;
    return rows.map((row) => ({ ...row, payload: JSON.parse(row.payload) as DurableOperation['payload'] }));
  }

  completeDurableOperation(id: string): void {
    this.db.prepare('DELETE FROM durable_operations WHERE id = ?').run(id);
  }

  commitSongDeletion(operationId: string, songIds: string[]): void {
    const ids = dedupeIds(songIds);
    this.db.transaction(() => {
      const stmt = this.db.prepare('DELETE FROM songs WHERE id = ?');
      ids.forEach((songId) => stmt.run(songId));
      this.db.prepare("UPDATE durable_operations SET state = 'db-committed' WHERE id = ?").run(operationId);
    })();
  }

  toggleFavorite(id: string): void {
    this.db.prepare('UPDATE songs SET is_favorite = 1 - is_favorite WHERE id = ?').run(id);
  }

  moveSongToFolder(songId: string, folderId: string | null): void {
    if (folderId && !this.getFolder(folderId)) {
      throw new Error(`Unknown folder: ${folderId}`);
    }
    this.db.prepare('UPDATE songs SET folder_id = ? WHERE id = ?').run(folderId, songId);
  }

  bulkMoveSongsToFolder(songIds: string[], folderId: string | null): void {
    const ids = dedupeIds(songIds);
    if (ids.length === 0) {
      return;
    }
    if (folderId && !this.getFolder(folderId)) {
      throw new Error(`Unknown folder: ${folderId}`);
    }

    const moveMany = this.db.transaction((nextIds: string[]) => {
      const stmt = this.db.prepare('UPDATE songs SET folder_id = ? WHERE id = ?');
      for (const songId of nextIds) {
        stmt.run(folderId, songId);
      }
    });
    moveMany(ids);
  }

  bulkAddTag(songIds: string[], tag: string): void {
    this.bulkUpdateTags(songIds, (tags) => {
      const normalizedTag = normalizeTag(tag);
      return normalizedTag && !tags.includes(normalizedTag) ? [...tags, normalizedTag] : tags;
    });
  }

  bulkRemoveTag(songIds: string[], tag: string): void {
    this.bulkUpdateTags(songIds, (tags) => tags.filter((entry) => entry !== normalizeTag(tag)));
  }

  private bulkUpdateTags(songIds: string[], updater: (tags: string[]) => string[]): void {
    const ids = dedupeIds(songIds);
    if (ids.length === 0) {
      return;
    }

    const updateMany = this.db.transaction((nextIds: string[]) => {
      const selectStmt = this.db.prepare('SELECT id, tags FROM songs WHERE id = ?');
      const updateStmt = this.db.prepare('UPDATE songs SET tags = ? WHERE id = ?');
      for (const songId of nextIds) {
        const row = selectStmt.get(songId) as { id: string; tags: unknown } | undefined;
        if (!row) {
          continue;
        }
        updateStmt.run(JSON.stringify(updater(parseTags(row.tags))), songId);
      }
    });
    updateMany(ids);
  }

  getCustomFingerings(songId: string): FingeringRow[] {
    const rows = this.db
      .prepare('SELECT * FROM fingerings WHERE song_id = ? ORDER BY note_id IS NULL ASC, note_index ASC')
      .all(songId) as DbRow[];
    return rows.map(rowToFingering);
  }

  saveCustomFingering(songId: string, noteIndex: number, finger: number, hand: Hand, noteId?: string): void {
    if (noteId) {
      this.db
        .prepare(`
          INSERT INTO fingerings (song_id, note_index, note_id, finger, hand)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT DO UPDATE SET finger = excluded.finger, hand = excluded.hand
            WHERE fingerings.song_id = excluded.song_id AND fingerings.note_id = excluded.note_id
        `)
        .run(songId, noteIndex, noteId, finger, hand);
      return;
    }

    this.db
      .prepare(`
        INSERT INTO fingerings (song_id, note_index, finger, hand)
        VALUES (?, ?, ?, ?)
        ON CONFLICT DO UPDATE SET finger = excluded.finger, hand = excluded.hand
          WHERE fingerings.song_id = excluded.song_id
            AND fingerings.note_id IS NULL
            AND fingerings.note_index = excluded.note_index
      `)
      .run(songId, noteIndex, finger, hand);
  }

  clearCustomFingerings(songId: string): void {
    this.db.prepare('DELETE FROM fingerings WHERE song_id = ?').run(songId);
  }

  getAllFolders(): FolderRow[] {
    const rows = this.db.prepare('SELECT * FROM folders ORDER BY sort_order ASC, name COLLATE NOCASE ASC').all() as DbRow[];
    return rows.map(rowToFolder);
  }

  createFolder(name: string): FolderRow {
    const id = randomUUID();
    const sortOrder = this.getNextSortOrder('folders');
    this.db.prepare('INSERT INTO folders (id, name, sort_order) VALUES (?, ?, ?)').run(id, name.trim(), sortOrder);
    return this.getFolder(id)!;
  }

  renameFolder(folderId: string, name: string): void {
    this.db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name.trim(), folderId);
  }

  deleteFolder(folderId: string): void {
    const removeFolder = this.db.transaction((targetFolderId: string) => {
      this.db.prepare('UPDATE songs SET folder_id = NULL WHERE folder_id = ?').run(targetFolderId);
      this.db.prepare('DELETE FROM folders WHERE id = ?').run(targetFolderId);
    });
    removeFolder(folderId);
  }

  getAllPlaylists(): PlaylistRow[] {
    const rows = this.db
      .prepare(`
        SELECT
          playlists.*,
          COUNT(playlist_songs.song_id) AS song_count
        FROM playlists
        LEFT JOIN playlist_songs ON playlist_songs.playlist_id = playlists.id
        GROUP BY playlists.id
        ORDER BY playlists.updated_at DESC, playlists.name COLLATE NOCASE ASC
      `)
      .all() as DbRow[];
    return rows.map(rowToPlaylist);
  }

  createPlaylist(name: string): PlaylistRow {
    const id = randomUUID();
    this.db.prepare('INSERT INTO playlists (id, name, description) VALUES (?, ?, \'\')').run(id, name.trim());
    return this.getPlaylist(id)!;
  }

  updatePlaylist(playlistId: string, updates: Partial<Pick<PlaylistRow, 'name' | 'description'>>): void {
    const fields: string[] = ['updated_at = @updatedAt'];
    const params: Record<string, unknown> = {
      id: playlistId,
      updatedAt: new Date().toISOString(),
    };

    if (updates.name !== undefined) {
      fields.push('name = @name');
      params.name = updates.name.trim();
    }
    if (updates.description !== undefined) {
      fields.push('description = @description');
      params.description = updates.description;
    }

    this.db.prepare(`UPDATE playlists SET ${fields.join(', ')} WHERE id = @id`).run(params);
  }

  deletePlaylist(playlistId: string): void {
    this.db.prepare('DELETE FROM playlists WHERE id = ?').run(playlistId);
  }

  getPlaylistSongs(playlistId: string): SongRow[] {
    const rows = this.db
      .prepare(`
        SELECT songs.*
        FROM playlist_songs
        INNER JOIN songs ON songs.id = playlist_songs.song_id
        WHERE playlist_songs.playlist_id = ?
        ORDER BY playlist_songs.sort_order ASC, songs.title COLLATE NOCASE ASC
      `)
      .all(playlistId) as DbRow[];
    return rows.map(rowToSong);
  }

  addSongToPlaylist(playlistId: string, songId: string): void {
    if (!this.getPlaylist(playlistId)) {
      throw new Error(`Unknown playlist: ${playlistId}`);
    }
    if (!this.getSong(songId)) {
      throw new Error(`Unknown song: ${songId}`);
    }
    const addSong = this.db.transaction((nextPlaylistId: string, nextSongId: string) => {
      const current = this.db
        .prepare('SELECT 1 FROM playlist_songs WHERE playlist_id = ? AND song_id = ?')
        .get(nextPlaylistId, nextSongId);
      if (current) {
        return;
      }

      this.db
        .prepare('INSERT INTO playlist_songs (playlist_id, song_id, sort_order) VALUES (?, ?, ?)')
        .run(nextPlaylistId, nextSongId, this.getNextPlaylistSortOrder(nextPlaylistId));
      this.touchPlaylist(nextPlaylistId);
    });
    addSong(playlistId, songId);
  }

  bulkAddToPlaylist(songIds: string[], playlistId: string): void {
    const ids = dedupeIds(songIds);
    if (ids.length === 0) {
      return;
    }
    if (!this.getPlaylist(playlistId)) {
      throw new Error(`Unknown playlist: ${playlistId}`);
    }

    const addMany = this.db.transaction((nextIds: string[], nextPlaylistId: string) => {
      for (const songId of nextIds) {
        const exists = this.db
          .prepare('SELECT 1 FROM playlist_songs WHERE playlist_id = ? AND song_id = ?')
          .get(nextPlaylistId, songId);
        if (exists) {
          continue;
        }
        this.db
          .prepare('INSERT INTO playlist_songs (playlist_id, song_id, sort_order) VALUES (?, ?, ?)')
          .run(nextPlaylistId, songId, this.getNextPlaylistSortOrder(nextPlaylistId));
      }
      this.touchPlaylist(nextPlaylistId);
    });
    addMany(ids, playlistId);
  }

  removeSongFromPlaylist(playlistId: string, songId: string): void {
    const removeSong = this.db.transaction((nextPlaylistId: string, nextSongId: string) => {
      this.db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?').run(nextPlaylistId, nextSongId);
      this.normalizePlaylistSortOrder(nextPlaylistId);
      this.touchPlaylist(nextPlaylistId);
    });
    removeSong(playlistId, songId);
  }

  reorderPlaylistSong(playlistId: string, songId: string, newOrder: number): void {
    const reorder = this.db.transaction((nextPlaylistId: string, nextSongId: string, nextOrder: number) => {
      const rows = this.db
        .prepare('SELECT song_id FROM playlist_songs WHERE playlist_id = ? ORDER BY sort_order ASC, song_id ASC')
        .all(nextPlaylistId) as Array<{ song_id: string }>;
      const songIds = rows.map((row) => row.song_id);
      const currentIndex = songIds.indexOf(nextSongId);
      if (currentIndex === -1) {
        return;
      }

      songIds.splice(currentIndex, 1);
      const clampedIndex = Math.max(0, Math.min(nextOrder, songIds.length));
      songIds.splice(clampedIndex, 0, nextSongId);

      const updateStmt = this.db.prepare(
        'UPDATE playlist_songs SET sort_order = ? WHERE playlist_id = ? AND song_id = ?',
      );
      songIds.forEach((entrySongId, index) => {
        updateStmt.run(index, nextPlaylistId, entrySongId);
      });
      this.touchPlaylist(nextPlaylistId);
    });
    reorder(playlistId, songId, newOrder);
  }

  saveGameResult(payload: SaveGameResultPayload): SaveResultOutcome {
    const id = randomUUID();
    const now = new Date().toISOString();

    const saveTransaction = this.db.transaction((): SaveResultOutcome => {
      this.db
        .prepare(`
          INSERT INTO game_results
            (id, song_id, score, accuracy, max_combo, perfect_hits, good_hits, ok_hits,
             misses, timestamp, tempo, mode, duration_sec)
          VALUES
            (@id, @songId, @score, @accuracy, @maxCombo, @perfectHits, @goodHits, @okHits,
             @misses, @timestamp, @tempo, @mode, @durationSec)
        `)
        .run({
          id,
          songId: payload.songId,
          score: payload.score,
          accuracy: payload.accuracy,
          maxCombo: payload.maxCombo,
          perfectHits: payload.perfectHits,
          goodHits: payload.goodHits,
          okHits: payload.okHits,
          misses: payload.misses,
          timestamp: now,
          tempo: payload.tempo,
          mode: payload.mode,
          durationSec: payload.durationSec,
        });

      const insertMeasureAccuracy = this.db.prepare(`
        INSERT INTO measure_accuracy_history (id, game_result_id, measure, accuracy)
        VALUES (@id, @gameResultId, @measure, @accuracy)
      `);
      for (const entry of payload.measureAccuracy) {
        insertMeasureAccuracy.run({
          id: randomUUID(),
          gameResultId: id,
          measure: entry.measure,
          accuracy: entry.accuracy,
        });
      }

      const existing = this.db
        .prepare('SELECT * FROM user_stats WHERE song_id = ?')
        .get(payload.songId) as DbRow | undefined;

      if (!existing) {
        this.db
          .prepare(`
            INSERT INTO user_stats
              (song_id, play_count, best_score, average_score, best_accuracy, last_played, total_practice_time_sec)
            VALUES
              (@songId, 1, @score, @score, @accuracy, @now, @durationSec)
          `)
          .run({
            songId: payload.songId,
            score: payload.score,
            accuracy: payload.accuracy,
            now,
            durationSec: payload.durationSec,
          });
      } else {
        const playCount = (existing.play_count as number) + 1;
        const bestScore = Math.max(existing.best_score as number, payload.score);
        const bestAccuracy = Math.max(existing.best_accuracy as number, payload.accuracy);
        const prevAvg = existing.average_score as number;
        const prevCount = existing.play_count as number;
        const newAvg = (prevAvg * prevCount + payload.score) / playCount;
        const totalTime = (existing.total_practice_time_sec as number) + payload.durationSec;

        this.db
          .prepare(`
            UPDATE user_stats SET
              play_count = @playCount,
              best_score = @bestScore,
              average_score = @newAvg,
              best_accuracy = @bestAccuracy,
              last_played = @now,
              total_practice_time_sec = @totalTime
            WHERE song_id = @songId
          `)
          .run({ playCount, bestScore, newAvg, bestAccuracy, now, totalTime, songId: payload.songId });
      }

      this.db.prepare('UPDATE songs SET times_played = times_played + 1 WHERE id = ?').run(payload.songId);

      const practiceDate = formatLocalDate(new Date());
      const priorRow = this.db
        .prepare('SELECT total_practice_time_sec FROM practice_days WHERE date = ?')
        .get(practiceDate) as { total_practice_time_sec: number } | undefined;
      const priorSec = priorRow?.total_practice_time_sec ?? 0;

      this.recordPracticeDayEntry(payload.durationSec, 1, 0);
      this.updateTroubleSpotsForSong(payload.songId, payload.measureAccuracy, now);

      const goalSetting = this.getSetting('practice', 'dailyGoalMinutes');
      const goalSec = goalSetting ? Number(goalSetting) * 60 : 0;
      const dailyGoalReached =
        goalSec > 0 && priorSec < goalSec && priorSec + payload.durationSec >= goalSec;

      const songGoalSetting = this.getSetting('song-goal', payload.songId);
      const songGoalAccuracy = songGoalSetting ? Number(songGoalSetting) : 0;
      const prevBest = (this.db
        .prepare('SELECT MAX(accuracy) AS best FROM game_results WHERE song_id = ? AND id != ?')
        .get(payload.songId, id) as { best: number | null })?.best ?? 0;
      const songGoalReached = songGoalAccuracy > 0 && prevBest < songGoalAccuracy && payload.accuracy >= songGoalAccuracy;

      return {
        unlockedAchievementIds: this.checkAndUnlockAchievements(),
        dailyGoalReached,
        songGoalReached,
      };
    });

    return saveTransaction();
  }

  getGameResults(songId: string): GameResultRow[] {
    const rows = this.db
      .prepare('SELECT * FROM game_results WHERE song_id = ? ORDER BY timestamp DESC')
      .all(songId) as DbRow[];
    return rows.map(rowToGameResult);
  }

  getUserStats(songId: string): UserStatsRow | null {
    const row = this.db.prepare('SELECT * FROM user_stats WHERE song_id = ?').get(songId) as DbRow | undefined;
    return row ? rowToUserStats(row) : null;
  }

  saveTheoryResult(payload: SaveTheoryResultPayload): SaveResultOutcome {
    const id = randomUUID();
    const now = new Date().toISOString();

    const saveTransaction = this.db.transaction((): SaveResultOutcome => {
      this.db
        .prepare(`
          INSERT INTO theory_results
            (id, type, score, total_questions, accuracy, details, timestamp)
          VALUES
            (@id, @type, @score, @totalQuestions, @accuracy, @details, @timestamp)
        `)
        .run({
          id,
          type: payload.type,
          score: payload.score,
          totalQuestions: payload.totalQuestions,
          accuracy: payload.accuracy,
          details: JSON.stringify(payload.details ?? {}),
          timestamp: now,
        });

      this.recordPracticeDayEntry(0, 0, 1);

      return {
        unlockedAchievementIds: this.checkAndUnlockAchievements(),
        dailyGoalReached: false,
        songGoalReached: false,
      };
    });

    return saveTransaction();
  }

  getTheoryResults(type?: TheoryResultRow['type'], limit = 20): TheoryResultRow[] {
    const clampedLimit = Math.max(1, Math.min(limit, 200));
    const rows = (
      type
        ? this.db
            .prepare('SELECT * FROM theory_results WHERE type = ? ORDER BY timestamp DESC LIMIT ?')
            .all(type, clampedLimit)
        : this.db.prepare('SELECT * FROM theory_results ORDER BY timestamp DESC LIMIT ?').all(clampedLimit)
    ) as DbRow[];
    return rows.map(rowToTheoryResult);
  }

  getTheoryStats(type: TheoryResultRow['type']): TheoryStatsRow {
    const row = this.db
      .prepare(`
        SELECT
          COUNT(*) AS session_count,
          COALESCE(MAX(score), 0) AS best_score,
          COALESCE(AVG(accuracy), 0) AS average_accuracy,
          MAX(timestamp) AS last_played
        FROM theory_results
        WHERE type = ?
      `)
      .get(type) as DbRow;

    return {
      type,
      sessionCount: row.session_count as number,
      bestScore: row.best_score as number,
      averageAccuracy: row.average_accuracy as number,
      lastPlayed: (row.last_played as string | null | undefined) ?? null,
    };
  }

  getPracticeDays(fromDate: string, toDate: string): PracticeDayRow[] {
    const rows = this.db
      .prepare(`
        SELECT *
        FROM practice_days
        WHERE date BETWEEN ? AND ?
        ORDER BY date ASC
      `)
      .all(fromDate, toDate) as DbRow[];

    return rows.map(rowToPracticeDay);
  }

  recordPracticeTime(durationSec: number, songsPlayed: number, theorySessions: number): void {
    this.recordPracticeDayEntry(durationSec, songsPlayed, theorySessions);
  }

  getPracticeStreak(): PracticeStreak {
    const rows = this.db
      .prepare('SELECT date FROM practice_days WHERE total_practice_time_sec > 0 OR songs_played > 0 OR theory_sessions > 0 ORDER BY date ASC')
      .all() as Array<{ date: string }>;

    const freezeDates = this.getStreakFreezeUsedDates();
    const streakFreezes = this.getStreakFreezeCount();
    return { ...calculatePracticeStreak(rows.map((row) => row.date), new Date(), freezeDates), streakFreezes };
  }

  private getStreakFreezeCount(): number {
    const val = this.getSetting('progress', 'streakFreezes');
    return val ? Math.max(0, parseInt(val, 10)) : 0;
  }

  private getStreakFreezeUsedDates(): string[] {
    const val = this.getSetting('progress', 'streakFreezeUsedDates');
    if (!val) return [];
    try { return JSON.parse(val) as string[]; } catch { return []; }
  }

  private applyStreakFreezeIfNeeded(): void {
    const practiceDates = (this.db
      .prepare('SELECT date FROM practice_days WHERE total_practice_time_sec > 0 OR songs_played > 0 OR theory_sessions > 0 ORDER BY date DESC')
      .all() as Array<{ date: string }>).map((r) => r.date);

    const usedDates = this.getStreakFreezeUsedDates();
    const freezeCount = this.getStreakFreezeCount();
    const consumption = resolveStreakFreezeConsumption(practiceDates, new Date(), freezeCount, usedDates);
    if (!consumption.consumedDate) {
      return;
    }

    this.setSetting('progress', 'streakFreezeUsedDates', JSON.stringify(consumption.usedDates));
    this.setSetting('progress', 'streakFreezes', String(consumption.freezeCount));
  }

  private awardStreakFreezeForMilestone(): void {
    const rows = (this.db
      .prepare('SELECT date FROM practice_days WHERE total_practice_time_sec > 0 OR songs_played > 0 OR theory_sessions > 0 ORDER BY date ASC')
      .all() as Array<{ date: string }>).map((r) => r.date);

    const usedDates = this.getStreakFreezeUsedDates();
    const streak = calculatePracticeStreak(rows, new Date(), usedDates);
    const current = streak.currentStreak;
    const shouldAward = shouldAwardStreakFreezeForMilestone(current);
    if (!shouldAward) {
      return;
    }

    const already = this.getSetting('progress', `streakFreezeMilestone${current}`);
    if (!already) {
      this.setSetting('progress', `streakFreezeMilestone${current}`, '1');
      const cur = this.getStreakFreezeCount();
      this.setSetting('progress', 'streakFreezes', String(cur + 1));
    }
  }

  getAllAchievements(): AchievementRow[] {
    const rows = this.db.prepare('SELECT * FROM achievements ORDER BY id ASC').all() as DbRow[];
    return rows.map(rowToAchievement);
  }

  unlockAchievement(achievementId: string): void {
    this.db
      .prepare('UPDATE achievements SET unlocked_at = COALESCE(unlocked_at, ?) WHERE id = ?')
      .run(new Date().toISOString(), achievementId);
  }

  getTroubleSpots(songId: string): TroubleSpotRow[] {
    const rows = this.db
      .prepare(`
        SELECT
          ts.*,
          (
            SELECT COUNT(*)
            FROM measure_accuracy_history mah
            INNER JOIN game_results gr ON gr.id = mah.game_result_id
            WHERE gr.song_id = ts.song_id
              AND mah.measure BETWEEN ts.measure_start AND ts.measure_end
              AND mah.accuracy < 70
          ) AS struggle_count,
          (
            SELECT MIN(mah.accuracy)
            FROM measure_accuracy_history mah
            INNER JOIN game_results gr ON gr.id = mah.game_result_id
            WHERE gr.song_id = ts.song_id
              AND mah.measure BETWEEN ts.measure_start AND ts.measure_end
          ) AS lowest_accuracy,
          (
            SELECT mah.accuracy
            FROM measure_accuracy_history mah
            INNER JOIN game_results gr ON gr.id = mah.game_result_id
            WHERE gr.song_id = ts.song_id
              AND mah.measure BETWEEN ts.measure_start AND ts.measure_end
            ORDER BY gr.timestamp DESC, mah.rowid DESC
            LIMIT 1
          ) AS latest_accuracy
        FROM trouble_spots ts
        WHERE ts.song_id = ?
        ORDER BY ts.is_resolved ASC, ts.measure_start ASC, ts.first_detected ASC
      `)
      .all(songId) as DbRow[];

    return rows.map(rowToTroubleSpot);
  }

  updateTroubleSpot(spotId: string, updates: UpdateTroubleSpotPayload): void {
    const fields: string[] = [];
    const params: Record<string, unknown> = { id: spotId };

    if (updates.measureStart !== undefined) {
      fields.push('measure_start = @measureStart');
      params.measureStart = updates.measureStart;
    }
    if (updates.measureEnd !== undefined) {
      fields.push('measure_end = @measureEnd');
      params.measureEnd = updates.measureEnd;
    }
    if (updates.firstDetected !== undefined) {
      fields.push('first_detected = @firstDetected');
      params.firstDetected = updates.firstDetected;
    }
    if (updates.lastPracticed !== undefined) {
      fields.push('last_practiced = @lastPracticed');
      params.lastPracticed = updates.lastPracticed;
    }
    if (updates.resolutionCount !== undefined) {
      fields.push('resolution_count = @resolutionCount');
      params.resolutionCount = updates.resolutionCount;
    }
    if (updates.isResolved !== undefined) {
      fields.push('is_resolved = @isResolved');
      params.isResolved = updates.isResolved ? 1 : 0;
    }

    if (fields.length === 0) {
      return;
    }

    this.db.prepare(`UPDATE trouble_spots SET ${fields.join(', ')} WHERE id = @id`).run(params);
  }

  getMeasureAccuracyHistory(songId: string): MeasureAccuracyHistoryRow[] {
    const rows = this.db
      .prepare(`
        SELECT mah.*
        FROM measure_accuracy_history mah
        INNER JOIN game_results gr ON gr.id = mah.game_result_id
        WHERE gr.song_id = ?
        ORDER BY gr.timestamp DESC, mah.measure ASC
      `)
      .all(songId) as DbRow[];

    return rows.map(rowToMeasureAccuracyHistory);
  }

  getRecommendations(): RecommendationResult {
    const songs = this.getAllSongs();
    const statsRows = this.db.prepare('SELECT * FROM user_stats').all() as DbRow[];
    const userStatsBySongId = Object.fromEntries(statsRows.map((row) => {
      const stats = rowToUserStats(row);
      return [stats.songId, stats] as const;
    }));

    const recentResults30 = this.db
      .prepare(`
        SELECT *
        FROM game_results
        WHERE datetime(timestamp) >= datetime('now', '-30 days')
        ORDER BY timestamp DESC
      `)
      .all() as DbRow[];
    const recentResults60 = this.db
      .prepare(`
        SELECT *
        FROM game_results
        WHERE datetime(timestamp) >= datetime('now', '-60 days')
        ORDER BY timestamp DESC
      `)
      .all() as DbRow[];

    return generateRecommendations({
      songs,
      userStatsBySongId,
      recentResults30: recentResults30.map(rowToGameResult),
      recentResults60: recentResults60.map(rowToGameResult),
    });
  }

  getProgressStats(fromDate: string, toDate: string): ProgressStatsResult {
    const practiceRows = this.getPracticeDays(fromDate, toDate);
    const practiceDaysByDate = new Map(practiceRows.map((row) => [row.date, row]));

    const songsPlayedByWeekRows = this.db
      .prepare(`
        SELECT
          date(date, '-' || ((CAST(strftime('%w', date) AS INTEGER) + 6) % 7) || ' days') AS week_start,
          SUM(songs_played) AS count
        FROM practice_days
        WHERE date BETWEEN ? AND ?
        GROUP BY week_start
        ORDER BY week_start ASC
      `)
      .all(fromDate, toDate) as DbRow[];

    const accuracyTrendRows = this.db
      .prepare(`
        SELECT
          substr(timestamp, 1, 10) AS date,
          AVG(accuracy) AS avg_accuracy
        FROM game_results
        WHERE substr(timestamp, 1, 10) BETWEEN ? AND ?
        GROUP BY substr(timestamp, 1, 10)
        ORDER BY date ASC
      `)
      .all(fromDate, toDate) as DbRow[];

    const totalStats = this.db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM songs) AS total_songs,
          (SELECT COUNT(*) FROM user_stats WHERE best_accuracy >= 90) AS songs_mastered,
          (SELECT COALESCE(SUM(total_practice_time_sec), 0) FROM practice_days) AS total_practice_time_sec,
          (
            SELECT COALESCE(s.genre, '')
            FROM songs s
            INNER JOIN user_stats us ON us.song_id = s.id
            WHERE TRIM(s.genre) <> ''
            GROUP BY s.genre
            ORDER BY SUM(us.play_count) DESC, s.genre ASC
            LIMIT 1
          ) AS favorite_genre
      `)
      .get() as DbRow;

    const hitQualityRow = this.db
      .prepare(`
        SELECT
          COALESCE(SUM(perfect_hits), 0) AS perfect,
          COALESCE(SUM(good_hits), 0) AS good,
          COALESCE(SUM(ok_hits), 0) AS ok,
          COALESCE(SUM(misses), 0) AS misses
        FROM game_results
        WHERE substr(timestamp, 1, 10) BETWEEN ? AND ?
      `)
      .get(fromDate, toDate) as DbRow;

    return {
      practiceTimeByDay: buildPracticeDaySeries(fromDate, toDate, practiceDaysByDate),
      theorySessionsByDay: buildTheorySessionSeries(fromDate, toDate, practiceDaysByDate),
      songsPlayedByWeek: songsPlayedByWeekRows.map((row) => ({
        weekStart: row.week_start as string,
        count: row.count as number,
      })),
      accuracyTrend: accuracyTrendRows.map((row) => ({
        date: row.date as string,
        avgAccuracy: Math.round(((row.avg_accuracy as number) ?? 0) * 10) / 10,
      })),
      hitQuality: {
        perfect: hitQualityRow.perfect as number,
        good: hitQualityRow.good as number,
        ok: hitQualityRow.ok as number,
        misses: hitQualityRow.misses as number,
      },
      totalStats: {
        totalSongs: totalStats.total_songs as number,
        songsMastered: totalStats.songs_mastered as number,
        totalPracticeTimeSec: totalStats.total_practice_time_sec as number,
        favoriteGenre: (totalStats.favorite_genre as string) || 'Unspecified',
      },
    };
  }

  getProgressTopSongs(limit = 8): TopSongStat[] {
    const rows = this.db
      .prepare(`
        SELECT us.song_id, s.title, us.play_count, us.best_accuracy, us.total_practice_time_sec
        FROM user_stats us
        INNER JOIN songs s ON s.id = us.song_id
        WHERE us.play_count > 0
        ORDER BY us.play_count DESC, us.best_accuracy DESC
        LIMIT ?
      `)
      .all(limit) as DbRow[];

    return rows.map((row) => ({
      songId: row.song_id as string,
      title: row.title as string,
      playCount: row.play_count as number,
      bestAccuracy: row.best_accuracy as number,
      totalPracticeTimeSec: row.total_practice_time_sec as number,
    }));
  }

  getAllUnresolvedTroubleSpots(limit = 8): GlobalTroubleSpot[] {
    const rows = this.db
      .prepare(`
        SELECT
          ts.id,
          ts.song_id,
          s.title AS song_title,
          ts.measure_start,
          ts.measure_end,
          (
            SELECT COUNT(*)
            FROM measure_accuracy_history mah
            INNER JOIN game_results gr ON gr.id = mah.game_result_id
            WHERE gr.song_id = ts.song_id
              AND mah.measure BETWEEN ts.measure_start AND ts.measure_end
              AND mah.accuracy < 70
          ) AS struggle_count,
          (
            SELECT MIN(mah.accuracy)
            FROM measure_accuracy_history mah
            INNER JOIN game_results gr ON gr.id = mah.game_result_id
            WHERE gr.song_id = ts.song_id
              AND mah.measure BETWEEN ts.measure_start AND ts.measure_end
          ) AS lowest_accuracy,
          (
            SELECT mah.accuracy
            FROM measure_accuracy_history mah
            INNER JOIN game_results gr ON gr.id = mah.game_result_id
            WHERE gr.song_id = ts.song_id
              AND mah.measure BETWEEN ts.measure_start AND ts.measure_end
            ORDER BY gr.timestamp DESC, mah.rowid DESC
            LIMIT 1
          ) AS latest_accuracy
        FROM trouble_spots ts
        INNER JOIN songs s ON s.id = ts.song_id
        WHERE ts.is_resolved = 0
        ORDER BY struggle_count DESC, ts.first_detected ASC
        LIMIT ?
      `)
      .all(limit) as DbRow[];

    return rows.map((row) => ({
      id: row.id as string,
      songId: row.song_id as string,
      songTitle: row.song_title as string,
      measureStart: row.measure_start as number,
      measureEnd: row.measure_end as number,
      struggleCount: (row.struggle_count as number | undefined) ?? 0,
      lowestAccuracy: (row.lowest_accuracy as number | null | undefined) ?? null,
      latestAccuracy: (row.latest_accuracy as number | null | undefined) ?? null,
    }));
  }

  getLibrarySnapshot(): LibrarySnapshot {
    const songs = this.getAllSongs();
    const statsBySongId = Object.fromEntries(
      songs.map((song) => [song.id, this.getUserStats(song.id)] as const),
    );
    const songGoals = Object.fromEntries(
      songs.map((song) => {
        const value = this.getSetting('song-goal', song.id);
        return [song.id, value ? Number(value) : 0] as const;
      }),
    );

    return {
      songs,
      folders: this.getAllFolders(),
      playlists: this.getAllPlaylists(),
      recommendations: this.getRecommendations(),
      statsBySongId,
      songGoals,
    };
  }

  private recordPracticeDayEntry(durationSec: number, songsPlayed: number, theorySessions: number): void {
    const practiceDate = formatLocalDate(new Date());

    this.db
      .prepare(`
        INSERT INTO practice_days (date, total_practice_time_sec, songs_played, theory_sessions)
        VALUES (@date, @durationSec, @songsPlayed, @theorySessions)
        ON CONFLICT(date) DO UPDATE SET
          total_practice_time_sec = total_practice_time_sec + excluded.total_practice_time_sec,
          songs_played = songs_played + excluded.songs_played,
          theory_sessions = theory_sessions + excluded.theory_sessions
      `)
      .run({
        date: practiceDate,
        durationSec,
        songsPlayed,
        theorySessions,
      });

    this.applyStreakFreezeIfNeeded();
    this.awardStreakFreezeForMilestone();
  }

  private updateTroubleSpotsForSong(
    songId: string,
    measureAccuracy: SaveGameResultPayload['measureAccuracy'],
    practicedAt: string,
  ): void {
    const existingRows = this.db
      .prepare('SELECT * FROM trouble_spots WHERE song_id = ? ORDER BY measure_start ASC')
      .all(songId) as DbRow[];
    const byMeasure = new Map(existingRows.map((row) => [row.measure_start as number, row]));

    for (const entry of measureAccuracy) {
      const existing = byMeasure.get(entry.measure);

      if (entry.accuracy < 70) {
        if (!existing) {
          this.db
            .prepare(`
              INSERT INTO trouble_spots
                (id, song_id, measure_start, measure_end, first_detected, last_practiced, resolution_count, is_resolved)
              VALUES
                (@id, @songId, @measureStart, @measureEnd, @firstDetected, @lastPracticed, 0, 0)
            `)
            .run({
              id: randomUUID(),
              songId,
              measureStart: entry.measure,
              measureEnd: entry.measure,
              firstDetected: practicedAt,
              lastPracticed: practicedAt,
            });
          continue;
        }

        this.db
          .prepare(`
            UPDATE trouble_spots
            SET
              last_practiced = @lastPracticed,
              resolution_count = 0,
              is_resolved = 0
            WHERE id = @id
          `)
          .run({
            id: existing.id,
            lastPracticed: practicedAt,
          });
        continue;
      }

      if (!existing) {
        continue;
      }

      if (entry.accuracy > 85) {
        const nextResolutionCount = (existing.resolution_count as number) + 1;
        this.db
          .prepare(`
            UPDATE trouble_spots
            SET
              last_practiced = @lastPracticed,
              resolution_count = @resolutionCount,
              is_resolved = @isResolved
            WHERE id = @id
          `)
          .run({
            id: existing.id,
            lastPracticed: practicedAt,
            resolutionCount: nextResolutionCount,
            isResolved: nextResolutionCount >= 3 ? 1 : 0,
          });
      } else {
        this.db
          .prepare('UPDATE trouble_spots SET last_practiced = ? WHERE id = ?')
          .run(practicedAt, existing.id);
      }
    }
  }

  private checkAndUnlockAchievements(): string[] {
    const unlockedIds = new Set(
      (
        this.db
          .prepare('SELECT id FROM achievements WHERE unlocked_at IS NOT NULL')
          .all() as Array<{ id: string }>
      ).map((row) => row.id),
    );
    const metrics = this.buildAchievementMetrics();
    const unlockableIds = getUnlockableAchievementIds(metrics, unlockedIds);

    if (unlockableIds.length === 0) {
      return [];
    }

    const now = new Date().toISOString();
    const unlockStatement = this.db.prepare('UPDATE achievements SET unlocked_at = COALESCE(unlocked_at, ?) WHERE id = ?');
    for (const achievementId of unlockableIds) {
      unlockStatement.run(now, achievementId);
    }

    return unlockableIds;
  }

  private buildAchievementMetrics(): AchievementMetrics {
    const row = this.db
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM game_results) AS completed_song_sessions,
          EXISTS(SELECT 1 FROM game_results WHERE accuracy >= 100) AS has_perfect_score,
          (SELECT COUNT(*) FROM theory_results) AS theory_session_count,
          (SELECT COUNT(*) FROM user_stats WHERE best_accuracy >= 90) AS mastered_song_count
      `)
      .get() as DbRow;

    const streak = this.getPracticeStreak();

    return {
      completedSongSessions: row.completed_song_sessions as number,
      hasPerfectScore: Boolean(row.has_perfect_score),
      currentStreak: streak.currentStreak,
      theorySessionCount: row.theory_session_count as number,
      masteredSongCount: row.mastered_song_count as number,
    };
  }

  getSetting(category: string, key: string): string | null {
    return this.settings.get(category, key);
  }

  getAllSettings(): SettingRow[] {
    return this.settings.getAll();
  }

  setSetting(category: string, key: string, value: string): void {
    this.settings.set(category, key, value);
  }

  resetLearningProgress(): void {
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM measure_accuracy_history').run();
      this.db.prepare('DELETE FROM trouble_spots').run();
      this.db.prepare('DELETE FROM game_results').run();
      this.db.prepare('DELETE FROM theory_results').run();
      this.db.prepare('DELETE FROM user_stats').run();
      this.db.prepare('DELETE FROM practice_days').run();
      this.db.prepare('DELETE FROM achievements').run();
      this.settings.deleteLearningProgress();
      this.db.prepare('UPDATE songs SET times_played = 0').run();
      this.seedAchievements();
    })();
  }

  resetUserData(): void {
    this.db.transaction(() => {
      this.resetUserDataRows();
    })();
  }

  commitUserDataReset(operationId: string): void {
    this.db.transaction(() => {
      this.resetUserDataRows();
      this.db.prepare("UPDATE durable_operations SET state = 'db-committed' WHERE id = ?").run(operationId);
    })();
  }

  async recoverDurableOperations(
    midiStorage: MidiStorageAdapter,
    recoverReset?: (operationId: string, state: DurableOperation['state']) => Promise<void>,
  ): Promise<Array<{ operation: DurableOperation; error: unknown }>> {
    // One operation that cannot finish (a locked leftover directory, say) must not keep
    // the app from starting. Its row stays, so the next start tries it again.
    const failures: Array<{ operation: DurableOperation; error: unknown }> = [];
    for (const operation of this.getDurableOperations()) {
      try {
        if (operation.type === 'delete-songs') {
          if (operation.state === 'prepared') {
            await midiStorage.rollbackDelete?.(operation.id);
          } else {
            await midiStorage.commitDelete?.(operation.id);
          }
        } else if (operation.type === 'restore-library') {
          if (operation.state === 'prepared') {
            await midiStorage.rollbackRestore?.(operation.id);
          } else {
            await midiStorage.commitRestore?.(operation.id);
          }
        } else if (operation.state === 'prepared') {
          await midiStorage.rollbackReset?.(operation.id);
        } else {
          await midiStorage.commitReset?.(operation.id);
        }
        if (operation.type === 'reset-user-data') {
          await recoverReset?.(operation.id, operation.state);
        }
        this.completeDurableOperation(operation.id);
      } catch (error) {
        console.error(`Could not finish the interrupted ${operation.type} operation ${operation.id}; trying again at the next start:`, error);
        failures.push({ operation, error });
      }
    }
    return failures;
  }

  private resetUserDataRows(): void {
    this.db.prepare('DELETE FROM measure_accuracy_history').run();
    this.db.prepare('DELETE FROM trouble_spots').run();
    this.db.prepare('DELETE FROM game_results').run();
    this.db.prepare('DELETE FROM theory_results').run();
    this.db.prepare('DELETE FROM user_stats').run();
    this.db.prepare('DELETE FROM practice_days').run();
    this.db.prepare('DELETE FROM fingerings').run();
    this.db.prepare('DELETE FROM playlist_songs').run();
    this.db.prepare('DELETE FROM playlists').run();
    this.db.prepare('DELETE FROM folders').run();
    this.db.prepare('DELETE FROM songs').run();
    this.settings.deleteAll();
    this.db.prepare('DELETE FROM achievements').run();
    this.seedAchievements();
  }

  exportLibraryData(): LibraryBackupV1 {
    const playlists = this.getAllPlaylists().map((playlist) => ({
      ...playlist,
      songIds: (
        this.db
          .prepare('SELECT song_id FROM playlist_songs WHERE playlist_id = ? ORDER BY sort_order ASC')
          .all(playlist.id) as Array<{ song_id: string }>
      ).map((row) => row.song_id),
    }));
    const fingerings = this.db.prepare('SELECT * FROM fingerings ORDER BY song_id, note_index').all() as DbRow[];

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      songs: this.getAllSongs(),
      folders: this.getAllFolders(),
      playlists,
      fingerings: fingerings.map(rowToFingering),
      settings: this.getAllSettings(),
    };
  }

  importLibraryData(backup: LibraryBackup, operationId?: string): LibraryImportResult {
    const importTransaction = this.db.transaction((nextBackup: LibraryBackup) => {
      const folderIdMap = new Map<string, string | null>();
      let foldersImported = 0;
      let playlistsImported = 0;

      for (const folder of nextBackup.folders) {
        const existingByName = this.db.prepare('SELECT id FROM folders WHERE name = ?').get(folder.name) as
          | { id: string }
          | undefined;
        const targetId = existingByName?.id ?? folder.id;
        this.db
          .prepare(`
            INSERT INTO folders (id, name, sort_order, created_at)
            VALUES (@id, @name, @sortOrder, @createdAt)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              sort_order = excluded.sort_order,
              created_at = excluded.created_at
          `)
          .run({
            id: targetId,
            name: folder.name,
            sortOrder: folder.sortOrder,
            createdAt: folder.createdAt,
          });
        folderIdMap.set(folder.id, targetId);
        foldersImported += 1;
      }

      for (const song of nextBackup.songs) {
        const targetFolderId = song.folderId ? folderIdMap.get(song.folderId) ?? null : null;
        this.db
          .prepare(`
            INSERT INTO songs
              (id, title, artist, genre, file_path, difficulty, duration_sec, bpm, note_count, date_added,
               times_played, tags, is_favorite, folder_id, track_assignments)
            VALUES
              (@id, @title, @artist, @genre, @filePath, @difficulty, @durationSec, @bpm, @noteCount, @dateAdded,
               @timesPlayed, @tags, @isFavorite, @folderId, @trackAssignments)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              artist = excluded.artist,
              genre = excluded.genre,
              file_path = excluded.file_path,
              difficulty = excluded.difficulty,
              duration_sec = excluded.duration_sec,
              bpm = excluded.bpm,
              note_count = excluded.note_count,
              date_added = excluded.date_added,
              times_played = excluded.times_played,
              tags = excluded.tags,
              is_favorite = excluded.is_favorite,
              folder_id = excluded.folder_id,
              track_assignments = excluded.track_assignments
          `)
          .run({
            id: song.id,
            title: song.title,
            artist: song.artist,
            genre: song.genre,
            filePath: song.filePath,
            difficulty: song.difficulty,
            durationSec: song.durationSec,
            bpm: song.bpm,
            noteCount: song.noteCount,
            dateAdded: song.dateAdded,
            timesPlayed: song.timesPlayed,
            tags: JSON.stringify(song.tags),
            isFavorite: song.isFavorite ? 1 : 0,
            folderId: targetFolderId,
            trackAssignments: JSON.stringify(song.trackAssignments),
          });
      }

      for (const fingering of nextBackup.fingerings) {
        const songExists = this.db.prepare('SELECT 1 FROM songs WHERE id = ?').get(fingering.songId);
        if (!songExists) {
          continue;
        }
        this.saveCustomFingering(fingering.songId, fingering.noteIndex, fingering.finger, fingering.hand, fingering.noteId);
      }

      for (const setting of nextBackup.settings) {
        this.setSetting(setting.category, setting.key, setting.value);
      }

      for (const playlist of nextBackup.playlists) {
        const existingByName = this.db.prepare('SELECT id FROM playlists WHERE name = ?').get(playlist.name) as
          | { id: string }
          | undefined;
        const targetId = existingByName?.id ?? playlist.id;
        this.db
          .prepare(`
            INSERT INTO playlists (id, name, description, created_at, updated_at)
            VALUES (@id, @name, @description, @createdAt, @updatedAt)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              description = excluded.description,
              created_at = excluded.created_at,
              updated_at = excluded.updated_at
          `)
          .run({
            id: targetId,
            name: playlist.name,
            description: playlist.description,
            createdAt: playlist.createdAt,
            updatedAt: playlist.updatedAt,
          });

        this.db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ?').run(targetId);
        playlist.songIds.forEach((songId, index) => {
          const songExists = this.db.prepare('SELECT 1 FROM songs WHERE id = ?').get(songId);
          if (!songExists) {
            return;
          }
          this.db
            .prepare('INSERT INTO playlist_songs (playlist_id, song_id, sort_order) VALUES (?, ?, ?)')
            .run(targetId, songId, index);
        });
        this.touchPlaylist(targetId, playlist.updatedAt);
        playlistsImported += 1;
      }

      if (operationId) {
        this.db.prepare("UPDATE durable_operations SET state = 'db-committed' WHERE id = ?").run(operationId);
      }

      return {
        songsImported: nextBackup.songs.length,
        foldersImported,
        playlistsImported,
        midiFilesRestored: 0,
        missingMidiFiles: [],
      };
    });

    return importTransaction(backup);
  }

  close(): void {
    this.db.close();
  }

  private getFolder(id: string): FolderRow | null {
    const row = this.db.prepare('SELECT * FROM folders WHERE id = ?').get(id) as DbRow | undefined;
    return row ? rowToFolder(row) : null;
  }

  private getPlaylist(id: string): PlaylistRow | null {
    const row = this.db
      .prepare(`
        SELECT playlists.*, COUNT(playlist_songs.song_id) AS song_count
        FROM playlists
        LEFT JOIN playlist_songs ON playlist_songs.playlist_id = playlists.id
        WHERE playlists.id = ?
        GROUP BY playlists.id
      `)
      .get(id) as DbRow | undefined;
    return row ? rowToPlaylist(row) : null;
  }

  private getNextSortOrder(tableName: 'folders'): number {
    const row = this.db.prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM ${tableName}`).get() as {
      nextOrder: number;
    };
    return row.nextOrder;
  }

  private getNextPlaylistSortOrder(playlistId: string): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextOrder FROM playlist_songs WHERE playlist_id = ?')
      .get(playlistId) as { nextOrder: number };
    return row.nextOrder;
  }

  private normalizePlaylistSortOrder(playlistId: string): void {
    const rows = this.db
      .prepare('SELECT song_id FROM playlist_songs WHERE playlist_id = ? ORDER BY sort_order ASC, song_id ASC')
      .all(playlistId) as Array<{ song_id: string }>;
    const updateStmt = this.db.prepare(
      'UPDATE playlist_songs SET sort_order = ? WHERE playlist_id = ? AND song_id = ?',
    );
    rows.forEach((row, index) => {
      updateStmt.run(index, playlistId, row.song_id);
    });
  }

  private touchPlaylist(playlistId: string, timestamp = new Date().toISOString()): void {
    this.db.prepare('UPDATE playlists SET updated_at = ? WHERE id = ?').run(timestamp, playlistId);
  }
}

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids.filter((id) => id.trim() !== ''))];
}

function normalizeTag(tag: string): string {
  return tag.trim();
}

function parseTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((entry): entry is string => typeof entry === 'string');
    }
  } catch {
    // Fall through to comma split for legacy rows.
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseTrackAssignments(value: unknown): Record<string, TrackAssignment> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, TrackAssignment>;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, TrackAssignment>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function rowToSong(row: DbRow): SongRow {
  return {
    id: row.id as string,
    title: row.title as string,
    artist: row.artist as string,
    genre: row.genre as string,
    filePath: row.file_path as string,
    difficulty: row.difficulty as number,
    durationSec: row.duration_sec as number,
    bpm: row.bpm as number,
    noteCount: row.note_count as number,
    dateAdded: row.date_added as string,
    timesPlayed: row.times_played as number,
    tags: parseTags(row.tags),
    isFavorite: (row.is_favorite as number) === 1,
    folderId: (row.folder_id as string | null | undefined) ?? null,
    trackAssignments: parseTrackAssignments(row.track_assignments),
  };
}

function rowToFolder(row: DbRow): FolderRow {
  return {
    id: row.id as string,
    name: row.name as string,
    sortOrder: row.sort_order as number,
    createdAt: row.created_at as string,
  };
}

function rowToPlaylist(row: DbRow): PlaylistRow {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    songCount: row.song_count as number | undefined,
  };
}

function rowToFingering(row: DbRow): FingeringRow {
  return {
    songId: row.song_id as string,
    noteIndex: row.note_index as number,
    ...(typeof row.note_id === 'string' ? { noteId: row.note_id } : {}),
    finger: row.finger as number,
    hand: row.hand as Hand,
  };
}

function rowToGameResult(row: DbRow): GameResultRow {
  return {
    id: row.id as string,
    songId: row.song_id as string,
    score: row.score as number,
    accuracy: row.accuracy as number,
    maxCombo: row.max_combo as number,
    perfectHits: row.perfect_hits as number,
    goodHits: row.good_hits as number,
    okHits: row.ok_hits as number,
    misses: row.misses as number,
    timestamp: row.timestamp as string,
    tempo: row.tempo as number,
    mode: row.mode as GameResultRow['mode'],
    durationSec: row.duration_sec as number,
  };
}

function rowToPracticeDay(row: DbRow): PracticeDayRow {
  return {
    date: row.date as string,
    totalPracticeTimeSec: row.total_practice_time_sec as number,
    songsPlayed: row.songs_played as number,
    theorySessions: row.theory_sessions as number,
  };
}

function rowToUserStats(row: DbRow): UserStatsRow {
  return {
    songId: row.song_id as string,
    playCount: row.play_count as number,
    bestScore: row.best_score as number,
    averageScore: row.average_score as number,
    bestAccuracy: row.best_accuracy as number,
    lastPlayed: row.last_played as string | null,
    totalPracticeTimeSec: row.total_practice_time_sec as number,
  };
}

function rowToAchievement(row: DbRow): AchievementRow {
  return {
    id: row.id as string,
    unlockedAt: (row.unlocked_at as string | null | undefined) ?? null,
  };
}

function rowToTroubleSpot(row: DbRow): TroubleSpotRow {
  return {
    id: row.id as string,
    songId: row.song_id as string,
    measureStart: row.measure_start as number,
    measureEnd: row.measure_end as number,
    firstDetected: row.first_detected as string,
    lastPracticed: (row.last_practiced as string | null | undefined) ?? null,
    resolutionCount: row.resolution_count as number,
    isResolved: (row.is_resolved as number) === 1,
    struggleCount: (row.struggle_count as number | undefined) ?? 0,
    lowestAccuracy: (row.lowest_accuracy as number | null | undefined) ?? null,
    latestAccuracy: (row.latest_accuracy as number | null | undefined) ?? null,
  };
}

function rowToMeasureAccuracyHistory(row: DbRow): MeasureAccuracyHistoryRow {
  return {
    id: row.id as string,
    gameResultId: row.game_result_id as string,
    measure: row.measure as number,
    accuracy: row.accuracy as number,
  };
}

function rowToTheoryResult(row: DbRow): TheoryResultRow {
  return {
    id: row.id as string,
    type: row.type as TheoryResultRow['type'],
    score: row.score as number,
    totalQuestions: row.total_questions as number,
    accuracy: row.accuracy as number,
    details: parseJsonObject(row.details),
    timestamp: row.timestamp as string,
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore invalid JSON payloads in legacy rows.
  }

  return {};
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculatePracticeStreak(
  dates: string[],
  currentDate: Date,
  freezeDates: string[] = [],
): Omit<PracticeStreak, 'streakFreezes'> {
  if (dates.length === 0) {
    return {
      currentStreak: 0,
      longestStreak: 0,
    };
  }

  const uniqueDates = [...new Set([...dates, ...freezeDates])].sort((left, right) => left.localeCompare(right));
  let longestStreak = 1;
  let runningStreak = 1;

  for (let index = 1; index < uniqueDates.length; index += 1) {
    const previous = new Date(`${uniqueDates[index - 1]}T00:00:00`);
    const current = new Date(`${uniqueDates[index]}T00:00:00`);
    const dayDelta = Math.round((current.getTime() - previous.getTime()) / 86_400_000);

    if (dayDelta === 1) {
      runningStreak += 1;
      longestStreak = Math.max(longestStreak, runningStreak);
    } else {
      runningStreak = 1;
    }
  }

  const dateSet = new Set(uniqueDates);
  let currentStreak = 0;
  const cursor = new Date(currentDate);
  while (dateSet.has(formatLocalDate(cursor))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    currentStreak,
    longestStreak,
  };
}

export function shouldAwardStreakFreezeForMilestone(currentStreak: number): boolean {
  return currentStreak > 0 && currentStreak % 14 === 0;
}

export function resolveStreakFreezeConsumption(
  practiceDates: string[],
  currentDate: Date,
  freezeCount: number,
  usedDates: string[],
): {
  consumedDate: string | null;
  freezeCount: number;
  usedDates: string[];
} {
  if (practiceDates.length === 0 || freezeCount <= 0) {
    return {
      consumedDate: null,
      freezeCount,
      usedDates,
    };
  }

  const today = formatLocalDate(currentDate);
  const dateSet = new Set(practiceDates);
  if (!dateSet.has(today)) {
    return {
      consumedDate: null,
      freezeCount,
      usedDates,
    };
  }

  const yesterday = formatLocalDate(new Date(currentDate.getTime() - 86_400_000));
  const usedSet = new Set(usedDates);
  if (dateSet.has(yesterday) || usedSet.has(yesterday)) {
    return {
      consumedDate: null,
      freezeCount,
      usedDates,
    };
  }

  const prevPractice = practiceDates.find((date) => date < today && !usedSet.has(date));
  if (!prevPractice) {
    return {
      consumedDate: null,
      freezeCount,
      usedDates,
    };
  }

  const prevDate = new Date(`${prevPractice}T00:00:00`);
  const todayDate = new Date(`${today}T00:00:00`);
  const gapDays = Math.round((todayDate.getTime() - prevDate.getTime()) / 86_400_000);
  if (gapDays !== 2) {
    return {
      consumedDate: null,
      freezeCount,
      usedDates,
    };
  }

  return {
    consumedDate: yesterday,
    freezeCount: freezeCount - 1,
    usedDates: [...usedDates, yesterday],
  };
}

function buildPracticeDaySeries(
  fromDate: string,
  toDate: string,
  rowsByDate: Map<string, PracticeDayRow>,
): Array<{ date: string; minutes: number }> {
  const series: Array<{ date: string; minutes: number }> = [];
  const cursor = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);

  while (cursor.getTime() <= end.getTime()) {
    const date = formatLocalDate(cursor);
    const row = rowsByDate.get(date);
    series.push({
      date,
      minutes: Math.round((((row?.totalPracticeTimeSec ?? 0) / 60) * 10)) / 10,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return series;
}

function buildTheorySessionSeries(
  fromDate: string,
  toDate: string,
  rowsByDate: Map<string, PracticeDayRow>,
): Array<{ date: string; sessions: number }> {
  const series: Array<{ date: string; sessions: number }> = [];
  const cursor = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T00:00:00`);

  while (cursor.getTime() <= end.getTime()) {
    const date = formatLocalDate(cursor);
    const row = rowsByDate.get(date);
    series.push({ date, sessions: row?.theorySessions ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return series;
}
