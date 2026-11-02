import type {
  AchievementRow,
  BridgeAddSongPayload,
  BridgeUpdateSongPayload,
  FingeringRow,
  FolderRow,
  GameResultRow,
  GlobalTroubleSpot,
  LibraryExportResult,
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
  SongRow,
  TheoryResultRow,
  TheoryStatsRow,
  TopSongStat,
  TroubleSpotRow,
  UpdateTroubleSpotPayload,
  UserStatsRow,
} from './dbTypes';

export interface PickedMidiFile {
  name: string;
  path?: string;
  data: Uint8Array;
}

export interface ImportedSong {
  songId: string;
  /** Present on the Electron IPC path only; the web upload route omits it. */
  destPath?: string;
  /** Present on the Electron IPC path only; the web upload route omits it. */
  fileData?: Uint8Array;
  title: string;
  durationSec: number;
  bpm: number;
  noteCount: number;
  difficulty: number;
}

export interface ImportError {
  filename: string;
  message: string;
}

export interface ImportResult {
  songs: ImportedSong[];
  errors: ImportError[];
  skipped: number;
}

export interface RecomputeDifficultiesResult {
  updated: number;
  errors: ImportError[];
}

export interface ReattachMidiResult {
  reattached: ImportedSong[];
  skipped: number;
  errors: ImportError[];
}

export interface ImportProgressEvent {
  current: number;
  total: number;
  filename: string;
}

export interface InstrumentSamplePackAsset {
  note: string;
  fileName: string;
  url: string;
}

export interface InstrumentSamplePackManifest {
  instrumentId: string;
  packLabel: string;
  version: string;
  sourceName: string;
  licenseLabel: string;
  attributionUrl: string;
  assets: InstrumentSamplePackAsset[];
}

export interface InstalledInstrumentSamplePackRecord {
  instrumentId: string;
  packLabel: string;
  version: string;
  installedAt: string;
  urls: Record<string, string>;
  baseUrl?: string | null;
}

export interface InstrumentSamplePackStatus {
  instrumentId: string;
  packLabel: string;
  isInstalled: boolean;
  canInstallInApp: boolean;
  requiresPackForSelection: boolean;
  installMode: 'manual' | 'managed';
  installedAt: string | null;
  installedVersion: string | null;
  statusMessage: string;
}

export interface ResolvedInstrumentSampleSource {
  instrumentId: string;
  source: 'enhanced';
  urls: Record<string, string>;
  baseUrl: string | null;
  packLabel: string;
}

export interface AppBridge {
  pickMidiFile: () => Promise<PickedMidiFile | null>;

  getAllSongs: () => Promise<SongRow[]>;
  getSong: (songId: string) => Promise<SongRow | null>;
  addSong: (song: BridgeAddSongPayload) => Promise<SongRow>;
  updateSong: (songId: string, updates: BridgeUpdateSongPayload) => Promise<void>;
  deleteSong: (songId: string) => Promise<void>;
  toggleFavorite: (songId: string) => Promise<void>;
  importMidiFiles: () => Promise<ImportResult>;
  importMidiFolder: () => Promise<{ imported: ImportedSong[]; skipped: number; errors: ImportError[] } | null>;
  reattachMidiFile: (songId: string) => Promise<ReattachMidiResult>;
  recomputeAllSongDifficulties: () => Promise<RecomputeDifficultiesResult>;
  onImportProgress: (cb: (ev: ImportProgressEvent) => void) => () => void;

  saveGameResult: (payload: SaveGameResultPayload) => Promise<SaveResultOutcome>;
  getGameResults: (songId: string) => Promise<GameResultRow[]>;
  getUserStats: (songId: string) => Promise<UserStatsRow | null>;
  saveTheoryResult: (payload: SaveTheoryResultPayload) => Promise<SaveResultOutcome>;
  getTheoryResults: (type?: TheoryResultRow['type'], limit?: number) => Promise<TheoryResultRow[]>;
  getTheoryStats: (type: TheoryResultRow['type']) => Promise<TheoryStatsRow>;

