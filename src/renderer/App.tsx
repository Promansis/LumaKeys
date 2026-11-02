import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../lib/audio/audioEngine';
import { ACHIEVEMENTS } from '../lib/achievements/achievementDefinitions';
import {
  DEFAULT_INSTRUMENT_ID,
  DEFAULT_WEB_INSTRUMENT_ID,
  getInstrumentEffectiveReverbPreset,
  isInstrumentId,
  isInstrumentSelectable,
  type InstrumentReverbPreset,
} from '../lib/audio/instrumentCatalog';
import { createUrlsFromFilenames } from '../lib/audio/instrumentSamplePacks';
import { getUnlockedRewardIds } from '../lib/rewards/rewardCatalog';
import { CURRICULUM, getLessonById, getTierByLessonId } from '../lib/learning/curriculum';
import { buildDeveloperUnlockedProgress } from '../lib/learning/developerUnlocks';
import { buildLessonDrill, buildRhythmClappingDrill } from '../lib/learning/drillGenerator';
import {
  EMPTY_LEARNING_PROGRESS,
  getCapstoneRunSetup,
  isCapstoneRunSetupIntact,
  loadLearningProgress,
  markLessonCompleted,
  markLessonStepCompleted,
  recordCapstoneResult,
  saveLearningProgress,
  setLearningGating,
} from '../lib/learning/learningProgress';
import type { LearningProgress, LearningTierId } from '../lib/learning/types';
import type { GameResult, LoopRange, ParsedSong, ScoredSessionMode, SessionConfig } from '../lib/game/types';
import { ComputerKeyboardInputService } from '../lib/input/computerKeyboardInputService';
import {
  INPUT_KEYBOARD_MAPPING_SETTING_KEY,
  INPUT_MODE_SETTING_KEY,
  INPUT_SETTINGS_CATEGORY,
  parseInputMode,
  parseKeyboardMapping,
  stringifyKeyboardMapping,
} from '../lib/input/settings';
import type { InputMode } from '../lib/input/types';
import { parseBooleanSetting, parsePositiveIntegerSetting } from '../lib/settings/registry';
import { parseMidiFile } from '../lib/midi/midiFileParser';
import { MidiInputService } from '../lib/midi/midiInputService';
import type { MidiInputDevice } from '../lib/midi/types';
import type { TheorySuggestion } from '../lib/theory/songAnalysis';
import type { SongRow, UserStatsRow } from '../shared/dbTypes';
import type { InstrumentSamplePackStatus, ResolvedInstrumentSampleSource } from '../shared/ipc';
import { AchievementToast } from './components/AchievementToast';
import { ToastHost, toastBus } from './components/Toast';
import { FreePlayScreen } from './components/FreePlayScreen';
import { GameScreen, type GameScreenSource } from './components/GameScreen';
import type { ImmersiveHudDestination, ImmersiveHudNavigationItem } from './components/ImmersiveHud';
import { IntervalTrainerScreen } from './components/IntervalTrainerScreen';
import { KeyboardSetupScreen } from './components/KeyboardSetupScreen';
import { LearnHubScreen } from './components/LearnHubScreen';
import { LessonScreen } from './components/LessonScreen';
import { LibraryScreen } from './components/LibraryScreen';
import { MainMenuScreen } from './components/MainMenuScreen';
import { NoveltySoundboardScreen } from './components/NoveltySoundboardScreen';
import { ProgressDashboardScreen } from './components/ProgressDashboardScreen';
import { ResultsScreen } from './components/ResultsScreen';
import { ScalePracticeScreen } from './components/ScalePracticeScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { SetupGuideScreen } from './components/SetupGuideScreen';
import { TheoryHubScreen } from './components/TheoryHubScreen';
import { TheoryQuizScreen } from './components/TheoryQuizScreen';
import { saveSetting } from './saveSetting';

type LessonReturnTarget = { lessonId: string; stepIndex: number };
/** The last try at a step that missed its pass mark, shown when the lesson reopens on that step. */
type LessonAttempt = { stepIndex: number; accuracy: number; target: number };
type KeyboardSetupReturnTarget =
  | 'setup'
  | 'library'
  | 'learn-hub'
  | 'settings'
  | 'free-play'
  | 'soundboard'
  | LessonReturnTarget;

type AppScreen =
  | { screen: 'setup' }
  | { screen: 'main-menu' }
  | { screen: 'library' }
  | { screen: 'learn-hub' }
  | { screen: 'lesson'; lessonId: string; stepIndex?: number; lastAttempt?: LessonAttempt }
  | { screen: 'free-play' }
  | { screen: 'soundboard' }
  | { screen: 'theory-hub' }
  | { screen: 'progress-dashboard' }
  | { screen: 'settings' }
  | { screen: 'scale-practice'; preset?: { root: number; scaleName: string }; returnTo?: LessonReturnTarget }
  | { screen: 'interval-trainer'; preset?: { difficulty: string }; returnTo?: LessonReturnTarget }
  | { screen: 'theory-quiz'; preset?: { quizType: string }; returnTo?: LessonReturnTarget }
  | { screen: 'keyboard-setup'; returnTo: KeyboardSetupReturnTarget }
  | { screen: 'game'; song: SongRow; sessionConfig: SessionConfig; playlistQueue: PlaylistQueue | null }
  | { screen: 'lesson-drill'; lessonId: string; stepIndex: number; parsedSong: ParsedSong; sessionConfig: SessionConfig; isRhythmClapping?: boolean }
  | { screen: 'capstone'; tierId: string; parsedSong: ParsedSong; sessionConfig: SessionConfig }
  | {
      screen: 'results';
      song: SongRow;
      sessionConfig: SessionConfig;
      result: GameResult;
      baselineStats: UserStatsRow | null;
      playlistQueue: PlaylistQueue | null;
    };

interface PlaylistQueue {
  songs: SongRow[];
  index: number;
}

interface FinishedGamePayload {
  result: GameResult;
  song: SongRow;
  sessionConfig: SessionConfig;
  baselineStats: UserStatsRow | null;
  playlistQueue: PlaylistQueue | null;
}

function buildSessionConfig(
  mode: ScoredSessionMode,
  waitModeDefault: boolean,
  metronomeDefault: boolean,
  pitchBendEnabled: boolean,
  latencyCompMs: number,
  hitWindowMs: number,
  beatsVisible: number,
  leadInBeats: number,
  overrides: Partial<SessionConfig> = {},
): SessionConfig {
  return {
    mode,
    tempoMultiplier: 1,
    handFilter: 'both',
    loopRange: null,
    waitForInput: waitModeDefault || mode === 'learning',
    metronomeEnabled: metronomeDefault,
    handSize: 'medium',
    fingeringDisplayMode: 'learning-only',
    pitchBendEnabled,
    latencyCompMs,
    hitWindowMs,
    beatsVisible,
    leadInBeats,
    ...overrides,
  };
}

export function parseStoredAudioNumber(value: string | null | undefined, fallback: number): number {
  // Number(null) and Number('') are 0, which would pass as a saved silent level.
  if (value == null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseInstrumentReverbPresetMap(
  value: string | null,
): Record<string, InstrumentReverbPreset> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, InstrumentReverbPreset] =>
        entry[1] === 'short' || entry[1] === 'medium' || entry[1] === 'hall',
      ),
    );
  } catch {
    return {};
  }
}

const DEFAULT_THEME = 'dark';
const DEFAULT_LEFT_HAND_COLOR = '';
const DEFAULT_RIGHT_HAND_COLOR = '';
type StagePalette = 'default' | 'aurora-emerald' | 'constellation-galactic';
const DEFAULT_STAGE_PALETTE: StagePalette = 'default';
const STAGE_PALETTES: Record<Exclude<StagePalette, 'default'>, Record<string, string>> = {
  'aurora-emerald': {
    '--color-stage-bg-top': '#041b22',
    '--color-stage-bg-bottom': '#01070d',
    '--color-stage-text': 'rgba(230, 255, 247, 0.95)',
    '--color-stage-text-muted': 'rgba(183, 238, 221, 0.74)',
    '--color-stage-accent': '#68f6c4',
    '--color-stage-accent-secondary': '#2ec98d',
    '--color-stage-grid': 'rgba(96, 235, 193, 0.16)',
    '--color-stage-surface': 'rgba(6, 33, 37, 0.72)',
  },
  'constellation-galactic': {
    '--color-stage-bg-top': '#110b29',
    '--color-stage-bg-bottom': '#03050f',
    '--color-stage-text': 'rgba(244, 240, 255, 0.96)',
    '--color-stage-text-muted': 'rgba(210, 202, 248, 0.76)',
    '--color-stage-accent': '#8ea2ff',
    '--color-stage-accent-secondary': '#ff9ed8',
    '--color-stage-grid': 'rgba(152, 172, 255, 0.18)',
    '--color-stage-surface': 'rgba(18, 16, 42, 0.72)',
  },
};

function applyTheme(theme: string): void {
  document.documentElement.dataset.theme =
    theme === 'warm' || theme === 'light' || theme === 'dark' || theme === 'neon' ? theme : DEFAULT_THEME;
}

