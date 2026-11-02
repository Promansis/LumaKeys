import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../../lib/audio/audioEngine';
import type { ScoredSessionMode } from '../../lib/game/types';
import { parseMidiFile } from '../../lib/midi/midiFileParser';
import type { FolderRow, LibrarySnapshot, PlaylistRow, RecommendationResult, SongRow, UserStatsRow } from '../../shared/dbTypes';
import { carryOverLegacyFilterPresets } from '../legacyFilterPresets';
import { AdvancedFilters, type LibraryAdvancedFilters } from './AdvancedFilters';
import { BulkActionBar } from './BulkActionBar';
import { DeleteSongsModal } from './DeleteSongsModal';
import { LibrarySidebar, type LibraryActiveView } from './LibrarySidebar';
import { LoadingPanel } from './LoadingPanel';
import { PlaylistView } from './PlaylistView';
import { TagChips } from './TagChips';
import { getBridgeErrorMessage } from '../bridgeErrorMessage';
import {
  formatFolderImportResult,
  formatLibraryExportResult,
  formatLibraryImportResult,
  formatMidiImportResult,
  formatReattachMidiResult,
  runFolderImport,
  runMidiImport,
} from '../services/libraryService';

interface LibraryScreenProps {
  audioEngine: AudioEngine;
  onStartSession: (song: SongRow, mode: ScoredSessionMode) => void;
  onStartPlaylistQueue: (songs: SongRow[]) => void;
  onStartTheoryPractice: () => void;
}

type SortField = 'title' | 'date' | 'score' | 'difficulty' | 'plays' | 'lastPlayed';
type SortDirection = 'asc' | 'desc';
type ViewMode = 'grid' | 'list';
type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard';

interface SongDraft {
  title: string;
  artist: string;
  genre: string;
  difficulty: number;
  tags: string[];
}

const EMPTY_ADVANCED_FILTERS: LibraryAdvancedFilters = {
  durationMin: '',
  durationMax: '',
  scoreMin: '',
  scoreMax: '',
  playedState: 'all',
  dateAddedFrom: '',
  dateAddedTo: '',
};

interface FilterPreset {
  label: string;
  difficulty: DifficultyFilter;
  advanced: LibraryAdvancedFilters;
}

const FILTER_PRESETS: FilterPreset[] = [
  {
    label: 'Unplayed',
    difficulty: 'all',
    advanced: { ...EMPTY_ADVANCED_FILTERS, playedState: 'unplayed' },
  },
  {
    label: 'Quick (< 3 min)',
    difficulty: 'all',
    advanced: { ...EMPTY_ADVANCED_FILTERS, durationMax: '180' },
  },
  {
    label: 'Hard',
    difficulty: 'hard',
    advanced: EMPTY_ADVANCED_FILTERS,
  },
  {
    label: 'High Score',
    difficulty: 'all',
    advanced: { ...EMPTY_ADVANCED_FILTERS, scoreMin: '90' },
  },
];

function formatDuration(durationSec: number): string {
  const total = Math.max(0, Math.round(durationSec));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getDifficultyFilterLabel(filter: DifficultyFilter): string {
  switch (filter) {
    case 'easy':
      return 'Easy';
    case 'medium':
      return 'Medium';
    case 'hard':
      return 'Hard';
    default:
      return 'All';
  }
}

function matchesDifficulty(song: SongRow, filter: DifficultyFilter): boolean {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'easy') {
    return song.difficulty <= 3;
  }
  if (filter === 'medium') {
    return song.difficulty >= 4 && song.difficulty <= 6;
  }
  return song.difficulty >= 7;
}

function createDraft(song: SongRow): SongDraft {
  return {
    title: song.title,
    artist: song.artist,
    genre: song.genre,
    difficulty: song.difficulty,
    tags: song.tags,
  };
}

function hasAdvancedFilters(filters: LibraryAdvancedFilters): boolean {
  return Object.entries(filters).some(([key, value]) => key !== 'playedState' ? value !== '' : value !== 'all');
}

// `songs.date_added` is SQLite `datetime('now')`: UTC, "YYYY-MM-DD HH:MM:SS", no zone marker.
// Read it as UTC; a bare `new Date(value)` would read it as local time.
function parseDateAddedUtc(value: string): number {
  const iso = value.trim().replace(' ', 'T');
  if (!iso.includes('T')) {
    return new Date(`${iso}T00:00:00Z`).getTime();
  }
  const hasZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(iso.slice(iso.indexOf('T')));
  return new Date(hasZone ? iso : `${iso}Z`).getTime();
}

// A date input value ("YYYY-MM-DD") names a calendar day in the user's own zone. Build the bound
// from local date parts: `new Date('YYYY-MM-DD')` would be UTC midnight instead.
function localDayBound(dateInput: string, endOfDay: boolean): number {
  const [year, month, day] = dateInput.split('-').map(Number);
  if (!year || !month || !day) {
    return Number.NaN;
  }
  return endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
    : new Date(year, month - 1, day).getTime();
}

export function withinDateRange(date: string, from: string, to: string): boolean {
  const value = parseDateAddedUtc(date);
  if (from && value < localDayBound(from, false)) {
    return false;
  }
  if (to && value > localDayBound(to, true)) {
    return false;
  }
  return true;
}

function isCompactLibraryViewport(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 780px)').matches
    : false;
}

