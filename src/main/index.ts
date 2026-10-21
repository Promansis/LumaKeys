import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type { OpenDialogOptions, SaveDialogOptions } from 'electron';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  BridgeAddSongPayload,
  BridgeUpdateSongPayload,
  FingeringRow,
  SaveGameResultPayload,
  SaveTheoryResultPayload,
  SongRow,
  TheoryResultRow,
  UpdateTroubleSpotPayload,
} from '../shared/dbTypes';
import { createSongId, importSongFromBuffer, reattachSongFromBuffer, recomputeAllSongDifficulties } from '../persistence/importSong';
import { buildLibraryBackup, importLibraryBackup } from '../persistence/libraryBackup';
import { isLibraryBackup } from '../shared/libraryBackup';
import { getInstrumentSamplePackDefinition } from '../lib/audio/instrumentSamplePacks';
import { AppDatabase } from '../persistence/database';
import { legacyProfileDirs, migrateLegacyBrand } from '../persistence/legacyBrandMigration';
import { FileSystemMidiStorageAdapter } from '../storage/midiStorage';
import { deleteSongsAcrossStores, resetUserDataAcrossStores } from '../persistence/crossStoreMutations';
import {
  getDesktopInstrumentSamplePackStatuses,
  installDesktopInstrumentSamplePack,
  removeDesktopInstrumentSamplePack,
  prepareDesktopInstrumentSamplePackReset,
  recoverDesktopInstrumentSamplePackReset,
  resolveDesktopInstrumentSampleSource,
} from './instrumentSamplePackStore';
import {
  desktopProfileDir,
  legacyLibraryChoiceFromResponse,
  legacyLibraryPrompt,
  runDesktopStartup,
} from './desktopStartup';
import { lastDirectory, rememberPath, saveDefaultPath } from './dialogDefaults';
import { installWindowGuard } from './windowGuard';

// Electron derives the default userData from package.json before this module runs,
// so pin the profile explicitly before `ready`.
app.setPath('userData', desktopProfileDir(app.getPath('appData')));
app.setName('LumaKeys');

let mainWindow: BrowserWindow | null = null;
let db: AppDatabase;
let midiStorage: FileSystemMidiStorageAdapter;

function withoutBridgeFilePath(
  updates: BridgeUpdateSongPayload & { filePath?: unknown },
): BridgeUpdateSongPayload {
  const { filePath, ...safeUpdates } = updates;
  void filePath;
  return safeUpdates;
}

function readDesktopSongMidiBytes(song: SongRow): Promise<Uint8Array> {
  return midiStorage.read(song.id);
}

function getDesktopAssetRoot(): string {
  return app.isPackaged ? join(app.getAppPath(), 'out', 'renderer') : join(app.getAppPath(), 'public');
}

function collectMidiFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMidiFiles(fullPath));
    } else if (/\.(mid|midi)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

async function createMainWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 780,
    backgroundColor: '#0d0e14',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  const rendererFile = join(__dirname, '../renderer/index.html');
  installWindowGuard(mainWindow.webContents, rendererUrl ?? pathToFileURL(rendererFile).href, (url) =>
    shell.openExternal(url),
  );

  if (rendererUrl) {
    await mainWindow.loadURL(rendererUrl);
    return;
  }

  await mainWindow.loadFile(rendererFile);
}