function applyHandColor(key: 'left' | 'right', value: string): void {
  const prop = key === 'left' ? '--hand-left-color' : '--hand-right-color';
  if (value) {
    document.documentElement.style.setProperty(prop, value);
  } else {
    document.documentElement.style.removeProperty(prop);
  }
}

function applyStagePalette(palette: string): void {
  const nextPalette =
    palette === 'aurora-emerald' || palette === 'constellation-galactic'
      ? palette
      : DEFAULT_STAGE_PALETTE;
  const rootStyle = document.documentElement.style;
  for (const prop of [
    '--color-stage-bg-top',
    '--color-stage-bg-bottom',
    '--color-stage-text',
    '--color-stage-text-muted',
    '--color-stage-accent',
    '--color-stage-accent-secondary',
    '--color-stage-grid',
    '--color-stage-surface',
  ]) {
    rootStyle.removeProperty(prop);
  }
  if (nextPalette === 'default') {
    return;
  }
  for (const [prop, value] of Object.entries(STAGE_PALETTES[nextPalette])) {
    rootStyle.setProperty(prop, value);
  }
}

function getKeyboardSetupReturnTrail(returnTo: KeyboardSetupReturnTarget): string[] {
  if (isLessonReturnTarget(returnTo)) {
    return ['Main Menu', 'Learn', 'Lesson'];
  }

  switch (returnTo) {
    case 'setup':
      return ['Setup'];
    case 'library':
      return ['Main Menu', 'Library'];
    case 'learn-hub':
      return ['Main Menu', 'Learn'];
    case 'settings':
      return ['Main Menu', 'Settings'];
    case 'free-play':
      return ['Main Menu', 'Free Play'];
    case 'soundboard':
      return ['Main Menu', 'Soundboard'];
  }
}

function isLessonReturnTarget(value: KeyboardSetupReturnTarget): value is LessonReturnTarget {
  return typeof value === 'object' && value !== null && 'lessonId' in value && 'stepIndex' in value;
}

function getContextualBackLabel(currentScreen: AppScreen): string {
  switch (currentScreen.screen) {
    case 'lesson':
      return 'Back to Learn';
    case 'scale-practice':
    case 'interval-trainer':
    case 'theory-quiz':
      return currentScreen.returnTo ? 'Back to Lesson' : 'Back to Theory';
    case 'keyboard-setup': {
      const trail = getKeyboardSetupReturnTrail(currentScreen.returnTo);
      return `Back to ${trail[trail.length - 1]}`;
    }
    case 'learn-hub':
    case 'library':
    case 'progress-dashboard':
    case 'settings':
    case 'theory-hub':
    case 'results':
      return 'Back to Main Menu';
    default:
      return 'Back';
  }
}

