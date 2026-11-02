import { Hono } from 'hono';
import { isSafeSongStorageId } from '../lib/storage/storageSafety';
import { recomputeAllSongDifficulties } from '../persistence/importSong';
import { deleteSongsAcrossStores, resetUserDataAcrossStores } from '../persistence/crossStoreMutations';
import { RPC_BRIDGE_METHODS, RPC_BRIDGE_METHOD_SET, type RpcBridgeMethod } from '../shared/bridgeMethods';
import { bridgeRpcBodyLimit } from './webSecurity';
import type {
  AddSongPayload,
  BridgeAddSongPayload,
  BridgeUpdateSongPayload,
  PersistedGameResultMode,
  UpdateTroubleSpotPayload,
} from '../shared/dbTypes';
import type { ServerDependencies } from './types';

type JsonBody = {
  args?: unknown[];
};

const WEB_SONG_ADD_KEYS = [
  'id',
  'title',
  'artist',
  'genre',
  'difficulty',
  'durationSec',
  'bpm',
  'noteCount',
  'tags',
  'folderId',
  'trackAssignments',
] as const satisfies ReadonlyArray<keyof BridgeAddSongPayload>;

const WEB_SONG_UPDATE_KEYS = [
  'title',
  'artist',
  'genre',
  'difficulty',
  'durationSec',
  'bpm',
  'noteCount',
  'tags',
  'isFavorite',
  'folderId',
  'trackAssignments',
] as const satisfies ReadonlyArray<keyof BridgeUpdateSongPayload>;

const TROUBLE_SPOT_UPDATE_KEYS = [
  'measureStart',
  'measureEnd',
  'firstDetected',
  'lastPracticed',
  'resolutionCount',
  'isResolved',
] as const satisfies ReadonlyArray<keyof UpdateTroubleSpotPayload>;

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isHand(value: unknown): value is 'left' | 'right' {
  return value === 'left' || value === 'right';
}

function isPersistedGameResultMode(value: unknown): value is PersistedGameResultMode {
  // ponytail: 'piano-hero' is a one-release alias for old backups/requests; normalize below.
  return value === 'luma-keys' || value === 'piano-hero' || value === 'learning' || value === 'performance';
}

function isTheoryType(value: unknown): boolean {
  return value === 'quiz' || value === 'interval-trainer' || value === 'scale-practice';
}

function isTrackAssignmentRecord(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return Object.values(value).every((assignment) => assignment === 'left' || assignment === 'right' || assignment === 'both' || assignment === 'ignore');
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isSongPayload(value: unknown): value is BridgeAddSongPayload {
  return isRecord(value) &&
    hasOnlyKeys(value, WEB_SONG_ADD_KEYS) &&
    isString(value.id) &&
    isSafeSongStorageId(value.id) &&
    isString(value.title) &&
    typeof value.artist === 'string' &&
    typeof value.genre === 'string' &&
    isNumber(value.difficulty) &&
    isNumber(value.durationSec) &&
    isNumber(value.bpm) &&
    isNumber(value.noteCount) &&
    isStringArray(value.tags) &&
    (value.folderId === undefined || isNullableString(value.folderId)) &&
    isTrackAssignmentRecord(value.trackAssignments);
}

function isSongUpdate(value: unknown): value is BridgeUpdateSongPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!hasOnlyKeys(value, WEB_SONG_UPDATE_KEYS)) {
    return false;
  }
  return (value.title === undefined || typeof value.title === 'string') &&
    (value.artist === undefined || typeof value.artist === 'string') &&
    (value.genre === undefined || typeof value.genre === 'string') &&
    (value.difficulty === undefined || isNumber(value.difficulty)) &&
    (value.durationSec === undefined || isNumber(value.durationSec)) &&
    (value.bpm === undefined || isNumber(value.bpm)) &&
    (value.noteCount === undefined || isNumber(value.noteCount)) &&
    (value.tags === undefined || isStringArray(value.tags)) &&
    (value.isFavorite === undefined || isBoolean(value.isFavorite)) &&
    (value.folderId === undefined || isNullableString(value.folderId)) &&
    (value.trackAssignments === undefined || isTrackAssignmentRecord(value.trackAssignments));
}