  getPracticeDays: (fromDate: string, toDate: string) => Promise<PracticeDayRow[]>;
  recordPracticeTime: (durationSec: number, songsPlayed: number, theorySessions: number) => Promise<void>;
  getPracticeStreak: () => Promise<PracticeStreak>;

  getAllAchievements: () => Promise<AchievementRow[]>;
  unlockAchievement: (achievementId: string) => Promise<void>;

  getTroubleSpots: (songId: string) => Promise<TroubleSpotRow[]>;
  updateTroubleSpot: (
    spotId: string,
    updates: UpdateTroubleSpotPayload,
  ) => Promise<void>;
  getMeasureAccuracyHistory: (songId: string) => Promise<MeasureAccuracyHistoryRow[]>;

  getRecommendations: () => Promise<RecommendationResult>;
  getProgressStats: (fromDate: string, toDate: string) => Promise<ProgressStatsResult>;
  getProgressTopSongs: () => Promise<TopSongStat[]>;
  getAllUnresolvedTroubleSpots: () => Promise<GlobalTroubleSpot[]>;
  getLibrarySnapshot: () => Promise<LibrarySnapshot>;

  getCustomFingerings: (songId: string) => Promise<FingeringRow[]>;
  saveCustomFingering: (
    songId: string,
    noteIndex: number,
    finger: number,
    hand: FingeringRow['hand'],
    noteId?: string,
  ) => Promise<void>;
  clearCustomFingerings: (songId: string) => Promise<void>;

  getAllFolders: () => Promise<FolderRow[]>;
  createFolder: (name: string) => Promise<FolderRow>;
  renameFolder: (folderId: string, name: string) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  moveSongToFolder: (songId: string, folderId: string | null) => Promise<void>;

  getAllPlaylists: () => Promise<PlaylistRow[]>;
  createPlaylist: (name: string) => Promise<PlaylistRow>;
  updatePlaylist: (
    playlistId: string,
    updates: Partial<Pick<PlaylistRow, 'name' | 'description'>>,
  ) => Promise<void>;
  deletePlaylist: (playlistId: string) => Promise<void>;
  getPlaylistSongs: (playlistId: string) => Promise<SongRow[]>;
  addSongToPlaylist: (playlistId: string, songId: string) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  reorderPlaylistSong: (playlistId: string, songId: string, newOrder: number) => Promise<void>;

  bulkDeleteSongs: (songIds: string[]) => Promise<void>;
  bulkMoveSongsToFolder: (songIds: string[], folderId: string | null) => Promise<void>;
  bulkAddTag: (songIds: string[], tag: string) => Promise<void>;
  bulkRemoveTag: (songIds: string[], tag: string) => Promise<void>;
  bulkAddToPlaylist: (songIds: string[], playlistId: string) => Promise<void>;

  getSetting: (category: string, key: string) => Promise<string | null>;
  setSetting: (category: string, key: string, value: string) => Promise<void>;
  resetLearningProgress: () => Promise<void>;
  resetUserData: () => Promise<void>;
  exportLibrary: () => Promise<LibraryExportResult | null>;
  importLibrary: () => Promise<LibraryImportResult | null>;

  loadMidiFileData: (songId: string) => Promise<Uint8Array>;
  loadCurriculumMidi: (filename: string) => Promise<Uint8Array>;
  saveMidiFile: (suggestedName: string, data: Uint8Array) => Promise<string | null>;
  saveWavFile: (suggestedName: string, data: Uint8Array) => Promise<string | null>;
  pickAudioFile: () => Promise<{ path: string; name: string } | null>;
  pickSampleDirectory: () => Promise<string | null>;
  listAudioFiles: (dir: string) => Promise<string[]>;
  getInstrumentSamplePackStatuses: () => Promise<InstrumentSamplePackStatus[]>;
  installInstrumentSamplePack: (instrumentId: string) => Promise<InstrumentSamplePackStatus[]>;
  removeInstrumentSamplePack: (instrumentId: string) => Promise<InstrumentSamplePackStatus[]>;
  resolveInstrumentSampleSource: (instrumentId: string) => Promise<ResolvedInstrumentSampleSource | null>;
}