export function App() {
  const audioEngineRef = useRef(new AudioEngine());
  const midiServiceRef = useRef<MidiInputService | null>(null);
  const keyboardServiceRef = useRef(new ComputerKeyboardInputService());
  const [midiError, setMidiError] = useState(false);
  const [settingsReady, setSettingsReady] = useState(false);
  const [handSize, setHandSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [inputMode, setInputMode] = useState<InputMode>('both');
  const [midiDevices, setMidiDevices] = useState<MidiInputDevice[]>([]);
  const [achievementToastQueue, setAchievementToastQueue] = useState<string[]>([]);
  const [showDailyGoalToast, setShowDailyGoalToast] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [unlockedRewardIds, setUnlockedRewardIds] = useState<Set<string>>(new Set());
  const [currentScreen, setCurrentScreen] = useState<AppScreen>({ screen: 'main-menu' });
  const [colorBlindMode, setColorBlindMode] = useState(false);
  const [noteLabels, setNoteLabels] = useState<'alphabetic' | 'symbols' | 'both' | 'none'>('alphabetic');
  const [noteLabelSize, setNoteLabelSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [keyboardOverlaySize, setKeyboardOverlaySize] = useState<'small' | 'medium' | 'large'>('medium');
  const [stagePalette, setStagePalette] = useState<StagePalette>(DEFAULT_STAGE_PALETTE);
  const [latencyCompMs, setLatencyCompMs] = useState(0);
  const [waitModeDefault, setWaitModeDefault] = useState(false);
  const [metronomeDefault, setMetronomeDefault] = useState(false);
  const [pitchBendEnabled, setPitchBendEnabled] = useState(true);
  const [hitWindowMs, setHitWindowMs] = useState(100);
  const [beatsVisible, setBeatsVisible] = useState(8);
  const [leadInBeats, setLeadInBeats] = useState(2);
  const [instrumentId, setInstrumentId] = useState(DEFAULT_INSTRUMENT_ID);
  const [instrumentReverbPresets, setInstrumentReverbPresets] = useState<Record<string, InstrumentReverbPreset>>({});
  const [instrumentSamplePackStatuses, setInstrumentSamplePackStatuses] = useState<Record<string, InstrumentSamplePackStatus>>({});
  const [customSamplePackPath, setCustomSamplePackPath] = useState('');
  const [postureReminderMinutes, setPostureReminderMinutes] = useState<number | null>(null);
  const [breakReminderMinutes, setBreakReminderMinutes] = useState<number | null>(null);
  const [learningProgress, setLearningProgressState] = useState<LearningProgress>(EMPTY_LEARNING_PROGRESS);
  // The newest progress, readable before React re-renders, so a save never waits on a state updater.
  const learningProgressRef = useRef<LearningProgress>(EMPTY_LEARNING_PROGRESS);
  const learningSaveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const setLearningProgress = (next: LearningProgress) => {
    learningProgressRef.current = next;
    setLearningProgressState(next);
  };

  const getInstalledPackInstrumentIds = (statuses: Record<string, InstrumentSamplePackStatus>) =>
    Object.values(statuses)
      .filter((status) => status.isInstalled)
      .map((status) => status.instrumentId);

  const syncInstrumentSamplePackStatuses = async (): Promise<Record<string, InstrumentSamplePackStatus>> => {
    if (!window.appBridge?.getInstrumentSamplePackStatuses) {
      setInstrumentSamplePackStatuses({});
      return {};
    }

    const statuses = await window.appBridge.getInstrumentSamplePackStatuses();
    const nextStatuses = Object.fromEntries(statuses.map((status) => [status.instrumentId, status]));
    setInstrumentSamplePackStatuses(nextStatuses);
    return nextStatuses;
  };

  const applyResolvedInstrumentSource = async (
    nextInstrumentId: string,
    manualSamplePackPath: string,
    resolvedSource?: ResolvedInstrumentSampleSource | null,
  ): Promise<void> => {
    if (!window.appBridge) {
      return;
    }

    if (!IS_WEB && manualSamplePackPath) {
      const files = await window.appBridge.listAudioFiles(manualSamplePackPath);
      const urls = createUrlsFromFilenames(files);
      if (Object.keys(urls).length > 0) {
        const baseUrl = `file:///${manualSamplePackPath.replace(/\\/g, '/').replace(/\/?$/, '/')}`;
        await audioEngineRef.current.setCustomSampler(urls, baseUrl);
        return;
      }
    }

    const nextResolvedSource =
      resolvedSource === undefined && window.appBridge.resolveInstrumentSampleSource
        ? await window.appBridge.resolveInstrumentSampleSource(nextInstrumentId)
        : resolvedSource;

    if (nextResolvedSource) {
      await audioEngineRef.current.setCustomSampler(nextResolvedSource.urls, nextResolvedSource.baseUrl);
      return;
    }

    await audioEngineRef.current.clearCustomSampler();
  };

  const saveAppSetting = async (category: string, key: string, value: string) => {
    const result = await saveSetting(category, key, value);
    if (!result.saved) {
      const label = category === INPUT_SETTINGS_CATEGORY && key === INPUT_MODE_SETTING_KEY ? 'Input mode' : key;
      setStartupError(`${label} is active for this session only. Save failed; try again.`);
    }
    return result;
  };

  useEffect(() => {
    let disposed = false;
    const service = new MidiInputService();
    midiServiceRef.current = service;
    keyboardServiceRef.current.init();

    const unsubscribeDevices = service.subscribeDevices((devices) => {
      setMidiDevices(devices);
    });

    // The browser's MIDI permission prompt can stay unanswered indefinitely, so the
    // app never waits on it: the device list and error state update when it settles.
    const tryInit = () => {
      service
        .init()
        .then(() => {
          if (!disposed) {
            setMidiError(false);
          }
        })
        .catch(() => {
          if (!disposed) {
            setMidiError(true);
          }
        });
    };

    tryInit();

    // Auto-retry when the browser grants the midi permission (e.g. user
    // allows via site settings after the initial prompt was dismissed).
    let permissionStatus: PermissionStatus | null = null;
    const handlePermissionChange = () => {
      if (permissionStatus?.state === 'granted') {
        setMidiError(false);
        service
          .init()
          .then(() => {
            if (!disposed) {
              setMidiError(false);
            }
          })
          .catch(() => {});
      }
    };

    if (typeof navigator.permissions?.query === 'function') {
      navigator.permissions
        .query({ name: 'midi' as PermissionName })
        .then((status) => {
          if (disposed) {
            return;
          }
          permissionStatus = status;
          status.addEventListener('change', handlePermissionChange);
        })
        .catch(() => {});
    }

    return () => {
      disposed = true;
      permissionStatus?.removeEventListener('change', handlePermissionChange);
      unsubscribeDevices();
      service.dispose();
      keyboardServiceRef.current.dispose();
    };
  }, []);

  useEffect(() => {
    const prepareAudio = async () => {
      try {
        await audioEngineRef.current.prepareForPlayback();
      } catch {
        // A later user gesture will retry if the browser still blocks audio.
      }
    };

    window.addEventListener('pointerdown', prepareAudio, { capture: true });
    window.addEventListener('keydown', prepareAudio, { capture: true });

    return () => {
      window.removeEventListener('pointerdown', prepareAudio, true);
      window.removeEventListener('keydown', prepareAudio, true);
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    const loadAppSettings = async () => {
      if (!window.appBridge) {
        if (!ignore) {
          setSettingsReady(true);
        }
        return;
      }

      try {
        const nextInstrumentSamplePackStatuses = await syncInstrumentSamplePackStatuses();
        const installedPackInstrumentIds = getInstalledPackInstrumentIds(nextInstrumentSamplePackStatuses);

        const [
          setupComplete,
          reminder,
          savedHandSize,
          rawInputMode,
          rawKeyboardMapping,
          rawInstrumentId,
          rawMasterVolume,
          rawMetronomeVolume,
          rawReverbLevel,
          rawTheme,
          rawColorBlind,
          rawNoteLabels,
          rawKeyboardSize,
          rawStagePalette,
          rawLatencyComp,
          rawWaitMode,
          rawMetronomeDefault,
          rawBreakReminder,
          rawMidiDeviceId,
          rawCustomSamplePath,
          rawHitWindow,
          rawBeatsVisible,
          rawLeftHandColor,
          rawRightHandColor,
          rawMetronomeSound,
          rawLeadInBeats,
          rawNoteLabelSize,
          rawPitchBendEnabled,
          rawInstrumentReverbPresets,
        ] = await Promise.all([
          window.appBridge.getSetting('onboarding', 'setupComplete'),
          window.appBridge.getSetting('practice', 'postureReminderMinutes'),
          window.appBridge.getSetting('fingering', 'handSize'),
          window.appBridge.getSetting(INPUT_SETTINGS_CATEGORY, INPUT_MODE_SETTING_KEY),
          window.appBridge.getSetting(INPUT_SETTINGS_CATEGORY, INPUT_KEYBOARD_MAPPING_SETTING_KEY),
          window.appBridge.getSetting('audio', 'instrumentId'),
          window.appBridge.getSetting('audio', 'masterVolume'),
          window.appBridge.getSetting('audio', 'metronomeVolume'),
          window.appBridge.getSetting('audio', 'reverbLevel'),
          window.appBridge.getSetting('visual', 'theme'),
          window.appBridge.getSetting('visual', 'colorBlindMode'),
          window.appBridge.getSetting('visual', 'noteLabels'),
          window.appBridge.getSetting('visual', 'keyboardOverlaySize'),
          window.appBridge.getSetting('visual', 'stagePalette'),
          window.appBridge.getSetting('audio', 'latencyCompMs'),
          window.appBridge.getSetting('gameplay', 'waitModeDefault'),
          window.appBridge.getSetting('gameplay', 'metronomeDefault'),
          window.appBridge.getSetting('practice', 'breakReminderMinutes'),
          window.appBridge.getSetting('input', 'midiDeviceId'),
          window.appBridge.getSetting('audio', 'customSamplePackPath'),
          window.appBridge.getSetting('gameplay', 'hitWindowMs'),
          window.appBridge.getSetting('visual', 'beatsVisible'),
          window.appBridge.getSetting('visual', 'leftHandColor'),
          window.appBridge.getSetting('visual', 'rightHandColor'),
          window.appBridge.getSetting('audio', 'metronomeSound'),
          window.appBridge.getSetting('gameplay', 'leadInBeats'),
          window.appBridge.getSetting('visual', 'noteLabelSize'),
          window.appBridge.getSetting('audio', 'pitchBendEnabled'),
          window.appBridge.getSetting('audio', 'instrumentReverbPresets'),
        ]);

        if (ignore) {
          return;
        }

        setStartupError(null);

        setPostureReminderMinutes(parsePositiveIntegerSetting(reminder));
        if (savedHandSize === 'small' || savedHandSize === 'medium' || savedHandSize === 'large') {
          setHandSize(savedHandSize);
        }

        const theme =
          rawTheme === 'warm' || rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'neon'
            ? rawTheme
            : DEFAULT_THEME;
        applyTheme(theme);
        if (!rawTheme) {
          void saveAppSetting('visual', 'theme', theme);
        }

        setColorBlindMode(rawColorBlind === 'true');

        if (rawNoteLabels === 'alphabetic' || rawNoteLabels === 'symbols' || rawNoteLabels === 'both' || rawNoteLabels === 'none') {
          setNoteLabels(rawNoteLabels);
        }

        if (rawKeyboardSize === 'small' || rawKeyboardSize === 'large') {
          setKeyboardOverlaySize(rawKeyboardSize);
        }

        const nextStagePalette =
          rawStagePalette === 'aurora-emerald' || rawStagePalette === 'constellation-galactic'
            ? rawStagePalette
            : DEFAULT_STAGE_PALETTE;
        setStagePalette(nextStagePalette);
        applyStagePalette(nextStagePalette);

        const parsedLatency = Number(rawLatencyComp);
        if (Number.isFinite(parsedLatency)) {
          setLatencyCompMs(parsedLatency);
        }

        setWaitModeDefault(rawWaitMode === 'true');
        setMetronomeDefault(parseBooleanSetting(rawMetronomeDefault, false));
        setPitchBendEnabled(parseBooleanSetting(rawPitchBendEnabled, true));
        setBreakReminderMinutes(parsePositiveIntegerSetting(rawBreakReminder));

        if (rawMidiDeviceId && midiServiceRef.current) {
          midiServiceRef.current.setDeviceFilter(rawMidiDeviceId);
        }

        setCustomSamplePackPath(rawCustomSamplePath ?? '');

        const nextInputMode = parseInputMode(rawInputMode);
        setInputMode(nextInputMode);
        if (!rawInputMode) {
          void saveAppSetting(INPUT_SETTINGS_CATEGORY, INPUT_MODE_SETTING_KEY, nextInputMode);
        }

        const parsedMapping = parseKeyboardMapping(rawKeyboardMapping);
        keyboardServiceRef.current.setMapping(parsedMapping);
        if (!rawKeyboardMapping) {
          void saveAppSetting(
            INPUT_SETTINGS_CATEGORY,
            INPUT_KEYBOARD_MAPPING_SETTING_KEY,
            stringifyKeyboardMapping(parsedMapping),
          );
        }

        const defaultInstrumentId = IS_WEB ? DEFAULT_WEB_INSTRUMENT_ID : DEFAULT_INSTRUMENT_ID;
        const initialInstrumentId =
          isInstrumentId(rawInstrumentId) && isInstrumentSelectable(rawInstrumentId, installedPackInstrumentIds)
            ? rawInstrumentId
            : defaultInstrumentId;
        const nextInstrumentReverbPresets = parseInstrumentReverbPresetMap(rawInstrumentReverbPresets);
        setInstrumentId(initialInstrumentId);
        setInstrumentReverbPresets(nextInstrumentReverbPresets);
        audioEngineRef.current.setMasterVolume(parseStoredAudioNumber(rawMasterVolume, 80));
        audioEngineRef.current.setMetronomeVolume(parseStoredAudioNumber(rawMetronomeVolume, 65));
        audioEngineRef.current.setReverbLevel(parseStoredAudioNumber(rawReverbLevel, 20));
        await audioEngineRef.current.setInstrument(initialInstrumentId);
        await applyResolvedInstrumentSource(initialInstrumentId, rawCustomSamplePath ?? '');
        if (ignore) {
          return;
        }
        audioEngineRef.current.setInstrumentReverbPreset(
          getInstrumentEffectiveReverbPreset(initialInstrumentId, nextInstrumentReverbPresets),
        );

        if (!rawInstrumentId) {
          void saveAppSetting('audio', 'instrumentId', initialInstrumentId);
        }

        const parsedHitWindow = Number(rawHitWindow);
        if (Number.isFinite(parsedHitWindow) && parsedHitWindow > 0) {
          setHitWindowMs(parsedHitWindow);
        }

        const parsedBeatsVisible = Number(rawBeatsVisible);
        if (Number.isFinite(parsedBeatsVisible) && parsedBeatsVisible > 0) {
          setBeatsVisible(parsedBeatsVisible);
        }

        // Number(null) and Number('') are 0, which would pass as a saved zero-beat count-in.
        const parsedLeadIn = rawLeadInBeats == null || rawLeadInBeats.trim() === '' ? NaN : Number(rawLeadInBeats);
        if (Number.isFinite(parsedLeadIn) && parsedLeadIn >= 0) {
          setLeadInBeats(Math.round(parsedLeadIn));
        }

        if (rawNoteLabelSize === 'small' || rawNoteLabelSize === 'large') {
          setNoteLabelSize(rawNoteLabelSize);
        }

        applyHandColor('left', rawLeftHandColor ?? DEFAULT_LEFT_HAND_COLOR);
        applyHandColor('right', rawRightHandColor ?? DEFAULT_RIGHT_HAND_COLOR);

        if (rawMetronomeSound) {
          audioEngineRef.current.setMetronomeSound(rawMetronomeSound);
        }

        setCurrentScreen({ screen: setupComplete === 'true' ? 'main-menu' : 'setup' });
        setSettingsReady(true);

        const achievements = await window.appBridge.getAllAchievements().catch(() => null);
        if (!ignore && achievements) {
          setUnlockedRewardIds(getUnlockedRewardIds(achievements));
        }
      } catch {
        if (ignore) {
          return;
        }
        applyTheme(DEFAULT_THEME);
        applyHandColor('left', DEFAULT_LEFT_HAND_COLOR);
        applyHandColor('right', DEFAULT_RIGHT_HAND_COLOR);
        applyStagePalette(DEFAULT_STAGE_PALETTE);
        setStartupError('Some saved settings could not be loaded. Defaults are active for this session.');
        setCurrentScreen({ screen: 'main-menu' });
        setSettingsReady(true);
      }
    };

    void loadAppSettings();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    void loadLearningProgress(window.appBridge)
      .then((progress) => {
        if (!ignore) {
          setLearningProgress(progress);
        }
      })
      .catch(() => {
        if (!ignore) {
          setLearningProgress(EMPTY_LEARNING_PROGRESS);
          setStartupError('Some saved settings could not be loaded. Defaults are active for this session.');
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (achievementToastQueue.length === 0) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setAchievementToastQueue((current) => current.slice(1));
    }, 5000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [achievementToastQueue]);

  const persistInputMode = (nextMode: InputMode) => {
    setInputMode(nextMode);
    void saveAppSetting(INPUT_SETTINGS_CATEGORY, INPUT_MODE_SETTING_KEY, nextMode);
  };

  const persistInstrumentId = (nextInstrumentId: string) => {
    const installedPackInstrumentIds = getInstalledPackInstrumentIds(instrumentSamplePackStatuses);
    const safeInstrumentId =
      isInstrumentId(nextInstrumentId) && isInstrumentSelectable(nextInstrumentId, installedPackInstrumentIds)
        ? nextInstrumentId
        : DEFAULT_INSTRUMENT_ID;
    setInstrumentId(safeInstrumentId);
    void (async () => {
      await audioEngineRef.current.setInstrument(safeInstrumentId);
      await applyResolvedInstrumentSource(safeInstrumentId, customSamplePackPath);
      audioEngineRef.current.setInstrumentReverbPreset(
        getInstrumentEffectiveReverbPreset(safeInstrumentId, instrumentReverbPresets),
      );
    })();
    void saveAppSetting('audio', 'instrumentId', safeInstrumentId);
  };

  const installInstrumentSamplePack = async (targetInstrumentId: string) => {
    if (!window.appBridge?.installInstrumentSamplePack) {
      return;
    }
    const statuses = await window.appBridge.installInstrumentSamplePack(targetInstrumentId);
    const nextStatuses = Object.fromEntries(statuses.map((status) => [status.instrumentId, status]));
    setInstrumentSamplePackStatuses(nextStatuses);

    if (targetInstrumentId === instrumentId) {
      const resolved = await window.appBridge.resolveInstrumentSampleSource(targetInstrumentId);
      await applyResolvedInstrumentSource(targetInstrumentId, customSamplePackPath, resolved);
    }
  };

  const removeInstrumentSamplePack = async (targetInstrumentId: string) => {
    if (!window.appBridge?.removeInstrumentSamplePack) {
      return;
    }
    const statuses = await window.appBridge.removeInstrumentSamplePack(targetInstrumentId);
    const nextStatuses = Object.fromEntries(statuses.map((status) => [status.instrumentId, status]));
    setInstrumentSamplePackStatuses(nextStatuses);

    const installedPackInstrumentIds = getInstalledPackInstrumentIds(nextStatuses);
    const nextSelectedInstrumentId = isInstrumentSelectable(instrumentId, installedPackInstrumentIds)
      ? instrumentId
      : DEFAULT_INSTRUMENT_ID;
    if (nextSelectedInstrumentId !== instrumentId) {
      setInstrumentId(nextSelectedInstrumentId);
      void saveAppSetting('audio', 'instrumentId', nextSelectedInstrumentId);
    }

    await audioEngineRef.current.setInstrument(nextSelectedInstrumentId);
    await applyResolvedInstrumentSource(nextSelectedInstrumentId, customSamplePackPath);
    audioEngineRef.current.setInstrumentReverbPreset(
      getInstrumentEffectiveReverbPreset(nextSelectedInstrumentId, instrumentReverbPresets),
    );
  };

  const retryMidiInit = () => {
    if (!midiServiceRef.current) {
      return;
    }
    midiServiceRef.current
      .init()
      .then(() => setMidiError(false))
      .catch(() => setMidiError(true));
  };

  const applySettingChange = (category: string, key: string, value: string) => {
    if (category === 'audio') {
      if (key === 'metronomeSound') {
        audioEngineRef.current.setMetronomeSound(value);
        return;
      }
      if (key === 'instrumentId') {
        const installedPackInstrumentIds = getInstalledPackInstrumentIds(instrumentSamplePackStatuses);
        const nextInstrumentId =
          isInstrumentId(value) && isInstrumentSelectable(value, installedPackInstrumentIds)
            ? value
            : DEFAULT_INSTRUMENT_ID;
        setInstrumentId(nextInstrumentId);
        void (async () => {
          await audioEngineRef.current.setInstrument(nextInstrumentId);
          await applyResolvedInstrumentSource(nextInstrumentId, customSamplePackPath);
          audioEngineRef.current.setInstrumentReverbPreset(
            getInstrumentEffectiveReverbPreset(nextInstrumentId, instrumentReverbPresets),
          );
        })();
        return;
      }
      if (key === 'instrumentReverbPresets') {
        const nextPresets = parseInstrumentReverbPresetMap(value);
        setInstrumentReverbPresets(nextPresets);
        audioEngineRef.current.setInstrumentReverbPreset(
          getInstrumentEffectiveReverbPreset(instrumentId, nextPresets),
        );
        return;
      }
      if (key === 'customSamplePackPath') {
        setCustomSamplePackPath(value);
        void (async () => {
          await applyResolvedInstrumentSource(instrumentId, value);
        })();
        return;
      }
      const parsedValue = Number(value);
      if (!Number.isFinite(parsedValue)) {
        return;
      }
      if (key === 'masterVolume') {
        audioEngineRef.current.setMasterVolume(parsedValue);
      } else if (key === 'metronomeVolume') {
        audioEngineRef.current.setMetronomeVolume(parsedValue);
      } else if (key === 'reverbLevel') {
        audioEngineRef.current.setReverbLevel(parsedValue);
      } else if (key === 'latencyCompMs') {
        setLatencyCompMs(parsedValue);
      } else if (key === 'pitchBendEnabled') {
        setPitchBendEnabled(value !== 'false');
      }
      return;
    }

    if (category === 'visual') {
      if (key === 'theme') {
        applyTheme(value);
      } else if (key === 'stagePalette') {
        const nextStagePalette =
          value === 'aurora-emerald' || value === 'constellation-galactic'
            ? value
            : DEFAULT_STAGE_PALETTE;
        setStagePalette(nextStagePalette);
        applyStagePalette(nextStagePalette);
      } else if (key === 'colorBlindMode') {
        setColorBlindMode(value === 'true');
      } else if (key === 'beatsVisible') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          setBeatsVisible(parsed);
        }
      } else if (key === 'leftHandColor') {
        applyHandColor('left', value);
      } else if (key === 'rightHandColor') {
        applyHandColor('right', value);
      } else if (key === 'noteLabels' && (value === 'alphabetic' || value === 'symbols' || value === 'both' || value === 'none')) {
        setNoteLabels(value);
      } else if (key === 'keyboardOverlaySize' && (value === 'small' || value === 'medium' || value === 'large')) {
        setKeyboardOverlaySize(value);
      } else if (key === 'noteLabelSize' && (value === 'small' || value === 'medium' || value === 'large')) {
        setNoteLabelSize(value);
      }
      return;
    }

    if (category === 'gameplay') {
      if (key === 'waitModeDefault') {
        setWaitModeDefault(value === 'true');
      } else if (key === 'metronomeDefault') {
        setMetronomeDefault(value === 'true');
      } else if (key === 'hitWindowMs') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          setHitWindowMs(parsed);
        }
      } else if (key === 'leadInBeats') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0) {
          setLeadInBeats(Math.round(parsed));
        }
      }
      return;
    }

    if (category === 'practice') {
      if (key === 'postureReminderMinutes') {
        const parsed = Number(value);
        setPostureReminderMinutes(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
      } else if (key === 'breakReminderMinutes') {
        const parsed = Number(value);
        setBreakReminderMinutes(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
      }
      return;
    }

    if (category === 'input' && key === 'midiDeviceId') {
      midiServiceRef.current?.setDeviceFilter(value || null);
    }
  };

  const resetUiStateToDefaults = () => {
    const defaultInstrumentId = IS_WEB ? DEFAULT_WEB_INSTRUMENT_ID : DEFAULT_INSTRUMENT_ID;
    setColorBlindMode(false);
    setNoteLabels('alphabetic');
    setNoteLabelSize('medium');
    setKeyboardOverlaySize('medium');
    setStagePalette(DEFAULT_STAGE_PALETTE);
    setLatencyCompMs(0);
    setWaitModeDefault(false);
    setMetronomeDefault(false);
    setPitchBendEnabled(true);
    setHitWindowMs(100);
    setBeatsVisible(8);
    setLeadInBeats(2);
    setInstrumentId(defaultInstrumentId);
    setInstrumentReverbPresets({});
    setCustomSamplePackPath('');
    setPostureReminderMinutes(null);
    setBreakReminderMinutes(null);
    setHandSize('medium');
    setUnlockedRewardIds(new Set());
    applyTheme(DEFAULT_THEME);
    applyHandColor('left', DEFAULT_LEFT_HAND_COLOR);
    applyHandColor('right', DEFAULT_RIGHT_HAND_COLOR);
    applyStagePalette(DEFAULT_STAGE_PALETTE);
    audioEngineRef.current.setMasterVolume(80);
    audioEngineRef.current.setMetronomeVolume(65);
    audioEngineRef.current.setReverbLevel(20);
    audioEngineRef.current.setMetronomeSound('classic');
    void audioEngineRef.current.clearCustomSampler();
    void audioEngineRef.current.setInstrument(defaultInstrumentId);
    audioEngineRef.current.setInstrumentReverbPreset(getInstrumentEffectiveReverbPreset(defaultInstrumentId));
    midiServiceRef.current?.setDeviceFilter(null);
    setInputMode('both');
    keyboardServiceRef.current.setMapping(parseKeyboardMapping(null));
  };

  const handleLearningProgressReset = () => {
    setLearningProgress(EMPTY_LEARNING_PROGRESS);
    setUnlockedRewardIds(new Set());
  };

  const handleUserDataReset = () => {
    resetUiStateToDefaults();
    setLearningProgress(EMPTY_LEARNING_PROGRESS);
    setCurrentScreen({ screen: 'main-menu' });
  };

  const handleDeveloperUnlockAll = async () => {
    if (!window.appBridge) {
      return;
    }

    const achievements = await window.appBridge.getAllAchievements();
    const lockedAchievementIds = achievements
      .filter((achievement) => achievement.unlockedAt === null)
      .map((achievement) => achievement.id);
    const knownAchievementIds = new Set(achievements.map((achievement) => achievement.id));

    for (const achievement of ACHIEVEMENTS) {
      if (!knownAchievementIds.has(achievement.id)) {
        lockedAchievementIds.push(achievement.id);
      }
    }

    await Promise.all(
      lockedAchievementIds.map((achievementId) => window.appBridge!.unlockAchievement(achievementId)),
    );

    const refreshedAchievements = await window.appBridge.getAllAchievements();
    setUnlockedRewardIds(getUnlockedRewardIds(refreshedAchievements));

    const nextLearningProgress = buildDeveloperUnlockedProgress(CURRICULUM);
    setLearningProgress(nextLearningProgress);
    await saveLearningProgress(window.appBridge, nextLearningProgress);
  };

  const persistStagePalette = (value: StagePalette) => {
    setStagePalette(value);
    applyStagePalette(value);
    void saveAppSetting('visual', 'stagePalette', value);
  };

  const persistSetupState = async (setupComplete: boolean) => {
    if (!window.appBridge) {
      return;
    }

    const results = await Promise.all([
      saveAppSetting('onboarding', 'setupComplete', setupComplete ? 'true' : 'false'),
      saveAppSetting('practice', 'postureReminderMinutes', String(postureReminderMinutes ?? 0)),
      saveAppSetting('fingering', 'handSize', handSize),
    ]);
    return results.every(({ saved }) => saved);
  };

  const enqueueAchievementToasts = (achievementIds: string[]) => {
    if (achievementIds.length === 0) {
      return;
    }
    void window.appBridge?.getAllAchievements().then((rows) => {
      setUnlockedRewardIds(getUnlockedRewardIds(rows));
    });

    setAchievementToastQueue((current) => [...current, ...achievementIds]);
  };

  const handleDailyGoalReached = () => {
    setShowDailyGoalToast(true);
    window.setTimeout(() => setShowDailyGoalToast(false), 5000);
  };

  const [showSongGoalToast, setShowSongGoalToast] = useState(false);
  const handleSongGoalReached = () => {
    setShowSongGoalToast(true);
    window.setTimeout(() => setShowSongGoalToast(false), 5000);
  };

  const updateLearningProgressState = async (updater: (current: LearningProgress) => LearningProgress) => {
    const next = updater(learningProgressRef.current);
    setLearningProgress(next);
    // Writes go out in order, so a slow earlier save cannot overwrite a newer one.
    const save = learningSaveChainRef.current.then(() => saveLearningProgress(window.appBridge, next));
    learningSaveChainRef.current = save.catch(() => undefined);
    try {
      await save;
    } catch (error) {
      console.error('Failed to save lesson progress:', error);
      setStartupError('Lesson progress is active for this session only. Save failed; try again.');
      toastBus.push({
        variant: 'error',
        title: 'Lesson progress not saved',
        message: 'The change is active for this session, but could not be written to storage.',
      });
    }
  };

  const navigateToLesson = (lessonId: string, stepIndex?: number, lastAttempt?: LessonAttempt) => {
    setCurrentScreen({ screen: 'lesson', lessonId, stepIndex, lastAttempt });
  };

  const handleCapstoneFinished = (tierId: string, accuracy: number, sessionConfig: SessionConfig) => {
    const capstone = CURRICULUM.find((tier) => tier.id === tierId)?.capstone;
    if (capstone && isCapstoneRunSetupIntact(capstone, sessionConfig)) {
      void updateLearningProgressState((current) => recordCapstoneResult(current, tierId as LearningTierId, accuracy));
    } else {
      toastBus.push({
        variant: 'warn',
        title: 'Capstone result not saved',
        message: 'The mode, hand, loop or tempo changed during the run, so it does not count toward the gate.',
      });
    }
    setCurrentScreen({ screen: 'learn-hub' });
  };

  const handleCompleteLessonStep = (lessonId: string, stepIndex: number) => {
    void updateLearningProgressState((current) => markLessonStepCompleted(current, lessonId, stepIndex));
  };

  const handleCompleteLesson = (lessonId: string) => {
    void updateLearningProgressState((current) => markLessonCompleted(current, lessonId));
  };

  const handleLearningSessionResult = (lessonId: string, stepIndex: number, accuracy: number) => {
    const lesson = getLessonById(lessonId);
    const step = lesson?.steps[stepIndex];
    if (!lesson || !step) {
      navigateToLesson(lessonId, stepIndex);
      return;
    }

    const passAccuracy = step.kind === 'tip' ? 100 : step.passAccuracy ?? 70;
    const passed = accuracy >= passAccuracy;
    if (passed) {
      void updateLearningProgressState((current) => markLessonStepCompleted(current, lessonId, stepIndex));
    }

    navigateToLesson(
      lessonId,
      passed ? Math.min(stepIndex + 1, Math.max(0, lesson.steps.length - 1)) : stepIndex,
      // Floor, so "79% of 80%" never rounds up to a pass mark it did not reach.
      passed ? undefined : { stepIndex, accuracy: Math.floor(accuracy), target: passAccuracy },
    );
  };

  const startLessonDrill = (lessonId: string, stepIndex: number) => {
    const lesson = getLessonById(lessonId);
    const step = lesson?.steps[stepIndex];
    if (!lesson || !step || (step.kind !== 'drill' && step.kind !== 'rhythm-clapping')) {
      return;
    }

    const parsedSong = step.kind === 'drill'
      ? buildLessonDrill(step.title, step.drill)
      : buildRhythmClappingDrill(step);

    setCurrentScreen({
      screen: 'lesson-drill',
      lessonId,
      stepIndex,
      parsedSong,
      isRhythmClapping: step.kind === 'rhythm-clapping',
      sessionConfig: buildSessionConfig('luma-keys', false, false, pitchBendEnabled, latencyCompMs, hitWindowMs, beatsVisible, leadInBeats, {
        handSize,
        tempoMultiplier: step.kind === 'drill' ? step.tempoMultiplier ?? 1 : 1,
        handFilter: step.kind === 'drill' ? step.handFilter ?? 'both' : 'both',
      }),
    });
  };

  const startCapstone = async (tierId: string) => {
    const tier = CURRICULUM.find((t) => t.id === tierId);
    if (!tier?.capstone || !window.appBridge) return;
    const { capstone } = tier;
    try {
      const bytes = await window.appBridge.loadCurriculumMidi(capstone.songFileName);
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const parsedSong = parseMidiFile(ab, { songId: `capstone-${tierId}`, title: capstone.displayTitle });
      setCurrentScreen({
        screen: 'capstone',
        tierId,
        parsedSong,
        sessionConfig: buildSessionConfig('luma-keys', false, metronomeDefault, pitchBendEnabled, latencyCompMs, hitWindowMs, beatsVisible, leadInBeats, {
          handSize,
          ...getCapstoneRunSetup(capstone),
        }),
      });
    } catch (err) {
      console.error('Failed to load capstone MIDI:', err);
    }
  };

  const startSongSession = (
    song: SongRow,
    mode: ScoredSessionMode,
    loopRange: LoopRange | null = null,
    playlistQueue: PlaylistQueue | null = null,
  ) => {
    setCurrentScreen({
      screen: 'game',
      song,
      sessionConfig: buildSessionConfig(mode, waitModeDefault, metronomeDefault, pitchBendEnabled, latencyCompMs, hitWindowMs, beatsVisible, leadInBeats, {
        loopRange,
        handSize,
      }),
      playlistQueue,
    });
  };

  const handleGameFinished = ({ result, song, sessionConfig, baselineStats, playlistQueue }: FinishedGamePayload) => {
    setCurrentScreen({
      screen: 'results',
      song,
      sessionConfig,
      result,
      baselineStats,
      playlistQueue,
    });
  };

  const startPlaylistQueue = (songs: SongRow[]) => {
    if (songs.length === 0) {
      return;
    }

    startSongSession(songs[0], 'luma-keys', null, { songs, index: 0 });
  };

  const handleNextQueuedSong = () => {
    if (currentScreen.screen !== 'results' || !currentScreen.playlistQueue) {
      return;
    }

    const nextIndex = currentScreen.playlistQueue.index + 1;
    const nextSong = currentScreen.playlistQueue.songs[nextIndex];
    if (!nextSong) {
      return;
    }

    startSongSession(nextSong, 'luma-keys', null, {
      songs: currentScreen.playlistQueue.songs,
      index: nextIndex,
    });
  };

  const handleStartTheoryPractice = (suggestion?: TheorySuggestion) => {
    if (!suggestion) {
      setCurrentScreen({ screen: 'theory-hub' });
      return;
    }

    if (suggestion.type === 'scale') {
      setCurrentScreen({
        screen: 'scale-practice',
        preset: {
          root: typeof suggestion.params.root === 'number' ? suggestion.params.root : 0,
          scaleName: typeof suggestion.params.scaleName === 'string' ? suggestion.params.scaleName : 'Major',
        },
      });
      return;
    }

    if (suggestion.type === 'interval') {
      setCurrentScreen({
        screen: 'interval-trainer',
        preset: {
          difficulty: typeof suggestion.params.difficulty === 'string' ? suggestion.params.difficulty : 'medium',
        },
      });
      return;
    }

    setCurrentScreen({
      screen: 'theory-quiz',
      preset: {
        quizType: typeof suggestion.params.quizType === 'string' ? suggestion.params.quizType : 'chord',
      },
    });
  };

  const handleBackNavigation = () => {
    switch (currentScreen.screen) {
      case 'setup':
      case 'main-menu':
        return;
      case 'library':
      case 'free-play':
      case 'soundboard':
      case 'theory-hub':
      case 'progress-dashboard':
      case 'settings':
      case 'results':
      case 'learn-hub':
        setCurrentScreen({ screen: 'main-menu' });
        return;
      case 'lesson':
        setCurrentScreen({ screen: 'learn-hub' });
        return;
      case 'scale-practice':
      case 'interval-trainer':
      case 'theory-quiz':
        if (currentScreen.returnTo) {
          setCurrentScreen({ screen: 'lesson', lessonId: currentScreen.returnTo.lessonId, stepIndex: currentScreen.returnTo.stepIndex });
          return;
        }
        setCurrentScreen({ screen: 'theory-hub' });
        return;
      case 'keyboard-setup':
        if (isLessonReturnTarget(currentScreen.returnTo)) {
          setCurrentScreen({ screen: 'lesson', lessonId: currentScreen.returnTo.lessonId, stepIndex: currentScreen.returnTo.stepIndex });
          return;
        }
        setCurrentScreen({ screen: currentScreen.returnTo });
        return;
      case 'game':
        setCurrentScreen({ screen: 'main-menu' });
        return;
      case 'lesson-drill':
        setCurrentScreen({ screen: 'lesson', lessonId: currentScreen.lessonId, stepIndex: currentScreen.stepIndex });
        return;
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const key = event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const isTypingTarget = Boolean(
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)),
      );

      if (event.ctrlKey || event.metaKey) {
        if (key === 's') {
          event.preventDefault();
          setCurrentScreen({ screen: 'settings' });
          return;
        }
        if (key === 'p') {
          event.preventDefault();
          setCurrentScreen({ screen: 'progress-dashboard' });
          return;
        }
      }

      if (isTypingTarget) {
        return;
      }

      if (event.key === 'Escape' && currentScreen.screen !== 'game' && currentScreen.screen !== 'free-play' && currentScreen.screen !== 'soundboard' && currentScreen.screen !== 'lesson-drill' && currentScreen.screen !== 'capstone') {
        event.preventDefault();
        handleBackNavigation();
        return;
      }

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentScreen]);

  // GameScreen reloads its song whenever `source` changes identity, so build it once per
  // screen state. Any other App state change (the MIDI device list, a setting) must not
  // restart a running game.
  const gameSource = useMemo<GameScreenSource | null>(() => {
    switch (currentScreen.screen) {
      case 'game':
        return { kind: 'library-song', song: currentScreen.song, playlistQueue: currentScreen.playlistQueue };
      case 'lesson-drill':
        return {
          kind: 'lesson-drill',
          lessonId: currentScreen.lessonId,
          stepIndex: currentScreen.stepIndex,
          parsedSong: currentScreen.parsedSong,
          isRhythmClapping: currentScreen.isRhythmClapping,
        };
      case 'capstone':
        return {
          kind: 'lesson-drill',
          lessonId: `capstone-${currentScreen.tierId}`,
          stepIndex: 0,
          parsedSong: currentScreen.parsedSong,
          isCapstone: true,
        };
      default:
        return null;
    }
  }, [currentScreen]);

  if (!midiServiceRef.current || !settingsReady) {
    return (
      <main className="app-shell">
        <section className="control-bar panel">
          <p className="eyebrow">LumaKeys</p>
          <h1>Loading services...</h1>
          <p className="song-title">Preparing MIDI, keyboard, audio, and practice settings.</p>
        </section>
      </main>
    );
  }

  const resultsQueue = currentScreen.screen === 'results' ? currentScreen.playlistQueue : null;
  const buildImmersiveHudNavigation = (): ImmersiveHudNavigationItem[] => [
    {
      key: 'main-menu',
      label: 'Main',
      title: 'Go to the main menu',
      onSelect: () => setCurrentScreen({ screen: 'main-menu' }),
    },
    {
      key: 'library',
      label: 'Play',
      title: 'Open the song library',
      onSelect: () => setCurrentScreen({ screen: 'library' }),
    },
    {
      key: 'learn-hub',
      label: 'Learn',
      title: 'Open lessons',
      onSelect: () => setCurrentScreen({ screen: 'learn-hub' }),
    },
    {
      key: 'free-play',
      label: 'Free Play',
      title: 'Open free play',
      onSelect: () => setCurrentScreen({ screen: 'free-play' }),
    },
    {
      key: 'soundboard',
      label: 'Soundboard',
      title: 'Open the soundboard',
      onSelect: () => setCurrentScreen({ screen: 'soundboard' }),
    },
    {
      key: 'theory-hub',
      label: 'Theory',
      title: 'Open theory practice',
      onSelect: () => setCurrentScreen({ screen: 'theory-hub' }),
    },
    {
      key: 'progress-dashboard',
      label: 'Progress',
      title: 'Open progress dashboard',
      onSelect: () => setCurrentScreen({ screen: 'progress-dashboard' }),
    },
    {
      key: 'settings',
      label: 'Settings',
      title: 'Open settings',
      onSelect: () => setCurrentScreen({ screen: 'settings' }),
    },
  ];
  const getCurrentHudDestination = (): ImmersiveHudDestination | undefined => {
    switch (currentScreen.screen) {
      case 'main-menu':
      case 'library':
      case 'learn-hub':
      case 'free-play':
      case 'soundboard':
      case 'theory-hub':
      case 'progress-dashboard':
      case 'settings':
        return currentScreen.screen;
      case 'lesson':
      case 'lesson-drill':
      case 'capstone':
        return 'learn-hub';
      case 'scale-practice':
      case 'interval-trainer':
      case 'theory-quiz':
        return currentScreen.returnTo ? 'learn-hub' : 'theory-hub';
      case 'keyboard-setup':
        return typeof currentScreen.returnTo === 'string' && currentScreen.returnTo !== 'setup'
          ? currentScreen.returnTo
          : undefined;
      case 'game':
      case 'results':
        return 'library';
      case 'setup':
        return undefined;
    }
  };

  let screenContent: JSX.Element;
  switch (currentScreen.screen) {
    case 'setup':
      screenContent = (
        <SetupGuideScreen
          handSize={handSize}
          reminderFrequency={postureReminderMinutes !== null ? String(postureReminderMinutes) : 'off'}
          onHandSizeChange={setHandSize}
          onReminderFrequencyChange={(value) => {
            const parsed = Number(value);
            setPostureReminderMinutes(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
          }}
          onOpenKeyboardSetup={() => setCurrentScreen({ screen: 'keyboard-setup', returnTo: 'setup' })}
          onSkip={async () => {
            await persistSetupState(true);
            setCurrentScreen({ screen: 'main-menu' });
          }}
          onStartPractice={async () => {
            await persistSetupState(true);
            setCurrentScreen({ screen: 'main-menu' });
          }}
        />
      );
      break;

    case 'main-menu':
      screenContent = (
        <MainMenuScreen
          onOpenLibrary={() => setCurrentScreen({ screen: 'library' })}
          onOpenLearn={() => setCurrentScreen({ screen: 'learn-hub' })}
          onOpenFreePlay={() => setCurrentScreen({ screen: 'free-play' })}
          onOpenSoundboard={() => setCurrentScreen({ screen: 'soundboard' })}
          onOpenTheory={() => setCurrentScreen({ screen: 'theory-hub' })}
          onOpenProgress={() => setCurrentScreen({ screen: 'progress-dashboard' })}
          onOpenSettings={() => setCurrentScreen({ screen: 'settings' })}
          onOpenSetup={() => setCurrentScreen({ screen: 'setup' })}
          onStartSong={(song) => startSongSession(song, 'luma-keys')}
        />
      );
      break;

    case 'library':
      screenContent = (
        <LibraryScreen
          audioEngine={audioEngineRef.current}
          onStartTheoryPractice={() => setCurrentScreen({ screen: 'theory-hub' })}
          onStartSession={(song, mode) => startSongSession(song, mode)}
          onStartPlaylistQueue={startPlaylistQueue}
        />
      );
      break;

    case 'learn-hub':
      screenContent = (
        <LearnHubScreen
          tiers={CURRICULUM}
          progress={learningProgress}
          onOpenLesson={(lessonId) => navigateToLesson(lessonId)}
          onToggleGating={(enabled) => void updateLearningProgressState((current) => setLearningGating(current, enabled))}
          onStartCapstone={(tierId) => void startCapstone(tierId)}
        />
      );
      break;

    case 'lesson': {
      const lesson = getLessonById(currentScreen.lessonId);
      const tier = getTierByLessonId(currentScreen.lessonId);
      screenContent = lesson && tier ? (
        <LessonScreen
          lesson={lesson}
          tier={tier}
          curriculum={CURRICULUM}
          progress={learningProgress}
          initialStepIndex={currentScreen.stepIndex}
          lastAttempt={currentScreen.lastAttempt}
          onBack={() => setCurrentScreen({ screen: 'learn-hub' })}
          onOpenLesson={(lessonId) => navigateToLesson(lessonId)}
          onStartDrill={startLessonDrill}
          onStartScale={(lessonId, stepIndex, preset) =>
            setCurrentScreen({ screen: 'scale-practice', preset, returnTo: { lessonId, stepIndex } })
          }
          onStartInterval={(lessonId, stepIndex, preset) =>
            setCurrentScreen({ screen: 'interval-trainer', preset, returnTo: { lessonId, stepIndex } })
          }
          onStartQuiz={(lessonId, stepIndex, preset) =>
            setCurrentScreen({ screen: 'theory-quiz', preset, returnTo: { lessonId, stepIndex } })
          }
          onCompleteStep={handleCompleteLessonStep}
          onCompleteLesson={handleCompleteLesson}
        />
      ) : (
        <main className="app-shell lesson-screen">
          <section className="panel lesson-empty-state">
            <p className="eyebrow">Learn Hub</p>
            <h1>Lesson not found</h1>
            <button className="secondary-button" onClick={() => setCurrentScreen({ screen: 'learn-hub' })}>
              Back to Learn
            </button>
          </section>
        </main>
      );
      break;
    }

    case 'free-play':
      screenContent = (
        <FreePlayScreen
          audioEngine={audioEngineRef.current}
          inputMode={inputMode}
          keyboardInputService={keyboardServiceRef.current}
          midiInputService={midiServiceRef.current}
          keyboardOverlaySize={keyboardOverlaySize}
          postureReminderMinutes={postureReminderMinutes}
          breakReminderMinutes={breakReminderMinutes}
          pitchBendEnabled={pitchBendEnabled}
          stagePalette={stagePalette}
          instrumentId={instrumentId}
          instrumentSamplePackStatuses={instrumentSamplePackStatuses}
          unlockedRewardIds={unlockedRewardIds}
          onInstrumentChange={persistInstrumentId}
          onStagePaletteChange={persistStagePalette}
          onBackToMainMenu={() => setCurrentScreen({ screen: 'main-menu' })}
          onOpenKeyboardSetup={() => setCurrentScreen({ screen: 'keyboard-setup', returnTo: 'free-play' })}
          hudNavigationItems={buildImmersiveHudNavigation()}
          hudCurrentDestination="free-play"
        />
      );
      break;

    case 'soundboard':
      screenContent = (
        <NoveltySoundboardScreen
          audioEngine={audioEngineRef.current}
          inputMode={inputMode}
          keyboardInputService={keyboardServiceRef.current}
          midiInputService={midiServiceRef.current}
          keyboardOverlaySize={keyboardOverlaySize}
          onBackToMainMenu={() => setCurrentScreen({ screen: 'main-menu' })}
          onOpenKeyboardSetup={() => setCurrentScreen({ screen: 'keyboard-setup', returnTo: 'soundboard' })}
          hudNavigationItems={buildImmersiveHudNavigation()}
          hudCurrentDestination="soundboard"
        />
      );
      break;

    case 'theory-hub':
      screenContent = (
        <TheoryHubScreen
          onStartIntervalTrainer={(preset) => setCurrentScreen({ screen: 'interval-trainer', preset })}
          onStartQuiz={(preset) => setCurrentScreen({ screen: 'theory-quiz', preset })}
          onStartScalePractice={(preset) => setCurrentScreen({ screen: 'scale-practice', preset })}
        />
      );
      break;

    case 'progress-dashboard':
      screenContent = (
        <ProgressDashboardScreen
          unlockedRewardIds={unlockedRewardIds}
          onOpenLibrary={() => setCurrentScreen({ screen: 'library' })}
          onStartTopSong={(songId) => {
            void window.appBridge?.getSong(songId).then((song) => {
              if (song) {
                startSongSession(song, 'luma-keys');
              }
            });
          }}
          onPracticeTroubleSpot={(songId, loopRange) => {
            void window.appBridge?.getSong(songId).then((song) => {
              if (song) {
                startSongSession(song, 'learning', loopRange);
              }
            });
          }}
        />
      );
      break;

    case 'settings':
      screenContent = (
        <SettingsScreen
          audioEngine={audioEngineRef.current}
          inputMode={inputMode}
          midiDevices={midiDevices}
          midiError={midiError}
          instrumentSamplePackStatuses={instrumentSamplePackStatuses}
          unlockedRewardIds={unlockedRewardIds}
          pitchBendEnabled={pitchBendEnabled}
          onInstallInstrumentSamplePack={installInstrumentSamplePack}
          onRemoveInstrumentSamplePack={removeInstrumentSamplePack}
          onDeveloperUnlockAll={handleDeveloperUnlockAll}
          onSettingChange={applySettingChange}
          onLearningProgressReset={handleLearningProgressReset}
          onInputModeChange={persistInputMode}
          onRetryMidi={retryMidiInit}
          onUserDataReset={handleUserDataReset}
          onOpenKeyboardSetup={() => setCurrentScreen({ screen: 'keyboard-setup', returnTo: 'settings' })}
        />
      );
      break;

    case 'scale-practice':
      screenContent = (
        <ScalePracticeScreen
          audioEngine={audioEngineRef.current}
          inputMode={inputMode}
          keyboardInputService={keyboardServiceRef.current}
          midiInputService={midiServiceRef.current}
          onAchievementsUnlocked={enqueueAchievementToasts}
          onSessionComplete={(payload) => {
            if (currentScreen.returnTo) {
              handleLearningSessionResult(currentScreen.returnTo.lessonId, currentScreen.returnTo.stepIndex, payload.accuracy);
            }
          }}
          onBack={handleBackNavigation}
          preset={currentScreen.preset}
        />
      );
      break;

    case 'interval-trainer':
      screenContent = (
        <IntervalTrainerScreen
          audioEngine={audioEngineRef.current}
          onAchievementsUnlocked={enqueueAchievementToasts}
          onSessionComplete={(payload) => {
            if (currentScreen.returnTo) {
              handleLearningSessionResult(currentScreen.returnTo.lessonId, currentScreen.returnTo.stepIndex, payload.accuracy);
            }
          }}
          onBack={handleBackNavigation}
          preset={currentScreen.preset}
        />
      );
      break;

    case 'theory-quiz':
      screenContent = (
        <TheoryQuizScreen
          audioEngine={audioEngineRef.current}
          onAchievementsUnlocked={enqueueAchievementToasts}
          onSessionComplete={(payload) => {
            if (currentScreen.returnTo) {
              handleLearningSessionResult(currentScreen.returnTo.lessonId, currentScreen.returnTo.stepIndex, payload.accuracy);
            }
          }}
          onBack={handleBackNavigation}
          preset={currentScreen.preset}
        />
      );
      break;

    case 'keyboard-setup':
      screenContent = (
        <KeyboardSetupScreen
          inputMode={inputMode}
          keyboardInputService={keyboardServiceRef.current}
          onInputModeChange={persistInputMode}
        />
      );
      break;

    case 'game':
      screenContent = (
        <GameScreen
          audioEngine={audioEngineRef.current}
          inputMode={inputMode}
          keyboardInputService={keyboardServiceRef.current}
          midiInputService={midiServiceRef.current}
          source={gameSource!}
          initialSessionConfig={currentScreen.sessionConfig}
          colorBlindMode={colorBlindMode}
          noteLabels={noteLabels}
          noteLabelSize={noteLabelSize}
          keyboardOverlaySize={keyboardOverlaySize}
          breakReminderMinutes={breakReminderMinutes}
          pitchBendEnabled={pitchBendEnabled}
          instrumentId={instrumentId}
          instrumentSamplePackStatuses={instrumentSamplePackStatuses}
          unlockedRewardIds={unlockedRewardIds}
          onInstrumentChange={persistInstrumentId}
          onExit={() => setCurrentScreen({ screen: 'main-menu' })}
          onGameFinished={handleGameFinished}
          onOpenKeyboardSetup={() => setCurrentScreen({ screen: 'keyboard-setup', returnTo: 'library' })}
          hudNavigationItems={buildImmersiveHudNavigation()}
          hudCurrentDestination="library"
        />
      );
      break;

    case 'lesson-drill':
      screenContent = (
        <GameScreen
          audioEngine={audioEngineRef.current}
          inputMode={inputMode}
          keyboardInputService={keyboardServiceRef.current}
          midiInputService={midiServiceRef.current}
          source={gameSource!}
          initialSessionConfig={currentScreen.sessionConfig}
          colorBlindMode={colorBlindMode}
          noteLabels={noteLabels}
          noteLabelSize={noteLabelSize}
          keyboardOverlaySize={keyboardOverlaySize}
          breakReminderMinutes={breakReminderMinutes}
          pitchBendEnabled={pitchBendEnabled}
          instrumentId={instrumentId}
          instrumentSamplePackStatuses={instrumentSamplePackStatuses}
          unlockedRewardIds={unlockedRewardIds}
          onInstrumentChange={persistInstrumentId}
          onExit={() => navigateToLesson(currentScreen.lessonId, currentScreen.stepIndex)}
          exitLabel="Back to Lesson"
          onGameFinished={handleGameFinished}
          onLessonDrillFinished={(payload) => handleLearningSessionResult(payload.lessonId, payload.stepIndex, payload.result.accuracy)}
          onOpenKeyboardSetup={() =>
            setCurrentScreen({
              screen: 'keyboard-setup',
              returnTo: { lessonId: currentScreen.lessonId, stepIndex: currentScreen.stepIndex },
            })
          }
          hudNavigationItems={buildImmersiveHudNavigation()}
          hudCurrentDestination="learn-hub"
        />
      );
      break;

    case 'capstone': {
      const capstoneTierId = currentScreen.tierId;
      screenContent = (
        <GameScreen
          audioEngine={audioEngineRef.current}
          inputMode={inputMode}
          keyboardInputService={keyboardServiceRef.current}
          midiInputService={midiServiceRef.current}
          source={gameSource!}
          initialSessionConfig={currentScreen.sessionConfig}
          colorBlindMode={colorBlindMode}
          noteLabels={noteLabels}
          noteLabelSize={noteLabelSize}
          keyboardOverlaySize={keyboardOverlaySize}
          breakReminderMinutes={breakReminderMinutes}
          pitchBendEnabled={pitchBendEnabled}
          instrumentId={instrumentId}
          instrumentSamplePackStatuses={instrumentSamplePackStatuses}
          unlockedRewardIds={unlockedRewardIds}
          onInstrumentChange={persistInstrumentId}
          onExit={() => setCurrentScreen({ screen: 'learn-hub' })}
          exitLabel="Back to Learn Hub"
          onGameFinished={handleGameFinished}
          onLessonDrillFinished={(payload) =>
            handleCapstoneFinished(capstoneTierId, payload.result.accuracy, payload.sessionConfig)}
          onOpenKeyboardSetup={() => setCurrentScreen({ screen: 'keyboard-setup', returnTo: 'learn-hub' })}
          hudNavigationItems={buildImmersiveHudNavigation()}
          hudCurrentDestination="learn-hub"
        />
      );
      break;
    }

    case 'results':
      screenContent = (
        <ResultsScreen
          baselineStats={currentScreen.baselineStats}
          result={currentScreen.result}
          sessionConfig={currentScreen.sessionConfig}
          song={currentScreen.song}
          unlockedRewardIds={unlockedRewardIds}
          onAchievementsUnlocked={enqueueAchievementToasts}
          onDailyGoalReached={handleDailyGoalReached}
          onSongGoalReached={handleSongGoalReached}
          onMainMenu={() => setCurrentScreen({ screen: 'main-menu' })}
          onPracticeSections={(loopRange) => startSongSession(currentScreen.song, 'learning', loopRange)}
          onStartTheoryPractice={handleStartTheoryPractice}
          onRetry={() =>
            startSongSession(
              currentScreen.song,
              currentScreen.sessionConfig.mode,
              null,
              currentScreen.playlistQueue,
            )
          }
          hasNextSong={resultsQueue ? resultsQueue.index < resultsQueue.songs.length - 1 : false}
          onNextSong={handleNextQueuedSong}
        />
      );
      break;
  }

  const showAppChrome =
    currentScreen.screen !== 'game' &&
    currentScreen.screen !== 'main-menu' &&
    currentScreen.screen !== 'free-play' &&
    currentScreen.screen !== 'soundboard' &&
    currentScreen.screen !== 'lesson-drill' &&
    currentScreen.screen !== 'capstone';
  const canNavigateBack = currentScreen.screen !== 'setup' && currentScreen.screen !== 'main-menu';
  const backLabel = getContextualBackLabel(currentScreen);
  const topbarNavigationItems = buildImmersiveHudNavigation();
  const currentHudDestination = getCurrentHudDestination();

  return (
    <>
      {showAppChrome ? (
        <div className="app-frame">
          <header className="app-topbar" aria-label="Application navigation">
            <div className="app-topbar-brand immersive-hud-item" aria-label="LumaKeys">
              <span>App</span>
              <strong>LumaKeys</strong>
            </div>
            <nav className="app-topbar-nav immersive-hud-nav" aria-label="Application navigation">
              {topbarNavigationItems.map((item) => {
                const isCurrent = item.key === currentHudDestination;
                return (
                  <button
                    key={item.key}
                    className={`immersive-hud-nav-btn${isCurrent ? ' active' : ''}`}
                    type="button"
                    title={item.title}
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={() => {
                      if (!isCurrent) {
                        item.onSelect();
                      }
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="app-topbar-actions immersive-hud-actions">
              {canNavigateBack ? (
                <button className="immersive-hud-nav-btn chrome-back-button" onClick={handleBackNavigation}>
                  {backLabel}
                </button>
              ) : (
                <div className="app-topbar-spacer" aria-hidden="true" />
              )}
            </div>
          </header>
          {screenContent}
        </div>
      ) : (
        screenContent
      )}
      {startupError && (
        <aside className="achievement-toast achievement-toast--goal achievement-toast--plain" role="status" aria-live="polite">
          <div>
            <p className="eyebrow">Startup Defaults Active</p>
            <strong>{startupError}</strong>
          </div>
          <button className="secondary-button" onClick={() => setStartupError(null)}>
            Dismiss
          </button>
        </aside>
      )}
      {showDailyGoalToast && (
        <aside className="achievement-toast achievement-toast--goal" role="status" aria-live="polite">
          <div className="achievement-toast-icon">🎯</div>
          <div>
            <p className="eyebrow">Daily Goal Reached</p>
            <strong>Practice complete for today!</strong>
            <p className="panel-copy">Keep it up — consistency is the key to progress.</p>
          </div>
          <button className="secondary-button" onClick={() => setShowDailyGoalToast(false)}>
            Dismiss
          </button>
        </aside>
      )}
      {showSongGoalToast && (
        <aside className="achievement-toast achievement-toast--goal achievement-toast--song-goal" role="status" aria-live="polite">
          <div className="achievement-toast-icon">🏆</div>
          <div>
            <p className="eyebrow">Song Goal Reached</p>
            <strong>Personal best — accuracy target cleared!</strong>
          </div>
          <button className="secondary-button" onClick={() => setShowSongGoalToast(false)}>
            Dismiss
          </button>
        </aside>
      )}
      <AchievementToast
        achievementId={achievementToastQueue[0] ?? null}
        onClose={() => setAchievementToastQueue((current) => current.slice(1))}
      />
      <ToastHost />
    </>
  );
}