function isMeasureAccuracyArray(value: unknown): boolean {
  return Array.isArray(value) &&
    value.every((entry) => isRecord(entry) && isNonNegativeInteger(entry.measure) && isNumber(entry.accuracy));
}

function isSaveGameResultPayload(value: unknown): boolean {
  return isRecord(value) &&
    isString(value.songId) &&
    isNumber(value.score) &&
    isNumber(value.accuracy) &&
    isNumber(value.maxCombo) &&
    isNumber(value.perfectHits) &&
    isNumber(value.goodHits) &&
    isNumber(value.okHits) &&
    isNumber(value.misses) &&
    isNumber(value.tempo) &&
    isPersistedGameResultMode(value.mode) &&
    isNumber(value.durationSec) &&
    isMeasureAccuracyArray(value.measureAccuracy);
}

function isSaveTheoryResultPayload(value: unknown): boolean {
  return isRecord(value) &&
    isTheoryType(value.type) &&
    isNumber(value.score) &&
    isNumber(value.totalQuestions) &&
    isNumber(value.accuracy) &&
    (value.details === undefined || isRecord(value.details));
}

function isTroubleSpotUpdate(value: unknown): value is UpdateTroubleSpotPayload {
  if (!isRecord(value)) {
    return false;
  }
  if (!hasOnlyKeys(value, TROUBLE_SPOT_UPDATE_KEYS)) {
    return false;
  }
  return (value.measureStart === undefined || isNonNegativeInteger(value.measureStart)) &&
    (value.measureEnd === undefined || isNonNegativeInteger(value.measureEnd)) &&
    (value.firstDetected === undefined || isString(value.firstDetected)) &&
    (value.lastPracticed === undefined || value.lastPracticed === null || isString(value.lastPracticed)) &&
    (value.resolutionCount === undefined || isNonNegativeInteger(value.resolutionCount)) &&
    (value.isResolved === undefined || isBoolean(value.isResolved));
}

function isPlaylistUpdate(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return hasOnlyKeys(value, ['name', 'description']) &&
    (value.name === undefined || isString(value.name)) &&
    (value.description === undefined || typeof value.description === 'string');
}

type ArgsValidator = (args: unknown[], db: ServerDependencies['db']) => string | null;

const noArgs = (method: string): ArgsValidator => (args) =>
  args.length === 0 ? null : `${method} does not accept arguments.`;

const stringArg = (method: string, label = 'id'): ArgsValidator => (args) =>
  args.length === 1 && isString(args[0]) ? null : `${method} requires a non-empty string ${label}.`;