async function startDesktopApp(): Promise<void> {
  app.setAppUserModelId('com.lumakeys.app');

  const userDataPath = app.getPath('userData');
  const migration = migrateLegacyBrand({
    destinationDir: userDataPath,
    legacyDirs: legacyProfileDirs(app.getPath('appData')),
    chooseOnConflict: (conflict) =>
      legacyLibraryChoiceFromResponse(dialog.showMessageBoxSync(legacyLibraryPrompt(conflict))),
  });
  migration.messages.forEach((message) => console.log(message));
  if (migration.quit) {
    app.quit();
    return;
  }

  const midiFilesDir = join(userDataPath, 'midi-files');
  mkdirSync(midiFilesDir, { recursive: true });
  midiStorage = new FileSystemMidiStorageAdapter(midiFilesDir);

  db = new AppDatabase(join(userDataPath, 'lumakeys.db'));
  await db.migrateFromJson(userDataPath, midiStorage);
  await db.recoverDurableOperations(midiStorage, (operationId, state) =>
    recoverDesktopInstrumentSamplePackReset(userDataPath, operationId, state),
  );

  ipcMain.handle('dialog:pick-midi-file', async () => {
    const options: OpenDialogOptions = {
      defaultPath: lastDirectory('midiFile'),
      properties: ['openFile'],
      filters: [{ name: 'MIDI Files', extensions: ['mid', 'midi'] }],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const selectedPath = result.filePaths[0];
    rememberPath('midiFile', selectedPath);
    const data = new Uint8Array(await readFile(selectedPath));
    return {
      name: selectedPath.split(/[\\/]/).pop() ?? 'Imported MIDI',
      path: selectedPath,
      data,
    };
  });

  ipcMain.handle('songs:get-all', () => db.getAllSongs());
  ipcMain.handle('songs:get', (_event, songId: string) => db.getSong(songId));
  ipcMain.handle('songs:add', (_event, payload: BridgeAddSongPayload) =>
    db.addSong({
      ...payload,
      filePath: midiStorage.getPathForSong(payload.id),
    }),
  );
  ipcMain.handle(
    'songs:update',
    (_event, songId: string, updates: BridgeUpdateSongPayload & { filePath?: unknown }) =>
      db.updateSong(songId, withoutBridgeFilePath(updates)),
  );
  ipcMain.handle('songs:delete', (_event, songId: string) => {
    return deleteSongsAcrossStores(db, midiStorage, [songId], () => db.deleteSong(songId));
  });
  ipcMain.handle('songs:toggle-favorite', (_event, songId: string) => db.toggleFavorite(songId));

  ipcMain.handle('songs:import-midi-files', async (event) => {
    const options: OpenDialogOptions = {
      defaultPath: lastDirectory('midiFile'),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'MIDI Files', extensions: ['mid', 'midi'] }],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return { songs: [], errors: [], skipped: 0 };
    }

    rememberPath('midiFile', result.filePaths[0]);
    const songs = [];
    const errors = [];
    let skipped = 0;
    const total = result.filePaths.length;

    for (let i = 0; i < total; i++) {
      const selectedPath = result.filePaths[i];
      const title = selectedPath.split(/[\\/]/).pop()?.replace(/\.(mid|midi)$/i, '') ?? 'Untitled';
      event.sender.send('import:progress', { current: i + 1, total, filename: title });
      try {
        const buffer = await readFile(selectedPath);
        const songId = await createSongId(buffer);
        if (db.getSong(songId)) {
          skipped++;
          continue;
        }
        songs.push(await importSongFromBuffer(buffer, title, { db, midiStorage }));
      } catch (err) {
        errors.push({ filename: title, message: (err as Error).message });
      }
    }

    return { songs, errors, skipped };
  });

  ipcMain.handle('songs:import-folder', async (event) => {
    const options: OpenDialogOptions = {
      defaultPath: lastDirectory('midiFolder'),
      properties: ['openDirectory'],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    rememberPath('midiFolder', result.filePaths[0]);
    const filePaths = collectMidiFiles(result.filePaths[0]);
    const importedSongs = [];
    const errors = [];
    let skipped = 0;
    const total = filePaths.length;

    for (let i = 0; i < total; i++) {
      const selectedPath = filePaths[i];
      const title = selectedPath.split(/[\\/]/).pop()?.replace(/\.(mid|midi)$/i, '') ?? 'Untitled';
      event.sender.send('import:progress', { current: i + 1, total, filename: title });
      try {
        const buffer = await readFile(selectedPath);
        const songId = await createSongId(buffer);
        if (db.getSong(songId)) {
          skipped++;
          continue;
        }
        importedSongs.push(await importSongFromBuffer(buffer, title, { db, midiStorage }));
      } catch (err) {
        errors.push({ filename: title, message: (err as Error).message });
      }
    }

    return { imported: importedSongs, skipped, errors };
  });

  ipcMain.handle('songs:reattach-midi-file', async (_event, songId: string) => {
    const song = db.getSong(songId);
    if (!song) {
      throw new Error(`Song not found: ${songId}`);
    }

    const options: OpenDialogOptions = {
      defaultPath: lastDirectory('midiFile'),
      properties: ['openFile'],
      filters: [{ name: 'MIDI Files', extensions: ['mid', 'midi'] }],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return { reattached: [], errors: [], skipped: 0 };
    }

    const selectedPath = result.filePaths[0];
    rememberPath('midiFile', selectedPath);
    const title = selectedPath.split(/[\\/]/).pop()?.replace(/\.(mid|midi)$/i, '') ?? song.title;
    try {
      const buffer = await readFile(selectedPath);
      const reattached = await reattachSongFromBuffer(songId, buffer, title, { db, midiStorage });
      return { reattached: [reattached], errors: [], skipped: 0 };
    } catch (error) {
      return { reattached: [], errors: [{ filename: title, message: (error as Error).message }], skipped: 0 };
    }
  });

  ipcMain.handle('songs:recompute-difficulties', () =>
    recomputeAllSongDifficulties({ db, midiStorage, readSongBytes: readDesktopSongMidiBytes }),
  );

  ipcMain.handle('results:save', (_event, payload: SaveGameResultPayload) => db.saveGameResult(payload));
  ipcMain.handle('results:for-song', (_event, songId: string) => db.getGameResults(songId));
  ipcMain.handle('stats:get', (_event, songId: string) => db.getUserStats(songId));
  ipcMain.handle('theory:save-result', (_event, payload: SaveTheoryResultPayload) => db.saveTheoryResult(payload));
  ipcMain.handle('theory:get-results', (_event, type?: TheoryResultRow['type'], limit?: number) =>
    db.getTheoryResults(type, limit),
  );
  ipcMain.handle('theory:get-stats', (_event, type: TheoryResultRow['type']) => db.getTheoryStats(type));
  ipcMain.handle('practice:get-days', (_event, fromDate: string, toDate: string) =>
    db.getPracticeDays(fromDate, toDate),
  );
  ipcMain.handle('practice:record-time', (_event, durationSec: number, songsPlayed: number, theorySessions: number) =>
    db.recordPracticeTime(durationSec, songsPlayed, theorySessions),
  );
  ipcMain.handle('practice:get-streak', () => db.getPracticeStreak());

  ipcMain.handle('achievements:get-all', () => db.getAllAchievements());
  ipcMain.handle('achievements:unlock', (_event, achievementId: string) => db.unlockAchievement(achievementId));

  ipcMain.handle('trouble-spots:get', (_event, songId: string) => db.getTroubleSpots(songId));
  ipcMain.handle(
    'trouble-spots:update',
    (_event, spotId: string, updates: UpdateTroubleSpotPayload) => db.updateTroubleSpot(spotId, updates),
  );
  ipcMain.handle('measure-accuracy:get-history', (_event, songId: string) => db.getMeasureAccuracyHistory(songId));

  ipcMain.handle('recommendations:get', () => db.getRecommendations());
  ipcMain.handle('library:get-snapshot', () => db.getLibrarySnapshot());
  ipcMain.handle('progress:get-stats', (_event, fromDate: string, toDate: string) =>
    db.getProgressStats(fromDate, toDate),
  );
  ipcMain.handle('progress:get-top-songs', () => db.getProgressTopSongs());
  ipcMain.handle('trouble-spots:get-all-unresolved', () => db.getAllUnresolvedTroubleSpots());

  ipcMain.handle('fingerings:get', (_event, songId: string) => db.getCustomFingerings(songId));
  ipcMain.handle(
    'fingerings:save',
    (_event, songId: string, noteIndex: number, finger: number, hand: FingeringRow['hand'], noteId?: string) =>
      db.saveCustomFingering(songId, noteIndex, finger, hand, noteId),
  );
  ipcMain.handle('fingerings:clear', (_event, songId: string) => db.clearCustomFingerings(songId));

  ipcMain.handle('folders:get-all', () => db.getAllFolders());
  ipcMain.handle('folders:create', (_event, name: string) => db.createFolder(name));
  ipcMain.handle('folders:rename', (_event, folderId: string, name: string) => db.renameFolder(folderId, name));
  ipcMain.handle('folders:delete', (_event, folderId: string) => db.deleteFolder(folderId));
  ipcMain.handle('folders:move-song', (_event, songId: string, folderId: string | null) =>
    db.moveSongToFolder(songId, folderId),
  );

  ipcMain.handle('playlists:get-all', () => db.getAllPlaylists());
  ipcMain.handle('playlists:create', (_event, name: string) => db.createPlaylist(name));
  ipcMain.handle(
    'playlists:update',
    (_event, playlistId: string, updates: Partial<{ name: string; description: string }>) =>
      db.updatePlaylist(playlistId, updates),
  );
  ipcMain.handle('playlists:delete', (_event, playlistId: string) => db.deletePlaylist(playlistId));
  ipcMain.handle('playlists:get-songs', (_event, playlistId: string) => db.getPlaylistSongs(playlistId));
  ipcMain.handle('playlists:add-song', (_event, playlistId: string, songId: string) =>
    db.addSongToPlaylist(playlistId, songId),
  );
  ipcMain.handle('playlists:remove-song', (_event, playlistId: string, songId: string) =>
    db.removeSongFromPlaylist(playlistId, songId),
  );
  ipcMain.handle('playlists:reorder-song', (_event, playlistId: string, songId: string, newOrder: number) =>
    db.reorderPlaylistSong(playlistId, songId, newOrder),
  );

  ipcMain.handle('bulk:delete-songs', (_event, songIds: string[]) => {
    return deleteSongsAcrossStores(db, midiStorage, songIds, () => db.bulkDeleteSongs(songIds));
  });
  ipcMain.handle('bulk:move-songs-to-folder', (_event, songIds: string[], folderId: string | null) =>
    db.bulkMoveSongsToFolder(songIds, folderId),
  );
  ipcMain.handle('bulk:add-tag', (_event, songIds: string[], tag: string) => db.bulkAddTag(songIds, tag));
  ipcMain.handle('bulk:remove-tag', (_event, songIds: string[], tag: string) => db.bulkRemoveTag(songIds, tag));
  ipcMain.handle('bulk:add-to-playlist', (_event, songIds: string[], playlistId: string) =>
    db.bulkAddToPlaylist(songIds, playlistId),
  );

  ipcMain.handle('settings:get', (_event, category: string, key: string) =>
    db.getSetting(category, key),
  );
  ipcMain.handle('settings:set', (_event, category: string, key: string, value: string) =>
    db.setSetting(category, key, value),
  );
  ipcMain.handle('settings:reset-learning-progress', () => {
    db.resetLearningProgress();
  });
  ipcMain.handle('settings:reset-user-data', () => {
    return resetUserDataAcrossStores(db, midiStorage, (operationId) =>
      prepareDesktopInstrumentSamplePackReset(userDataPath, operationId),
    );
  });

  ipcMain.handle('library:export', async () => {
    const options: SaveDialogOptions = {
      defaultPath: saveDefaultPath('libraryJson', `lumakeys-library-${new Date().toISOString().slice(0, 10)}.json`),
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return null;
    }

    rememberPath('libraryJson', result.filePath);
    const { backup, exportResult } = await buildLibraryBackup(db, midiStorage);
    writeFileSync(result.filePath, JSON.stringify(backup, null, 2), 'utf8');
    return {
      ...exportResult,
      filename: result.filePath.split(/[\\/]/).pop() ?? 'lumakeys-library.json',
      target: 'file',
      location: result.filePath,
    };
  });

  ipcMain.handle('library:import', async () => {
    const options: OpenDialogOptions = {
      defaultPath: lastDirectory('libraryJson'),
      properties: ['openFile'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    rememberPath('libraryJson', result.filePaths[0]);
    const raw = JSON.parse(await readFile(result.filePaths[0], 'utf8')) as unknown;
    if (!isLibraryBackup(raw)) {
      throw new Error('Invalid library backup file.');
    }

    return importLibraryBackup(db, raw, midiStorage);
  });

  ipcMain.handle('file:load-midi', async (_event, songId: string) => {
    const song = db.getSong(songId);
    if (!song) {
      throw new Error(`Song not found: ${songId}`);
    }

    const data = await readDesktopSongMidiBytes(song);
    return new Uint8Array(data);
  });

  ipcMain.handle('file:load-curriculum-midi', async (_event, filename: string) => {
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    const midiPath = join(getDesktopAssetRoot(), 'curriculum-midis', safe);
    const data = await readFile(midiPath);
    return new Uint8Array(data);
  });

  ipcMain.handle('file:save-midi', async (_event, suggestedName: string, data: Uint8Array) => {
    const options: SaveDialogOptions = {
      defaultPath: saveDefaultPath('midiExport', suggestedName),
      filters: [{ name: 'MIDI Files', extensions: ['mid'] }],
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return null;
    }

    rememberPath('midiExport', result.filePath);
    writeFileSync(result.filePath, Buffer.from(data));
    return result.filePath;
  });

  ipcMain.handle('file:save-wav', async (_event, suggestedName: string, data: Uint8Array) => {
    const options: SaveDialogOptions = {
      defaultPath: saveDefaultPath('wavExport', suggestedName),
      filters: [{ name: 'WAV Audio', extensions: ['wav'] }],
    };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return null;
    }

    rememberPath('wavExport', result.filePath);
    writeFileSync(result.filePath, Buffer.from(data));
    return result.filePath;
  });

  ipcMain.handle('file:pick-audio', async () => {
    const options: OpenDialogOptions = {
      defaultPath: lastDirectory('audioFile'),
      properties: ['openFile'],
      filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a'] }],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    rememberPath('audioFile', filePath);
    const name = filePath.split(/[\\/]/).pop() ?? 'audio';
    return { path: filePath, name };
  });

  ipcMain.handle('file:pick-sample-dir', async () => {
    const options: OpenDialogOptions = {
      defaultPath: lastDirectory('samplePackFolder'),
      properties: ['openDirectory'],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    rememberPath('samplePackFolder', result.filePaths[0]);
    return result.filePaths[0];
  });

  ipcMain.handle('file:list-audio', (_event, dir: string) => {
    try {
      const audioExtensions = new Set(['.mp3', '.wav', '.ogg', '.flac', '.m4a']);
      return readdirSync(dir).filter((file) => {
        const lower = file.toLowerCase();
        return audioExtensions.has(lower.slice(lower.lastIndexOf('.')));
      });
    } catch {
      return [];
    }
  });

  ipcMain.handle('samples:get-statuses', () => getDesktopInstrumentSamplePackStatuses(db));

  ipcMain.handle('samples:install-pack', async (_event, instrumentId: string) => {
    const definition = getInstrumentSamplePackDefinition(instrumentId);
    if (!definition) {
      throw new Error(`No sample pack is configured for instrument: ${instrumentId}`);
    }

    if (definition.installMode === 'managed') {
      return installDesktopInstrumentSamplePack(db, userDataPath, getDesktopAssetRoot(), instrumentId);
    }

    const options: OpenDialogOptions = {
      defaultPath: lastDirectory('samplePackFolder'),
      properties: ['openDirectory'],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return getDesktopInstrumentSamplePackStatuses(db);
    }

    rememberPath('samplePackFolder', result.filePaths[0]);

    return installDesktopInstrumentSamplePack(db, userDataPath, getDesktopAssetRoot(), instrumentId, result.filePaths[0]);
  });

  ipcMain.handle('samples:remove-pack', (_event, instrumentId: string) =>
    removeDesktopInstrumentSamplePack(db, userDataPath, instrumentId),
  );

  ipcMain.handle('samples:resolve-source', (_event, instrumentId: string) =>
    resolveDesktopInstrumentSampleSource(db, userDataPath, instrumentId),
  );

  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
}

if (app.requestSingleInstanceLock()) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
  app.whenReady().then(() =>
    runDesktopStartup(startDesktopApp, {
      showError: (title, content) => dialog.showErrorBox(title, content),
      exit: (code) => app.exit(code),
    }),
  );
} else {
  app.quit();
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (db) {
    db.close();
  }
});