export function LibraryScreen({
  audioEngine,
  onStartSession,
  onStartPlaylistQueue,
  onStartTheoryPractice,
}: LibraryScreenProps) {
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const [statsBySongId, setStatsBySongId] = useState<Record<string, UserStatsRow | null>>({});
  const [songGoals, setSongGoals] = useState<Record<string, number>>({});
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [playlistSongs, setPlaylistSongs] = useState<SongRow[]>([]);
  const [activeView, setActiveView] = useState<LibraryActiveView>({ type: 'all' });
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('all');
  const [isMobileLayout, setIsMobileLayout] = useState(() => isCompactLibraryViewport());
  const [viewMode, setViewMode] = useState<ViewMode>(() => (isCompactLibraryViewport() ? 'list' : 'grid'));
  const [advancedFilters, setAdvancedFilters] = useState<LibraryAdvancedFilters>(EMPTY_ADVANCED_FILTERS);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showCollectionsDisclosure, setShowCollectionsDisclosure] = useState(false);
  const [showRecommendationsPanel, setShowRecommendationsPanel] = useState(() => !isCompactLibraryViewport());
  const [showPracticePlanPanel, setShowPracticePlanPanel] = useState(() => !isCompactLibraryViewport());
  const [showMaintenanceTools, setShowMaintenanceTools] = useState(false);
  const [selectedTagFilters, setSelectedTagFilters] = useState<string[]>([]);
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState(IS_WEB
    ? 'Build your library by importing MIDI or MSCZ files.'
    : 'Build your library by importing MIDI files.');
  const [isLoading, setIsLoading] = useState(true);
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isRecomputingDifficulties, setIsRecomputingDifficulties] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; filename: string } | null>(null);
  const [editingSongId, setEditingSongId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SongDraft | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null);
  const [previewSongId, setPreviewSongId] = useState<string | null>(null);
  const [expandedSongActionsId, setExpandedSongActionsId] = useState<string | null>(null);
  const previewTimeoutsRef = useRef<number[]>([]);
  const refreshRequestRef = useRef(0);
  const [userPresets, setUserPresets] = useState<FilterPreset[]>(() => {
    try {
      carryOverLegacyFilterPresets();
      const raw = localStorage.getItem('lumakeys-filter-presets');
      return raw ? (JSON.parse(raw) as FilterPreset[]) : [];
    } catch {
      return [];
    }
  });
  const [newPresetName, setNewPresetName] = useState('');

  const refreshLibrary = async (options: { preserveStatus?: boolean; keepVisible?: boolean } = {}) => {
    const requestId = refreshRequestRef.current + 1;
    refreshRequestRef.current = requestId;
    if (!window.appBridge) {
      setStatusMessage('The app bridge is unavailable.');
      setIsLoading(false);
      return;
    }

    // keepVisible refreshes in place so the open view keeps its focus and live region.
    if (!options.keepVisible) {
      setIsLoading(true);
    }
    setIsRecommendationsLoading(true);
    try {
      const bridge = window.appBridge;
      let snapshot: LibrarySnapshot;
      if (typeof bridge.getLibrarySnapshot === 'function') {
        snapshot = await bridge.getLibrarySnapshot();
      } else {
        const [nextSongs, nextFolders, nextPlaylists, nextRecommendations] = await Promise.all([
          bridge.getAllSongs(),
          bridge.getAllFolders(),
          bridge.getAllPlaylists(),
          bridge.getRecommendations().catch(() => null),
        ]);
        const statsEntries = await Promise.all(
          nextSongs.map(async (song) => [song.id, await bridge.getUserStats(song.id)] as const),
        );
        const goalEntries = await Promise.all(
          nextSongs.map(async (song) => {
            const val = await bridge.getSetting('song-goal', song.id);
            return [song.id, val ? Number(val) : 0] as const;
          }),
        );
        snapshot = {
          songs: nextSongs,
          folders: nextFolders,
          playlists: nextPlaylists,
          recommendations: nextRecommendations,
          statsBySongId: Object.fromEntries(statsEntries),
          songGoals: Object.fromEntries(goalEntries),
        };
      }

      if (requestId !== refreshRequestRef.current) {
        return;
      }

      setSongs(snapshot.songs);
      setFolders(snapshot.folders);
      setPlaylists(snapshot.playlists);
      setStatsBySongId(snapshot.statsBySongId);
      setSongGoals(snapshot.songGoals);
      setRecommendations(snapshot.recommendations);

      if (!options.preserveStatus) {
        if (snapshot.songs.length === 0) {
          setStatusMessage(IS_WEB
            ? 'Build your library by importing MIDI or MSCZ files.'
            : 'Build your library by importing MIDI files.');
        } else {
          setStatusMessage(`${snapshot.songs.length} song${snapshot.songs.length === 1 ? '' : 's'} ready to play.`);
        }
      }
    } catch (error) {
      if (requestId === refreshRequestRef.current) {
        setStatusMessage(`Unable to load library: ${(error as Error).message}`);
      }
    } finally {
      if (requestId === refreshRequestRef.current) {
        setIsLoading(false);
        setIsRecommendationsLoading(false);
      }
    }
  };

  useEffect(() => {
    void refreshLibrary();
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 780px)');
    const updateLayout = (matches: boolean) => {
      setIsMobileLayout(matches);
    };

    updateLayout(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      updateLayout(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }

    mediaQuery.addListener(handleChange);
    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  useEffect(() => {
    if (isMobileLayout) {
      setViewMode('list');
      setShowCollectionsDisclosure(false);
      setShowRecommendationsPanel(false);
      setShowPracticePlanPanel(false);
      return;
    }

    setShowCollectionsDisclosure(false);
    setShowRecommendationsPanel(true);
    setShowPracticePlanPanel(true);
  }, [isMobileLayout]);

  useEffect(() => {
    let ignore = false;
    const loadPlaylistSongs = async () => {
      if (!window.appBridge || activeView.type !== 'playlist') {
        setPlaylistSongs([]);
        return;
      }
      try {
        const nextPlaylistSongs = await window.appBridge.getPlaylistSongs(activeView.id);
        if (!ignore) {
          setPlaylistSongs(nextPlaylistSongs);
        }
      } catch (error) {
        if (!ignore) {
          setStatusMessage(`Unable to load playlist: ${(error as Error).message}`);
          setPlaylistSongs([]);
        }
      }
    };

    void loadPlaylistSongs();
    return () => {
      ignore = true;
    };
  }, [activeView]);

  const selectedSong = useMemo(
    () => songs.find((entry) => entry.id === editingSongId) ?? playlistSongs.find((entry) => entry.id === editingSongId) ?? null,
    [editingSongId, playlistSongs, songs],
  );

  useEffect(() => {
    if (selectedSong) {
      setDraft(createDraft(selectedSong));
    } else {
      setDraft(null);
    }
  }, [selectedSong]);

  const allTagSuggestions = useMemo(
    () => [...new Set(songs.flatMap((song) => song.tags))].sort((left, right) => left.localeCompare(right)),
    [songs],
  );

  const handleImport = async () => {
    if (!window.appBridge) {
      return;
    }

    setIsImporting(true);
    setImportProgress(null);
    try {
      const result = await runMidiImport(window.appBridge, (ev) => setImportProgress(ev));
      setStatusMessage(formatMidiImportResult(result, IS_WEB ? 'No files imported.' : 'Import canceled.'));
      if (result.songs.length > 0) {
        await refreshLibrary({ preserveStatus: true });
        setEditingSongId(result.songs[0].songId);
      }
    } catch (error) {
      setStatusMessage(`Import failed: ${(error as Error).message}`);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleImportFolder = async () => {
    if (!window.appBridge) {
      return;
    }

    setIsImporting(true);
    setImportProgress(null);
    try {
      const result = await runFolderImport(window.appBridge, (ev) => setImportProgress(ev));
      if (!result) {
        setStatusMessage('Import canceled.');
      } else {
        setStatusMessage(formatFolderImportResult(result));
        if (result.imported.length > 0) {
          await refreshLibrary({ preserveStatus: true });
        }
      }
    } catch (error) {
      setStatusMessage(`Import failed: ${(error as Error).message}`);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleToggleFavorite = async (songId: string) => {
    if (!window.appBridge) {
      return;
    }

    try {
      await window.appBridge.toggleFavorite(songId);
      await refreshLibrary({ preserveStatus: true });
    } catch (error) {
      setStatusMessage(`Unable to update favorite: ${(error as Error).message}`);
    }
  };

  const handleExportLibrary = async () => {
    if (!window.appBridge) {
      return;
    }

    try {
      const result = await window.appBridge.exportLibrary();
      if (result) {
        setStatusMessage(formatLibraryExportResult(result));
      }
    } catch (error) {
      setStatusMessage(`Export failed: ${(error as Error).message}`);
    }
  };

  const handleImportLibrary = async () => {
    if (!window.appBridge) {
      return;
    }

    try {
      const result = await window.appBridge.importLibrary();
      if (!result) {
        return;
      }

      await refreshLibrary({ preserveStatus: true });
      setStatusMessage(formatLibraryImportResult(result));
    } catch (error) {
      setStatusMessage(`Import failed. ${getBridgeErrorMessage(error)}`);
    }
  };

  const handleReattachMidi = async (songId: string) => {
    if (!window.appBridge) {
      return;
    }

    setIsImporting(true);
    setImportProgress(null);
    try {
      const result = await window.appBridge.reattachMidiFile(songId);
      setStatusMessage(formatReattachMidiResult(result));
      if (result.reattached.length > 0) {
        await refreshLibrary({ preserveStatus: true });
      }
    } catch (error) {
      setStatusMessage(`Reattach failed: ${(error as Error).message}`);
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const handleRecomputeDifficulties = async () => {
    if (!window.appBridge) {
      return;
    }

    setIsRecomputingDifficulties(true);
    try {
      const result = await window.appBridge.recomputeAllSongDifficulties();
      const parts = [`Recomputed difficulty for ${result.updated} song${result.updated === 1 ? '' : 's'}`];
      if (result.errors.length > 0) {
        parts.push(
          `${result.errors.length} failed (${result.errors.map((error) => `${error.filename}: ${error.message}`).join('; ')})`,
        );
      }
      setStatusMessage(parts.join('. ') + '.');
      if (result.updated > 0) {
        await refreshLibrary({ preserveStatus: true });
      }
    } catch (error) {
      setStatusMessage(`Difficulty recompute failed: ${(error as Error).message}`);
    } finally {
      setIsRecomputingDifficulties(false);
    }
  };

  const handleSaveMetadata = async () => {
    if (!window.appBridge || !selectedSong || !draft) {
      return;
    }

    try {
      await window.appBridge.updateSong(selectedSong.id, {
        title: draft.title.trim() || selectedSong.title,
        artist: draft.artist.trim(),
        genre: draft.genre.trim(),
        difficulty: Math.max(1, Math.min(10, Math.round(draft.difficulty))),
        tags: draft.tags,
      });
      setStatusMessage(`Saved metadata for ${draft.title.trim() || selectedSong.title}.`);
      await refreshLibrary({ preserveStatus: true });
    } catch (error) {
      setStatusMessage(`Unable to save metadata: ${(error as Error).message}`);
    }
  };

  const requestDeleteSongs = (songIds: string[]) => {
    if (songIds.length === 0) {
      return;
    }
    deleteTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPendingDeleteIds(songIds);
  };

  const handleDeleteSongs = async (songIds: string[]) => {
    if (!window.appBridge || songIds.length === 0) {
      return;
    }

    try {
      await window.appBridge.bulkDeleteSongs(songIds);
      setSelectedSongIds((current) => {
        const next = new Set(current);
        for (const songId of songIds) {
          next.delete(songId);
        }
        return next;
      });
      if (editingSongId && songIds.includes(editingSongId)) {
        setEditingSongId(null);
      }
      await refreshLibrary({ preserveStatus: true });
      setStatusMessage(`Deleted ${songIds.length} song${songIds.length === 1 ? '' : 's'} from the library.`);
    } catch (error) {
      setStatusMessage(`Delete failed. ${getBridgeErrorMessage(error)}`);
    }
  };

  const handleAddTagFilter = (tag: string) => {
    setSelectedTagFilters((current) => (current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]));
  };

  const handleCreateFolder = async (name: string) => {
    if (!window.appBridge || !name.trim()) {
      return;
    }
    try {
      await window.appBridge.createFolder(name.trim());
      await refreshLibrary({ preserveStatus: true });
      setStatusMessage(`Created folder "${name.trim()}".`);
    } catch (error) {
      setStatusMessage(`Unable to create folder: ${(error as Error).message}`);
    }
  };

  const handleRenameFolder = async (folderId: string, name: string) => {
    if (!window.appBridge || !name.trim()) {
      return;
    }
    try {
      await window.appBridge.renameFolder(folderId, name.trim());
      await refreshLibrary({ preserveStatus: true });
      setStatusMessage(`Renamed folder to "${name.trim()}".`);
    } catch (error) {
      setStatusMessage(`Unable to rename folder: ${(error as Error).message}`);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!window.appBridge) {
      return;
    }
    try {
      await window.appBridge.deleteFolder(folderId);
      if (activeView.type === 'folder' && activeView.id === folderId) {
        setActiveView({ type: 'all' });
      }
      await refreshLibrary({ preserveStatus: true });
      setStatusMessage('Deleted folder.');
    } catch (error) {
      setStatusMessage(`Unable to delete folder: ${(error as Error).message}`);
    }
  };

  const handleCreatePlaylist = async (name: string) => {
    if (!window.appBridge || !name.trim()) {
      return;
    }
    try {
      const playlist = await window.appBridge.createPlaylist(name.trim());
      await refreshLibrary({ preserveStatus: true });
      setActiveView({ type: 'playlist', id: playlist.id });
      setStatusMessage(`Created playlist "${name.trim()}".`);
    } catch (error) {
      setStatusMessage(`Unable to create playlist: ${(error as Error).message}`);
    }
  };

  const handleRenamePlaylist = async (playlistId: string, name: string) => {
    if (!window.appBridge || !name.trim()) {
      return;
    }
    try {
      await window.appBridge.updatePlaylist(playlistId, { name: name.trim() });
      await refreshLibrary({ preserveStatus: true });
      setStatusMessage(`Renamed playlist to "${name.trim()}".`);
    } catch (error) {
      setStatusMessage(`Unable to rename playlist: ${(error as Error).message}`);
    }
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    if (!window.appBridge) {
      return;
    }
    try {
      await window.appBridge.deletePlaylist(playlistId);
      if (activeView.type === 'playlist' && activeView.id === playlistId) {
        setActiveView({ type: 'all' });
      }
      await refreshLibrary({ preserveStatus: true });
      setStatusMessage('Deleted playlist.');
    } catch (error) {
      setStatusMessage(`Unable to delete playlist: ${(error as Error).message}`);
    }
  };

  const handleSavePreset = () => {
    const name = newPresetName.trim();
    if (!name) {
      return;
    }
    const preset: FilterPreset = { label: name, difficulty: difficultyFilter, advanced: advancedFilters };
    const next = [...userPresets.filter((p) => p.label !== name), preset];
    setUserPresets(next);
    localStorage.setItem('lumakeys-filter-presets', JSON.stringify(next));
    setNewPresetName('');
  };

  const handleDeletePreset = (label: string) => {
    const next = userPresets.filter((p) => p.label !== label);
    setUserPresets(next);
    localStorage.setItem('lumakeys-filter-presets', JSON.stringify(next));
  };

  const stopPreview = () => {
    previewTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    previewTimeoutsRef.current = [];
    audioEngine.allNotesOff();
    setPreviewSongId(null);
  };

  const handlePreview = async (song: SongRow) => {
    stopPreview();
    if (!window.appBridge) {
      return;
    }
    setPreviewSongId(song.id);
    try {
      await audioEngine.init();
      const bytes = await window.appBridge.loadMidiFileData(song.id);
      const parsed = parseMidiFile(bytes.slice().buffer, { songId: song.id, title: song.title });
      const PREVIEW_DURATION_SEC = 20;
      const allNotes = parsed.notes
        .filter((note) => note.startSec < PREVIEW_DURATION_SEC)
        .sort((a, b) => a.startSec - b.startSec);

      const ids: number[] = [];
      for (const note of allNotes) {
        const onId = window.setTimeout(
          () => void audioEngine.noteOn(note.midi, note.velocity),
          note.startSec * 1000,
        );
        const offId = window.setTimeout(
          () => audioEngine.noteOff(note.midi),
          (note.startSec + note.durationSec) * 1000,
        );
        ids.push(onId, offId);
      }
      // Auto-stop after preview duration
      const endId = window.setTimeout(() => {
        audioEngine.allNotesOff();
        setPreviewSongId(null);
        previewTimeoutsRef.current = [];
      }, PREVIEW_DURATION_SEC * 1000);
      ids.push(endId);
      previewTimeoutsRef.current = ids;
    } catch {
      setPreviewSongId(null);
    }
  };

  useEffect(() => () => {
    stopPreview();
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const playlistFiltersActive = Boolean(normalizedQuery) || difficultyFilter !== 'all' || selectedTagFilters.length > 0 || hasAdvancedFilters(advancedFilters);

  const baseSongs = useMemo(() => {
    switch (activeView.type) {
      case 'favorites':
        return songs.filter((song) => song.isFavorite);
      case 'folder':
        return songs.filter((song) => song.folderId === activeView.id);
      case 'playlist':
        return playlistSongs;
      case 'all':
      default:
        return songs;
    }
  }, [activeView, playlistSongs, songs]);

  const visibleSongs = useMemo(() => {
    const filtered = baseSongs.filter((song) => {
      if (!matchesDifficulty(song, difficultyFilter)) {
        return false;
      }
      if (selectedTagFilters.some((tag) => !song.tags.includes(tag))) {
        return false;
      }
      if (advancedFilters.durationMin && song.durationSec < Number(advancedFilters.durationMin)) {
        return false;
      }
      if (advancedFilters.durationMax && song.durationSec > Number(advancedFilters.durationMax)) {
        return false;
      }
      const bestAccuracy = statsBySongId[song.id]?.bestAccuracy ?? 0;
      if (advancedFilters.scoreMin && bestAccuracy < Number(advancedFilters.scoreMin)) {
        return false;
      }
      if (advancedFilters.scoreMax && bestAccuracy > Number(advancedFilters.scoreMax)) {
        return false;
      }
      if (advancedFilters.playedState === 'played' && song.timesPlayed === 0) {
        return false;
      }
      if (advancedFilters.playedState === 'unplayed' && song.timesPlayed > 0) {
        return false;
      }
      if (!withinDateRange(song.dateAdded, advancedFilters.dateAddedFrom, advancedFilters.dateAddedTo)) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }

      const haystack = `${song.title} ${song.artist} ${song.genre} ${song.tags.join(' ')}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });

    if (activeView.type === 'playlist') {
      return filtered;
    }

    return [...filtered].sort((left, right) => {
      const leftStats = statsBySongId[left.id];
      const rightStats = statsBySongId[right.id];
      let value = 0;

      switch (sortField) {
        case 'title':
          value = left.title.localeCompare(right.title);
          break;
        case 'difficulty':
          value = left.difficulty - right.difficulty;
          break;
        case 'plays':
          value = left.timesPlayed - right.timesPlayed;
          break;
        case 'score':
          value = (leftStats?.bestScore ?? 0) - (rightStats?.bestScore ?? 0);
          break;
        case 'lastPlayed':
          value = new Date(leftStats?.lastPlayed ?? 0).getTime() - new Date(rightStats?.lastPlayed ?? 0).getTime();
          break;
        case 'date':
        default:
          value = new Date(left.dateAdded).getTime() - new Date(right.dateAdded).getTime();
          break;
      }

      return sortDirection === 'asc' ? value : -value;
    });
  }, [activeView, advancedFilters, baseSongs, difficultyFilter, normalizedQuery, selectedTagFilters, sortDirection, sortField, statsBySongId]);

  const visibleSongIds = useMemo(() => visibleSongs.map((song) => song.id), [visibleSongs]);

  const currentPlaylist = activeView.type === 'playlist' ? playlists.find((playlist) => playlist.id === activeView.id) ?? null : null;

  const contentTitle = currentPlaylist
    ? currentPlaylist.name
    : activeView.type === 'folder'
      ? folders.find((folder) => folder.id === activeView.id)?.name ?? 'Folder'
      : activeView.type === 'favorites'
        ? 'Favorites'
        : 'All Songs';
  const contentDescription = currentPlaylist
    ? `${visibleSongs.length} song${visibleSongs.length === 1 ? '' : 's'} in this playlist.`
    : activeView.type === 'folder'
      ? `${visibleSongs.length} song${visibleSongs.length === 1 ? '' : 's'} in this folder.`
      : activeView.type === 'favorites'
        ? `${visibleSongs.length} saved favorite${visibleSongs.length === 1 ? '' : 's'} ready to revisit.`
        : `${visibleSongs.length} of ${songs.length} song${songs.length === 1 ? '' : 's'} visible in your library.`;

  const renderSongCard = (song: SongRow) => {
    const stats = statsBySongId[song.id];
    const artistName = song.artist.trim();
    const folderName = song.folderId ? folders.find((folder) => folder.id === song.folderId)?.name ?? 'Folder' : 'Unfiled';
    const moreActionsOpen = expandedSongActionsId === song.id;
    const moreActionsId = `song-card-more-actions-${song.id}`;

    return (
      <article className="panel song-card" key={song.id}>
        <div className="song-card-header">
          <div className="song-card-title-group">
            <label className="song-select-toggle">
              <input
                type="checkbox"
                checked={selectedSongIds.has(song.id)}
                onChange={(event) => {
                  setSelectedSongIds((current) => {
                    const next = new Set(current);
                    if (event.target.checked) {
                      next.add(song.id);
                    } else {
                      next.delete(song.id);
                    }
                    return next;
                  });
                }}
              />
              <span />
            </label>
            <div>
              <p className="eyebrow">{song.genre || 'Library Song'}</p>
              <h2 className="song-card-title" title={song.title}>
                {song.title}
              </h2>
              {artistName ? (
                <p className="panel-copy song-card-artist" title={artistName}>
                  {artistName}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="song-card-meta">
          <span className={`difficulty-badge difficulty-${song.difficulty}`}>
            Difficulty {song.difficulty}
          </span>
          <span>{formatDuration(song.durationSec)}</span>
          <span>{Math.round(song.bpm)} BPM</span>
          <span className="song-card-folder" title={folderName}>
            {folderName}
          </span>
        </div>

        {song.tags.length > 0 && (
          <TagChips tags={song.tags} onTagClick={handleAddTagFilter} />
        )}

        <div className="song-card-stats">
          <div>
            <span>Best Score</span>
            <strong>{(stats?.bestScore ?? 0).toLocaleString()}</strong>
          </div>
          <div>
            <span>Best Accuracy</span>
            <strong>{stats ? `${stats.bestAccuracy.toFixed(1)}%` : '0.0%'}</strong>
          </div>
          <div>
            <span>Plays</span>
            <strong>{song.timesPlayed}</strong>
          </div>
          <div className="song-goal-row">
            <label htmlFor={`goal-${song.id}`}>Accuracy Goal</label>
            <select
              id={`goal-${song.id}`}
              value={songGoals[song.id] ?? 0}
              onChange={async (event) => {
                const val = Number(event.target.value);
                setSongGoals((prev) => ({ ...prev, [song.id]: val }));
                try {
                  if (val > 0) {
                    await window.appBridge?.setSetting('song-goal', song.id, String(val));
                  } else {
                    await window.appBridge?.setSetting('song-goal', song.id, '0');
                  }
                } catch (error) {
                  setStatusMessage(`Unable to save song goal: ${(error as Error).message}`);
                }
              }}
            >
              <option value={0}>None</option>
              <option value={80}>80%</option>
              <option value={90}>90%</option>
              <option value={95}>95%</option>
              <option value={100}>100%</option>
            </select>
          </div>
        </div>

        <div className="song-card-actions">
          <button className="primary-button" onClick={() => { stopPreview(); onStartSession(song, 'luma-keys'); }}>
            Play
          </button>
          <button className="secondary-button" onClick={() => { stopPreview(); onStartSession(song, 'learning'); }}>
            Learn
          </button>
          <button
            className={moreActionsOpen ? 'primary-button' : 'secondary-button'}
            aria-expanded={moreActionsOpen}
            aria-controls={moreActionsId}
            onClick={() => setExpandedSongActionsId((current) => (current === song.id ? null : song.id))}
          >
            {moreActionsOpen ? 'Less' : 'More'}
          </button>
        </div>
        {moreActionsOpen ? (
          <div className="song-card-more-actions" id={moreActionsId}>
            <button className="secondary-button" onClick={() => { stopPreview(); onStartSession(song, 'performance'); }}>
              Perform
            </button>
            {previewSongId === song.id ? (
              <button className="secondary-button" onClick={stopPreview}>
                Stop Preview
              </button>
            ) : (
              <button className="secondary-button" onClick={() => void handlePreview(song)} disabled={previewSongId !== null}>
                Preview
              </button>
            )}
            <button className="secondary-button" onClick={() => setEditingSongId(song.id)}>
              Edit Metadata
            </button>
            <button className="secondary-button favorite-toggle" onClick={() => void handleToggleFavorite(song.id)}>
              {song.isFavorite ? 'Favorite' : 'Mark Favorite'}
            </button>
          </div>
        ) : null}
      </article>
    );
  };

  const recommendationGroups = recommendations ? [
    { title: 'Next Challenge', items: recommendations.nextChallenge },
    { title: 'Skill Builder', items: recommendations.skillBuilder },
    { title: 'You Might Like', items: recommendations.youMightLike },
    { title: 'Revisit', items: recommendations.revisit },
  ] : [];
  const handleChangeView = (view: LibraryActiveView) => {
    setActiveView(view);
    setSelectedSongIds(new Set());
    setExpandedSongActionsId(null);
    setShowCollectionsDisclosure(false);
  };
  const sidebarContent = (
    <LibrarySidebar
      activeView={activeView}
      folders={folders}
      playlists={playlists}
      framed={!isMobileLayout}
      onChangeView={handleChangeView}
      onCreateFolder={(name) => void handleCreateFolder(name)}
      onRenameFolder={(folderId, name) => void handleRenameFolder(folderId, name)}
      onDeleteFolder={(folderId) => void handleDeleteFolder(folderId)}
      onCreatePlaylist={(name) => void handleCreatePlaylist(name)}
      onRenamePlaylist={(playlistId, name) => void handleRenamePlaylist(playlistId, name)}
      onDeletePlaylist={(playlistId) => void handleDeletePlaylist(playlistId)}
    />
  );

  return (
    <main className="app-shell library-screen">
      <section className="panel library-header">
        <div>
          <p className="eyebrow">LumaKeys</p>
          <h1>Your Library</h1>
          <p className="song-title">{statusMessage}</p>
          {importProgress && (
            <div className="import-progress">
              <div className="import-progress-bar">
                <div
                  className="import-progress-fill"
                  style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }}
                />
              </div>
              <p className="import-progress-label">
                Processing &ldquo;{importProgress.filename}&rdquo; ({importProgress.current}/{importProgress.total})
              </p>
            </div>
          )}
        </div>
        <div className="transport-buttons">
          <button className="secondary-button" onClick={() => void handleExportLibrary()}>
            Export Library
          </button>
          <button className="secondary-button" onClick={() => void handleImportLibrary()}>
            Import Library
          </button>
          <button className="secondary-button" onClick={() => void refreshLibrary()} disabled={isLoading}>
            Refresh
          </button>
          {!IS_WEB ? (
            <button className="secondary-button" onClick={() => void handleImportFolder()} disabled={isImporting}>
              {isImporting ? 'Importing...' : 'Import Folder'}
            </button>
          ) : null}
          <button className="primary-button" onClick={() => void handleImport()} disabled={isImporting}>
            {isImporting ? 'Importing...' : IS_WEB ? 'Upload MIDI / MSCZ' : 'Upload MIDI'}
          </button>
        </div>
      </section>

      <section className="library-layout">
        {!isMobileLayout ? sidebarContent : null}

        <div className="library-content">
          <section className="tag-filter-summary">
            <div className="panel active-filters-panel library-collection-summary">
              <div>
                <p className="eyebrow">{activeView.type === 'all' ? 'Library Overview' : 'Current Collection'}</p>
                <h2>{contentTitle}</h2>
                <p className="panel-copy">{contentDescription}</p>
              </div>
              {selectedTagFilters.length > 0 ? (
                <TagChips tags={selectedTagFilters} removable onChange={setSelectedTagFilters} />
              ) : null}
            </div>
          </section>

          <section className="panel search-bar">
            <label className="search-field">
              <span>Search</span>
              <input
                type="search"
                value={searchQuery}
                placeholder="Search title, artist, genre, or tags"
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>

            <label>
              <span>Sort</span>
              <select
                value={sortField}
                disabled={activeView.type === 'playlist'}
                onChange={(event) => setSortField(event.target.value as SortField)}
              >
                <option value="date">Date Added</option>
                <option value="lastPlayed">Last Played</option>
                <option value="title">Title</option>
                <option value="score">Best Score</option>
                <option value="difficulty">Difficulty</option>
                <option value="plays">Times Played</option>
              </select>
            </label>

            <label>
              <span>Direction</span>
              <select
                value={sortDirection}
                disabled={activeView.type === 'playlist'}
                onChange={(event) => setSortDirection(event.target.value as SortDirection)}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>

            {!isMobileLayout ? (
              <div className="view-toggle">
                <button
                  className={viewMode === 'grid' ? 'primary-button' : 'secondary-button'}
                  onClick={() => setViewMode('grid')}
                >
                  Grid
                </button>
                <button
                  className={viewMode === 'list' ? 'primary-button' : 'secondary-button'}
                  onClick={() => setViewMode('list')}
                >
                  List
                </button>
              </div>
            ) : null}
          </section>

          {isMobileLayout ? (
            <section className="panel library-mobile-disclosure">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Collections</p>
                  <h2>Folders, playlists, and favorites</h2>
                </div>
                <button
                  className="secondary-button"
                  aria-expanded={showCollectionsDisclosure}
                  aria-controls="library-mobile-collections"
                  onClick={() => setShowCollectionsDisclosure((value) => !value)}
                >
                  {showCollectionsDisclosure ? 'Hide Collections' : 'Show Collections'}
                </button>
              </div>
              {showCollectionsDisclosure ? (
                <div id="library-mobile-collections" className="library-mobile-collections">
                  {sidebarContent}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="filter-chips filter-presets">
            <span className="filter-preset-label">Quick Filters:</span>
            {FILTER_PRESETS.map((preset) => (
              <button
                key={preset.label}
                className="secondary-button"
                onClick={() => {
                  setDifficultyFilter(preset.difficulty);
                  setAdvancedFilters(preset.advanced);
                  setSelectedTagFilters([]);
                }}
              >
                {preset.label}
              </button>
            ))}
            {userPresets.map((preset) => (
              <span key={preset.label} className="user-preset-chip">
                <button
                  className="secondary-button"
                  onClick={() => {
                    setDifficultyFilter(preset.difficulty);
                    setAdvancedFilters(preset.advanced);
                    setSelectedTagFilters([]);
                  }}
                >
                  {preset.label}
                </button>
                <button
                  className="secondary-button user-preset-delete"
                  onClick={() => handleDeletePreset(preset.label)}
                  title={`Remove "${preset.label}" preset`}
                >
                  ×
                </button>
              </span>
            ))}
            <span className="user-preset-save">
              <input
                type="text"
                className="preset-name-input"
                placeholder="Preset name…"
                value={newPresetName}
                onChange={(event) => setNewPresetName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') handleSavePreset(); }}
              />
              <button className="secondary-button" onClick={handleSavePreset} disabled={!newPresetName.trim()}>
                Save Filters
              </button>
            </span>
          </section>

          <section className="filter-chips">
            {(['all', 'easy', 'medium', 'hard'] as DifficultyFilter[]).map((filter) => (
              <button
                key={filter}
                className={difficultyFilter === filter ? 'primary-button' : 'secondary-button'}
                onClick={() => setDifficultyFilter(filter)}
              >
                {getDifficultyFilterLabel(filter)}
              </button>
            ))}
          </section>

          <AdvancedFilters
            isOpen={showAdvancedFilters}
            filters={advancedFilters}
            onToggle={() => setShowAdvancedFilters((value) => !value)}
            onChange={setAdvancedFilters}
            onClear={() => {
              setAdvancedFilters(EMPTY_ADVANCED_FILTERS);
              setSelectedTagFilters([]);
            }}
          />

          {activeView.type === 'all' ? (
            <section className="panel recommendations-section">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Recommended for You</p>
                  <h2>What to play next</h2>
                </div>
                <button
                  className="secondary-button"
                  aria-expanded={showRecommendationsPanel}
                  aria-controls="library-recommendations-panel"
                  onClick={() => setShowRecommendationsPanel((value) => !value)}
                >
                  {showRecommendationsPanel ? 'Hide Suggestions' : 'Show Suggestions'}
                </button>
              </div>
              {showRecommendationsPanel ? (
                <div id="library-recommendations-panel">
                  {isRecommendationsLoading ? (
                    <div className="recommendation-carousel recommendation-skeleton-grid" aria-hidden="true">
                      {Array.from({ length: 3 }, (_, index) => (
                        <article className="recommendation-card recommendation-card-skeleton" key={`recommendation-skeleton-${index}`}>
                          <span className="recommendation-skeleton-line recommendation-skeleton-line-short" />
                          <span className="recommendation-skeleton-line recommendation-skeleton-line-title" />
                          <span className="recommendation-skeleton-line" />
                          <span className="recommendation-skeleton-line recommendation-skeleton-line-short" />
                        </article>
                      ))}
                    </div>
                  ) : recommendationGroups.every((group) => group.items.length === 0) ? (
                    <p className="empty-state">Play a few scored sessions so LumaKeys can suggest what to tackle next.</p>
                  ) : (
                    <div className="recommendation-groups">
                      {recommendationGroups.map((group) => (
                        <article className="recommendation-group" key={group.title}>
                          <div className="recommendation-group-header">
                            <h3>{group.title}</h3>
                          </div>
                          <div className="recommendation-carousel">
                            {group.items.map((item) => (
                              <article className="recommendation-card" key={`${group.title}-${item.song.id}`}>
                                <p className="eyebrow">{item.song.genre || 'Library Pick'}</p>
                                <h3 title={item.song.title}>{item.song.title}</h3>
                                <p className="panel-copy">{item.reason}</p>
                                <div className="song-card-meta">
                                  <span>Difficulty {item.song.difficulty}</span>
                                  <span>{Math.round(item.song.bpm)} BPM</span>
                                </div>
                                <div className="song-card-actions">
                                  <button className="primary-button" onClick={() => onStartSession(item.song, 'luma-keys')}>
                                    Play
                                  </button>
                                  <button className="secondary-button" onClick={() => onStartSession(item.song, 'learning')}>
                                    Learn
                                  </button>
                                </div>
                              </article>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          ) : null}

          {activeView.type === 'all' && recommendations ? (
            (() => {
              const revisitSong = recommendations.revisit[0]?.song ?? null;
              const challengeSong = recommendations.nextChallenge[0]?.song ?? null;
              if (!revisitSong && !challengeSong) {
                return null;
              }
              return (
                <section className="panel practice-plan-section">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Practice Plan</p>
                      <h2>Suggested session</h2>
                    </div>
                    <button
                      className="secondary-button"
                      aria-expanded={showPracticePlanPanel}
                      aria-controls="library-practice-plan-panel"
                      onClick={() => setShowPracticePlanPanel((value) => !value)}
                    >
                      {showPracticePlanPanel ? 'Hide Plan' : 'Show Plan'}
                    </button>
                  </div>
                  {showPracticePlanPanel ? (
                    <div id="library-practice-plan-panel">
                      <p className="panel-copy">A ready-made routine for your next practice slot.</p>
                      <ol className="practice-routine-steps">
                        <li className="practice-routine-step">
                          <div className="step-number">1</div>
                          <div className="step-body">
                            <strong>Warm-up: Theory drill</strong>
                            <p className="panel-copy">A quick scale or chord quiz to get the fingers and ears engaged.</p>
                          </div>
                          <button className="secondary-button" onClick={onStartTheoryPractice}>Open Theory</button>
                        </li>
                        {revisitSong ? (
                          <li className="practice-routine-step">
                            <div className="step-number">2</div>
                            <div className="step-body">
                              <strong title={revisitSong.title}>Review: {revisitSong.title}</strong>
                              <p className="panel-copy">Revisit a recent song to consolidate what you already know.</p>
                            </div>
                            <button className="secondary-button" onClick={() => { stopPreview(); onStartSession(revisitSong, 'learning'); }}>Learn</button>
                          </li>
                        ) : null}
                        {challengeSong ? (
                          <li className="practice-routine-step">
                            <div className="step-number">{revisitSong ? 3 : 2}</div>
                            <div className="step-body">
                              <strong title={challengeSong.title}>Challenge: {challengeSong.title}</strong>
                              <p className="panel-copy">Push your current level with something slightly harder.</p>
                            </div>
                            <button className="secondary-button" onClick={() => { stopPreview(); onStartSession(challengeSong, 'luma-keys'); }}>Play</button>
                          </li>
                        ) : null}
                      </ol>
                    </div>
                  ) : null}
                </section>
              );
            })()
          ) : null}

          <section className="panel library-maintenance-section">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Advanced Library Tools</p>
                <h2>Maintenance</h2>
              </div>
              <button
                className="secondary-button"
                aria-expanded={showMaintenanceTools}
                aria-controls="library-maintenance-panel"
                onClick={() => setShowMaintenanceTools((value) => !value)}
              >
                {showMaintenanceTools ? 'Hide Tools' : 'Show Tools'}
              </button>
            </div>
            {showMaintenanceTools ? (
              <div id="library-maintenance-panel" className="library-maintenance-body">
                <p className="panel-copy">
                  Reload each stored MIDI file, recompute the difficulty model, and refresh computed song metadata.
                </p>
                <button
                  className="secondary-button"
                  disabled={isLoading || isRecomputingDifficulties || songs.length === 0}
                  onClick={() => void handleRecomputeDifficulties()}
                >
                  {isRecomputingDifficulties ? 'Recomputing...' : 'Recompute All Difficulties'}
                </button>
              </div>
            ) : null}
          </section>

          {selectedSongIds.size > 0 && (
            <BulkActionBar
              selectedCount={selectedSongIds.size}
              folders={folders}
              playlists={playlists}
              onClearSelection={() => setSelectedSongIds(new Set())}
              onDelete={() => requestDeleteSongs([...selectedSongIds])}
              onMoveToFolder={(folderId) =>
                void (async () => {
                  if (!window.appBridge) {
                    return;
                  }
                  try {
                    const normalizedFolderId = folderId === '__NONE__' ? null : folderId;
                    await window.appBridge.bulkMoveSongsToFolder([...selectedSongIds], normalizedFolderId);
                    const movedCount = selectedSongIds.size;
                    setSelectedSongIds(new Set());
                    await refreshLibrary({ preserveStatus: true });
                    setStatusMessage(`Moved ${movedCount} song${movedCount === 1 ? '' : 's'}.`);
                  } catch (error) {
                    setStatusMessage(`Move failed: ${(error as Error).message}`);
                  }
                })()
              }
              onAddTag={(tag) =>
                void (async () => {
                  if (!window.appBridge || !tag.trim()) {
                    return;
                  }
                  try {
                    await window.appBridge.bulkAddTag([...selectedSongIds], tag.trim());
                    const updatedCount = selectedSongIds.size;
                    await refreshLibrary({ preserveStatus: true });
                    setStatusMessage(`Added "${tag.trim()}" to ${updatedCount} song${updatedCount === 1 ? '' : 's'}.`);
                  } catch (error) {
                    setStatusMessage(`Add tag failed: ${(error as Error).message}`);
                  }
                })()
              }
              onRemoveTag={(tag) =>
                void (async () => {
                  if (!window.appBridge || !tag.trim()) {
                    return;
                  }
                  try {
                    await window.appBridge.bulkRemoveTag([...selectedSongIds], tag.trim());
                    const updatedCount = selectedSongIds.size;
                    await refreshLibrary({ preserveStatus: true });
                    setStatusMessage(`Removed "${tag.trim()}" from ${updatedCount} song${updatedCount === 1 ? '' : 's'}.`);
                  } catch (error) {
                    setStatusMessage(`Remove tag failed: ${(error as Error).message}`);
                  }
                })()
              }
              onAddToPlaylist={(playlistId) =>
                void (async () => {
                  if (!window.appBridge) {
                    return;
                  }
                  try {
                    await window.appBridge.bulkAddToPlaylist([...selectedSongIds], playlistId);
                    const addedCount = selectedSongIds.size;
                    setSelectedSongIds(new Set());
                    await refreshLibrary({ preserveStatus: true });
                    setStatusMessage(`Added ${addedCount} song${addedCount === 1 ? '' : 's'} to playlist.`);
                  } catch (error) {
                    setStatusMessage(`Add to playlist failed: ${(error as Error).message}`);
                  }
                })()
              }
            />
          )}

          <section className="library-selection-row">
            <button
              className="secondary-button"
              onClick={() => setSelectedSongIds(new Set(visibleSongIds))}
              disabled={visibleSongIds.length === 0}
            >
              Select All Visible
            </button>
            <button className="secondary-button" onClick={() => setSelectedSongIds(new Set())}>
              Deselect All
            </button>
          </section>

          {selectedSong && draft && (
            <section className="panel metadata-editor">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Metadata Review</p>
                  <h2>{selectedSong.title}</h2>
                </div>
                <div className="transport-buttons">
                  <button className="secondary-button" onClick={() => requestDeleteSongs([selectedSong.id])}>
                    Delete Song
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => void handleReattachMidi(selectedSong.id)}
                    disabled={isImporting}
                  >
                    Reattach MIDI
                  </button>
                  <button className="secondary-button" onClick={() => setEditingSongId(null)}>
                    Close
                  </button>
                  <button className="primary-button" onClick={() => void handleSaveMetadata()}>
                    Save Metadata
                  </button>
                </div>
              </div>

              <div className="metadata-grid">
                <label>
                  <span>Title</span>
                  <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
                </label>
                <label>
                  <span>Artist</span>
                  <input
                    value={draft.artist}
                    placeholder="Artist name (optional)"
                    onChange={(event) => setDraft({ ...draft, artist: event.target.value })}
                  />
                </label>
                <label>
                  <span>Genre</span>
                  <input value={draft.genre} onChange={(event) => setDraft({ ...draft, genre: event.target.value })} />
                </label>
                <label>
                  <span>Difficulty</span>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={draft.difficulty}
                    onChange={(event) => setDraft({ ...draft, difficulty: Number(event.target.value) })}
                  />
                  <strong>Difficulty {draft.difficulty}</strong>
                </label>
                <label className="metadata-tags-field">
                  <span>Tags</span>
                  <TagChips
                    tags={draft.tags}
                    editable
                    removable
                    suggestions={allTagSuggestions}
                    onChange={(tags) => setDraft({ ...draft, tags })}
                  />
                </label>
              </div>
            </section>
          )}

          {isLoading ? (
            <LoadingPanel
              inline
              eyebrow="Library"
              title="Loading library"
              message="Reading your imported songs, playlists, and folders."
            />
          ) : activeView.type === 'playlist' ? (
            <PlaylistView
              songs={visibleSongs}
              canReorder={!playlistFiltersActive}
              onPlayAll={() => onStartPlaylistQueue(playlistSongs)}
              onStartSession={(song) => onStartSession(song, 'luma-keys')}
              onRemoveSong={(songId) =>
                void (async () => {
                  if (!window.appBridge || activeView.type !== 'playlist') {
                    return;
                  }
                  try {
                    await window.appBridge.removeSongFromPlaylist(activeView.id, songId);
                    const nextPlaylistSongs = await window.appBridge.getPlaylistSongs(activeView.id);
                    setPlaylistSongs(nextPlaylistSongs);
                    await refreshLibrary({ preserveStatus: true });
                    setStatusMessage('Removed song from playlist.');
                  } catch (error) {
                    setStatusMessage(`Unable to update playlist: ${(error as Error).message}`);
                  }
                })()
              }
              onReorderSong={(songId, newOrder) =>
                void (async () => {
                  if (!window.appBridge || activeView.type !== 'playlist') {
                    return;
                  }
                  try {
                    await window.appBridge.reorderPlaylistSong(activeView.id, songId, newOrder);
                    const nextPlaylistSongs = await window.appBridge.getPlaylistSongs(activeView.id);
                    setPlaylistSongs(nextPlaylistSongs);
                    await refreshLibrary({ preserveStatus: true, keepVisible: true });
                  } catch (error) {
                    setStatusMessage(`Unable to reorder playlist: ${(error as Error).message}`);
                  }
                })()
              }
              onTagClick={handleAddTagFilter}
            />
          ) : visibleSongs.length === 0 ? (
            <section className="panel empty-state-panel">
              {songs.length === 0 ? (
                <>
                  <p className="eyebrow">Library Empty</p>
                  <h2>{IS_WEB ? 'Upload MIDI or MSCZ to start your setlist.' : 'Upload MIDI to start your setlist.'}</h2>
                  <p className="empty-state">{IS_WEB
                    ? 'Upload MIDI or MuseScore (.mscz) files above. MuseScore scores are converted automatically for playback.'
                    : 'Use Upload MIDI or Import Folder above, then come back here to play, learn, and build practice plans.'}</p>
                </>
              ) : (
                <>
                  <p className="eyebrow">No Matches</p>
                  <h2>Widen the filter and try again.</h2>
                  <p className="empty-state">Nothing matches the current search, collection, or filter settings. Clear a filter or switch collections to bring songs back.</p>
                </>
              )}
            </section>
          ) : (
            <section className={viewMode === 'grid' ? 'song-grid' : 'song-list'}>
              {visibleSongs.map(renderSongCard)}
            </section>
          )}
        </div>
      </section>
      {pendingDeleteIds ? (
        <DeleteSongsModal
          songCount={pendingDeleteIds.length}
          triggerRef={deleteTriggerRef}
          onCancel={() => setPendingDeleteIds(null)}
          onConfirm={() => {
            const songIds = pendingDeleteIds;
            setPendingDeleteIds(null);
            void handleDeleteSongs(songIds);
          }}
        />
      ) : null}
    </main>
  );
}