const bridgeArgValidators = {
  getAllSongs: noArgs('getAllSongs'),
  getSong: stringArg('getSong'),
  addSong: (args) => args.length === 1 && isSongPayload(args[0]) ? null : 'addSong requires a valid song payload.',
  updateSong: (args) =>
    args.length === 2 && isString(args[0]) && isSongUpdate(args[1])
      ? null
      : 'updateSong requires a song id and valid update object.',
  deleteSong: stringArg('deleteSong'),
  toggleFavorite: stringArg('toggleFavorite'),
  recomputeAllSongDifficulties: noArgs('recomputeAllSongDifficulties'),
  saveGameResult: (args) =>
    args.length === 1 && isSaveGameResultPayload(args[0]) ? null : 'saveGameResult requires a valid result payload.',
  getGameResults: stringArg('getGameResults'),
  getUserStats: stringArg('getUserStats'),
  saveTheoryResult: (args) =>
    args.length === 1 && isSaveTheoryResultPayload(args[0]) ? null : 'saveTheoryResult requires a valid result payload.',
  getTheoryResults: (args) =>
    args.length <= 2 &&
    (args[0] === undefined || args[0] === null || isTheoryType(args[0])) &&
    (args[1] === undefined || args[1] === null || isNonNegativeInteger(args[1]))
      ? null
      : 'getTheoryResults requires an optional theory type and optional limit.',
  getTheoryStats: (args) =>
    args.length === 1 && isTheoryType(args[0]) ? null : 'getTheoryStats requires a theory result type.',
  getPracticeDays: (args) =>
    args.length === 2 && isString(args[0]) && isString(args[1]) ? null : 'getPracticeDays requires from and to dates.',
  recordPracticeTime: (args) =>
    args.length === 3 && args.every(isNumber)
      ? null
      : 'recordPracticeTime requires duration, songs played, and theory session counts.',
  getPracticeStreak: noArgs('getPracticeStreak'),
  getAllAchievements: noArgs('getAllAchievements'),
  unlockAchievement: stringArg('unlockAchievement', 'achievement id'),
  getTroubleSpots: stringArg('getTroubleSpots', 'song id'),
  updateTroubleSpot: (args) =>
    args.length === 2 && isString(args[0]) && isTroubleSpotUpdate(args[1])
      ? null
      : 'updateTroubleSpot requires a trouble spot id and valid update object.',
  getMeasureAccuracyHistory: stringArg('getMeasureAccuracyHistory', 'song id'),
  getRecommendations: noArgs('getRecommendations'),
  getProgressStats: (args) =>
    args.length === 2 && isString(args[0]) && isString(args[1]) ? null : 'getProgressStats requires from and to dates.',
  getProgressTopSongs: noArgs('getProgressTopSongs'),
  getAllUnresolvedTroubleSpots: noArgs('getAllUnresolvedTroubleSpots'),
  getLibrarySnapshot: noArgs('getLibrarySnapshot'),
  getCustomFingerings: stringArg('getCustomFingerings', 'song id'),
  saveCustomFingering: (args) =>
    (args.length === 4 || args.length === 5) && isString(args[0]) && isInteger(args[1]) && isInteger(args[2]) && args[2] >= 1 && args[2] <= 5 && isHand(args[3]) && (args[4] === undefined || isString(args[4]))
      ? null
      : 'saveCustomFingering requires song id, note index, finger, hand, and optional source note id.',
  clearCustomFingerings: stringArg('clearCustomFingerings', 'song id'),
  getAllFolders: noArgs('getAllFolders'),
  createFolder: stringArg('createFolder', 'name'),
  renameFolder: (args) =>
    args.length === 2 && isString(args[0]) && isString(args[1]) ? null : 'renameFolder requires a folder id and name.',
  deleteFolder: stringArg('deleteFolder', 'folder id'),
  moveSongToFolder: (args, db) => {
    if (args.length !== 2 || !isString(args[0]) || !isNullableString(args[1])) {
      return 'moveSongToFolder requires a song id and nullable folder id.';
    }
    if (args[1] !== null && !db.getAllFolders().some((folder) => folder.id === args[1])) {
      return `Unknown folder: ${args[1]}`;
    }
    return null;
  },
  getAllPlaylists: noArgs('getAllPlaylists'),
  createPlaylist: stringArg('createPlaylist', 'name'),
  updatePlaylist: (args) =>
    args.length === 2 && isString(args[0]) && isPlaylistUpdate(args[1])
      ? null
      : 'updatePlaylist requires a playlist id and valid update object.',
  deletePlaylist: stringArg('deletePlaylist', 'playlist id'),
  getPlaylistSongs: stringArg('getPlaylistSongs', 'playlist id'),
  addSongToPlaylist: (args) =>
    args.length === 2 && isString(args[0]) && isString(args[1]) ? null : 'addSongToPlaylist requires playlist and song ids.',
  removeSongFromPlaylist: (args) =>
    args.length === 2 && isString(args[0]) && isString(args[1]) ? null : 'removeSongFromPlaylist requires playlist and song ids.',
  reorderPlaylistSong: (args) =>
    args.length === 3 && isString(args[0]) && isString(args[1]) && Number.isInteger(args[2])
      ? null
      : 'reorderPlaylistSong requires playlist id, song id, and integer order.',
  bulkDeleteSongs: (args) =>
    args.length === 1 && isStringArray(args[0]) ? null : 'bulkDeleteSongs requires a song id array.',
  bulkMoveSongsToFolder: (args, db) => {
    if (args.length !== 2 || !isStringArray(args[0]) || !isNullableString(args[1])) {
      return 'bulkMoveSongsToFolder requires song ids and nullable folder id.';
    }
    if (args[1] !== null && !db.getAllFolders().some((folder) => folder.id === args[1])) {
      return `Unknown folder: ${args[1]}`;
    }
    return null;
  },
  bulkAddTag: (args) =>
    args.length === 2 && isStringArray(args[0]) && isString(args[1]) ? null : 'bulkAddTag requires song ids and tag.',
  bulkRemoveTag: (args) =>
    args.length === 2 && isStringArray(args[0]) && isString(args[1]) ? null : 'bulkRemoveTag requires song ids and tag.',
  bulkAddToPlaylist: (args) =>
    args.length === 2 && isStringArray(args[0]) && isString(args[1]) ? null : 'bulkAddToPlaylist requires song ids and playlist id.',
  getSetting: (args) =>
    args.length === 2 && isString(args[0]) && isString(args[1]) ? null : 'getSetting requires category and key.',
  setSetting: (args) =>
    args.length === 3 && isString(args[0]) && isString(args[1]) && typeof args[2] === 'string'
      ? null
      : 'setSetting requires category, key, and value.',
  resetLearningProgress: noArgs('resetLearningProgress'),
  resetUserData: noArgs('resetUserData'),
} satisfies Record<RpcBridgeMethod, ArgsValidator>;

function validateRpcArgs(method: RpcBridgeMethod, args: unknown[], db: ServerDependencies['db']): string | null {
  return bridgeArgValidators[method](args, db);
}

function withAppOwnedFilePath(value: unknown, dependencies: ServerDependencies): AddSongPayload {
  if (!isSongPayload(value)) {
    throw new Error('Song payload requires a safe song id.');
  }

  return { ...value, filePath: dependencies.midiStorage.getPathForSong(value.id) };
}

export function createBridgeRouter(dependencies: ServerDependencies) {
  const { db, midiStorage } = dependencies;
  const router = new Hono();

  router.post('/:method', bridgeRpcBodyLimit(), async (c) => {
    const method = c.req.param('method');
    if (!RPC_BRIDGE_METHOD_SET.has(method)) {
      return c.json({ error: `Unknown bridge method: ${method}` }, 404);
    }

    const body = await c.req.json<JsonBody>().catch(() => null);
    if (!body || !Array.isArray(body.args)) {
      return c.json({ error: 'Bridge request body must be JSON with an args array.' }, 400);
    }

    const args = body.args;
    const validationError = validateRpcArgs(method as RpcBridgeMethod, args, db);
    if (validationError) {
      return c.json({ error: validationError }, 400);
    }

    try {
      if (method === 'resetUserData') {
        await resetUserDataAcrossStores(db, midiStorage);
        return c.json({ result: null });
      }

      if (method === 'recomputeAllSongDifficulties') {
        const result = await recomputeAllSongDifficulties({ db, midiStorage });
        return c.json({ result });
      }

      if (method === 'addSong') {
        db.assertNoPendingRollback();
        const result = db.addSong(withAppOwnedFilePath(args[0], dependencies));
        return c.json({ result });
      }

      if (method === 'deleteSong') {
        const [songId] = args as [string];
        await deleteSongsAcrossStores(db, midiStorage, [songId], () => db.deleteSong(songId));
        return c.json({ result: null });
      }

      if (method === 'bulkDeleteSongs') {
        const [songIds] = args as [string[]];
        await deleteSongsAcrossStores(db, midiStorage, songIds, () => db.bulkDeleteSongs(songIds));
        return c.json({ result: null });
      }

      const fn = (db as unknown as Record<string, (...nextArgs: unknown[]) => unknown>)[method];
      if (typeof fn !== 'function') {
        return c.json({ error: `Bridge method is not callable: ${method}` }, 500);
      }

      if (method === 'saveGameResult' && (args[0] as { mode?: string }).mode === 'piano-hero') {
        (args[0] as { mode: string }).mode = 'luma-keys';
      }

      const result = await Promise.resolve(fn.apply(db, args));
      return c.json({ result: result ?? null });
    } catch (error) {
      return c.json({ error: (error as Error).message }, 500);
    }
  });

  return router;
}

export function getValidatedRpcBridgeMethods(): readonly RpcBridgeMethod[] {
  return RPC_BRIDGE_METHODS;
}
