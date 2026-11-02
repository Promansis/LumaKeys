import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../../lib/audio/audioEngine';
import { GameSession } from '../../lib/game/GameSession';
import { getBeatAtSongTime } from '../../lib/game/beatClock';
import { ComputerKeyboardInputService } from '../../lib/input/computerKeyboardInputService';
import { HeldNoteTracker } from '../../lib/input/heldNotes';
import type { InputEvent, InputMode } from '../../lib/input/types';
import {
  applyTrackAssignments,
  filterSongByHand,
  getLoopRangeSeconds,
  getMeasureCount,
  getTrackAssignments,
  setTrackAssignment,
} from '../../lib/game/songUtils';
import type {
  ParsedSong,
  PlaybackSnapshot,
  SessionConfig,
  SessionMode,
  TrackAssignment,
} from '../../lib/game/types';
import { parseMidiFile } from '../../lib/midi/midiFileParser';
import { MidiInputService } from '../../lib/midi/midiInputService';
import type { MidiInputDevice } from '../../lib/midi/types';
import type { DetectedKey } from '../../lib/theory/keyDetection';
import { detectKey } from '../../lib/theory/keyDetection';
import { detectChord } from '../../lib/theory/chords';
import { KeySignatureBadge } from './KeySignatureBadge';
import type { FingeringRow, SongRow, UserStatsRow } from '../../shared/dbTypes';
import type { InstrumentSamplePackStatus } from '../../shared/ipc';
import { ControlBar } from './ControlBar';
import { FingeringEditor } from './FingeringEditor';
import { FallingNotesCanvas } from './FallingNotesCanvas';
import { ImmersiveHud, type ImmersiveHudDestination, type ImmersiveHudNavigationItem } from './ImmersiveHud';
import { ImmersiveInstrumentControl } from './ImmersiveInstrumentControl';
import { PianoKeyboard } from './PianoKeyboard';
import { TrackAssignmentPanel } from './TrackAssignmentPanel';
import { useModalFocusTrap } from '../useModalFocusTrap';
import { saveSetting } from '../saveSetting';

const EMPTY_SNAPSHOT: PlaybackSnapshot = {
  isPlaying: false,
  currentTimeSec: 0,
  durationSec: 0,
  combo: 0,
  hitLineRatio: 0.86,
  visibleNotes: [],
  activeInputNotes: [],
  upcomingNotes: [],
  score: {
    totalScore: 0,
    combo: 0,
    maxCombo: 0,
    comboMultiplier: 1,
    accuracy: 100,
    perfectCount: 0,
    goodCount: 0,
    okCount: 0,
    missCount: 0,
    totalNotes: 0,
    judgedNotes: 0,
    measureAccuracy: [],
  },
};

interface FinishedGamePayload {
  result: ReturnType<GameSession['getFinalResult']>;
  song: SongRow;
  sessionConfig: SessionConfig;
  baselineStats: UserStatsRow | null;
  playlistQueue: { songs: SongRow[]; index: number } | null;
}

interface LessonDrillFinishedPayload {
  lessonId: string;
  stepIndex: number;
  result: ReturnType<GameSession['getFinalResult']>;
  sessionConfig: SessionConfig;
}

type GameScreenSource =
  | { kind: 'library-song'; song: SongRow; playlistQueue: { songs: SongRow[]; index: number } | null }
  | { kind: 'lesson-drill'; lessonId: string; stepIndex: number; parsedSong: ParsedSong; isRhythmClapping?: boolean };

interface GameScreenProps {
  audioEngine: AudioEngine;
  inputMode: InputMode;
  keyboardInputService: ComputerKeyboardInputService;
  midiInputService: MidiInputService;
  source: GameScreenSource;
  initialSessionConfig: SessionConfig;
  colorBlindMode: boolean;
  noteLabels: 'alphabetic' | 'symbols' | 'both' | 'none';
  noteLabelSize?: 'small' | 'medium' | 'large';
  keyboardOverlaySize: 'small' | 'medium' | 'large';
  breakReminderMinutes: number | null;
  pitchBendEnabled: boolean;
  instrumentId: string;
  instrumentSamplePackStatuses?: Record<string, InstrumentSamplePackStatus>;
  unlockedRewardIds?: Set<string>;
  onGameFinished: (payload: FinishedGamePayload) => void;
  onLessonDrillFinished?: (payload: LessonDrillFinishedPayload) => void;
  onInstrumentChange: (instrumentId: string) => void;
  onExit: () => void;
  exitLabel?: string;
  onOpenKeyboardSetup: () => void;
  hudNavigationItems?: ImmersiveHudNavigationItem[];
  hudCurrentDestination?: ImmersiveHudDestination;
}

function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}

function composeSessionSong(sourceSong: ParsedSong, sessionConfig: SessionConfig): ParsedSong {
  return filterSongByHand(sourceSong, sessionConfig.handFilter);
}

function shouldAutoplayMode(mode: SessionMode): boolean {
  return mode === 'luma-keys' || mode === 'performance';
}

function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
      (element.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)),
  );
}

function loopStartForSong(song: ParsedSong | null, sessionConfig: SessionConfig): number {
  if (!song) {
    return 0;
  }
  return getLoopRangeSeconds(song, sessionConfig.loopRange).startSec;
}

function loopEndForSong(song: ParsedSong | null, sessionConfig: SessionConfig): number | undefined {
  if (!song || !sessionConfig.loopRange) {
    return undefined;
  }
  return getLoopRangeSeconds(song, sessionConfig.loopRange).endSec;
}

function buildTempSong(title: string): SongRow {
  return {
    id: `temp-${crypto.randomUUID()}`,
    title,
    artist: '',
    genre: '',
    filePath: '',
    difficulty: 1,
    durationSec: 0,
    bpm: 120,
    noteCount: 0,
    dateAdded: new Date().toISOString(),
    timesPlayed: 0,
    tags: [],
    isFavorite: false,
    folderId: null,
    trackAssignments: {},
  };
}

function buildLessonSong(parsedSong: ParsedSong, lessonId: string, stepIndex: number): SongRow {
  return {
    id: `lesson-${lessonId}-${stepIndex}`,
    title: parsedSong.title,
    artist: '',
    genre: 'Lesson Drill',
    filePath: '',
    difficulty: 1,
    durationSec: parsedSong.durationSec,
    bpm: parsedSong.bpm,
    noteCount: parsedSong.notes.length,
    dateAdded: new Date().toISOString(),
    timesPlayed: 0,
    tags: ['lesson-drill'],
    isFavorite: false,
    folderId: null,
    trackAssignments: {},
  };
}

interface SessionToolbarProps {
  sessionConfig: SessionConfig;
  totalMeasures: number;
  canEditFingering: boolean;
  isEditingFingering: boolean;
  onRebuild: (next: SessionConfig) => void;
  onHandSizeChange: (value: SessionConfig['handSize']) => void;
  onFingeringDisplayModeChange: (value: SessionConfig['fingeringDisplayMode']) => void;
  onToggleFingeringEditor: () => void;
  onResetFingerings: () => void;
}

function SessionToolbar({
  sessionConfig,
  totalMeasures,
  canEditFingering,
  isEditingFingering,
  onRebuild,
  onHandSizeChange,
  onFingeringDisplayModeChange,
  onToggleFingeringEditor,
  onResetFingerings,
}: SessionToolbarProps) {
  const [loopStart, setLoopStart] = useState(sessionConfig.loopRange ? sessionConfig.loopRange.startMeasure + 1 : 1);
  const [loopEnd, setLoopEnd] = useState(
    sessionConfig.loopRange ? sessionConfig.loopRange.endMeasure + 1 : Math.max(1, totalMeasures),
  );

  const handleSetLoop = () => {
    const startMeasure = Math.max(1, Math.min(loopStart, totalMeasures)) - 1;
    const endMeasure = Math.max(startMeasure, Math.min(loopEnd, totalMeasures) - 1);
    onRebuild({ ...sessionConfig, loopRange: { startMeasure, endMeasure } });
  };

  return (
    <section className="panel session-toolbar">
      <div className="session-chip-group">
        <button
          className={sessionConfig.mode === 'luma-keys' ? 'primary-button' : 'secondary-button'}
          onClick={() => onRebuild({ ...sessionConfig, mode: 'luma-keys', waitForInput: false })}
        >
          LumaKeys
        </button>
        <button
          className={sessionConfig.mode === 'learning' ? 'primary-button' : 'secondary-button'}
          onClick={() => onRebuild({ ...sessionConfig, mode: 'learning', waitForInput: true })}
        >
          Learning
        </button>
        <button
          className={sessionConfig.mode === 'performance' ? 'primary-button' : 'secondary-button'}
          onClick={() => onRebuild({ ...sessionConfig, mode: 'performance', waitForInput: false })}
        >
          Performance
        </button>
      </div>

      <div className="session-chip-group">
        {(['both', 'left', 'right'] as const).map((handFilter) => (
          <button
            key={handFilter}
            className={sessionConfig.handFilter === handFilter ? 'primary-button' : 'secondary-button'}
            onClick={() => onRebuild({ ...sessionConfig, handFilter })}
          >
            {handFilter === 'both' ? 'Both Hands' : `${handFilter[0].toUpperCase()}${handFilter.slice(1)} Hand`}
          </button>
        ))}
      </div>

      <div className="session-chip-group loop-picker">
        {sessionConfig.loopRange ? (
          <>
            <span className="loop-label">
              Looping measures {sessionConfig.loopRange!.startMeasure + 1}-{sessionConfig.loopRange!.endMeasure + 1}
            </span>
            <button
              className="secondary-button"
              onClick={() => onRebuild({ ...sessionConfig, loopRange: null })}
            >
              Clear Loop
            </button>
          </>
        ) : (
          <>
            <label className="loop-measure-label">
              Loop
              <input
                className="loop-measure-input"
                type="number"
                min={1}
                max={totalMeasures || 1}
                value={loopStart}
                onChange={(e) => setLoopStart(Number(e.target.value))}
                aria-label="Loop start measure"
              />
              <span>-</span>
              <input
                className="loop-measure-input"
                type="number"
                min={1}
                max={totalMeasures || 1}
                value={loopEnd}
                onChange={(e) => setLoopEnd(Number(e.target.value))}
                aria-label="Loop end measure"
              />
              {totalMeasures > 0 && <span className="loop-total">/ {totalMeasures}</span>}
            </label>
            <button className="secondary-button" onClick={handleSetLoop} disabled={totalMeasures === 0}>
              Set Loop
            </button>
          </>
        )}
      </div>

      <div className="session-chip-group">
        <label>
          <span>Hand Size</span>
          <select
            value={sessionConfig.handSize}
            onChange={(event) => onHandSizeChange(event.target.value as SessionConfig['handSize'])}
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </select>
        </label>
        <label>
          <span>Fingering</span>
          <select
            value={sessionConfig.fingeringDisplayMode}
            onChange={(event) =>
              onFingeringDisplayModeChange(event.target.value as SessionConfig['fingeringDisplayMode'])
            }
          >
            <option value="always">Always</option>
            <option value="learning-only">Learning Only</option>
            <option value="never">Never</option>
          </select>
        </label>
        <button className={isEditingFingering ? 'primary-button' : 'secondary-button'} onClick={onToggleFingeringEditor}>
          Edit Fingering
        </button>
        <button className="secondary-button" onClick={onResetFingerings} disabled={!canEditFingering}>
          Reset to Auto
        </button>
      </div>
    </section>
  );
}

export function GameScreen({
  audioEngine,
  inputMode,
  keyboardInputService,
  midiInputService,
  source,
  initialSessionConfig,
  colorBlindMode,
  noteLabels,
  noteLabelSize = 'medium',
  keyboardOverlaySize,
  breakReminderMinutes,
  pitchBendEnabled,
  instrumentId,
  instrumentSamplePackStatuses,
  unlockedRewardIds,
  onGameFinished,
  onLessonDrillFinished,
  onInstrumentChange,
  onExit,
  exitLabel,
  onOpenKeyboardSetup,
  hudNavigationItems = [],
  hudCurrentDestination,
}: GameScreenProps) {
  const initialSong = useMemo(
    () => source.kind === 'library-song'
      ? source.song
      : buildLessonSong(source.parsedSong, source.lessonId, source.stepIndex),
    // `source` is stable for the lifetime of the screen — it comes from the
    // discriminated-union AppScreen and only changes when App remounts GameScreen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [source],
  );
  const playlistQueue = source.kind === 'library-song' ? source.playlistQueue : null;
  const gameSessionRef = useRef<GameSession | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevPlayingRef = useRef(false);
  const songEndedRef = useRef(false);
  const currentSongRef = useRef(initialSong);
  const baselineStatsRef = useRef<UserStatsRow | null>(null);
  const countdownCancelRef = useRef(false);
  const metronomeLastBeatRef = useRef<number | null>(null);
  const rhythmClapTimeoutsRef = useRef<number[]>([]);

  const [sourceSong, setSourceSong] = useState<ParsedSong | null>(null);
  const [sessionSong, setSessionSong] = useState<ParsedSong | null>(null);
  const [sessionConfig, setSessionConfig] = useState(initialSessionConfig);
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot>(EMPTY_SNAPSHOT);
  const [devices, setDevices] = useState<MidiInputDevice[]>([]);
  const [statusMessage, setStatusMessage] = useState('Loading song from the library.');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [reminderFrequencyMinutes, setReminderFrequencyMinutes] = useState<number | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const [showBreakReminder, setShowBreakReminder] = useState(false);
  const [customFingerings, setCustomFingerings] = useState<FingeringRow[]>([]);
  const [keyboardOctaveShift, setKeyboardOctaveShift] = useState(keyboardInputService.getState().octaveShift);
  const [chordLabel, setChordLabel] = useState<string | null>(null);
  const [detectedKey, setDetectedKey] = useState<DetectedKey | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [countdownValue, setCountdownValue] = useState<number | null>(null);
  const [isEditingFingering, setIsEditingFingering] = useState(false);
  const [selectedFingeringNoteId, setSelectedFingeringNoteId] = useState<string | null>(null);
  const [fingeringEditorState, setFingeringEditorState] = useState<{
    noteId: string;
    scheduledIndex: number;
    label: string;
    hand: 'left' | 'right';
    finger?: number;
    anchorPoint: { x: number; y: number };
  } | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useModalFocusTrap({
    open: overlayVisible,
    dialogRef: overlayRef,
    triggerRef: menuButtonRef,
    onEscape: () => setOverlayVisible(false),
  });

  useEffect(() => {
    setSessionConfig(initialSessionConfig);
  }, [initialSessionConfig]);

  useEffect(() => {
    if (!isEditingFingering) {
      setFingeringEditorState(null);
      setSelectedFingeringNoteId(null);
    }
  }, [isEditingFingering]);

  useEffect(() => {
    const shouldHandleEvent = (event: InputEvent): boolean => {
      if (inputMode === 'both') {
        return true;
      }
      if (inputMode === 'midi') {
        return event.source === 'midi';
      }
      return event.source === 'computer-keyboard';
    };

    const heldNotes = new HeldNoteTracker();

    const handleInputEvent = async (event: InputEvent) => {
      if (!shouldHandleEvent(event)) {
        return;
      }

      const game = gameSessionRef.current;
      if (!game) {
        return;
      }

      if (event.type === 'pitchbend') {
        if (pitchBendEnabled) {
          audioEngine.setPitchBend(event.pitchBendValue ?? 0);
        }
        return;
      }
      if (event.type === 'modulation') {
        audioEngine.setModulation(event.modulationValue ?? 0);
        return;
      }
      if (event.type === 'aftertouch') {
        return;
      }
      game.ingestInputEvent(event);
      if (event.type === 'noteon' && typeof event.note === 'number') {
        const change = heldNotes.press(event.note, event.sourceId);
        if (change.shouldStartAudio) {
          await audioEngine.noteOn(event.note, event.velocity ?? 0.8);
        }
      }
      if (event.type === 'noteoff' && typeof event.note === 'number') {
        const change = heldNotes.release(event.note, event.sourceId);
        if (change.shouldStopAudio) {
          audioEngine.noteOff(event.note);
        }
      }
      if (event.type === 'sustain') {
        audioEngine.setSustain((event.sustainValue ?? 0) >= 64);
      }
    };

    const unsubscribeDevices = midiInputService.subscribeDevices((nextDevices) => {
      setDevices(nextDevices);
    });
    const unsubscribeMidi = midiInputService.subscribe((event) => {
      void handleInputEvent(event);
    });
    const unsubscribeKeyboard = keyboardInputService.subscribe((event) => {
      void handleInputEvent(event);
    });
    const unsubscribeKeyboardState = keyboardInputService.subscribeState((state) => {
      setKeyboardOctaveShift(state.octaveShift);
    });

    return () => {
      unsubscribeDevices();
      unsubscribeMidi();
      unsubscribeKeyboard();
      unsubscribeKeyboardState();
      heldNotes.clear();
      audioEngine.setSustain(false);
      audioEngine.setPitchBend(0);
      audioEngine.allNotesOff();
    };
  }, [audioEngine, inputMode, keyboardInputService, midiInputService, pitchBendEnabled]);

  useEffect(() => {
    const frame = () => {
      const game = gameSessionRef.current;
      if (game) {
        const nextSnapshot = game.getSnapshot(performance.now());
        const activeSong = currentSongRef.current;

        if (
          !songEndedRef.current &&
          prevPlayingRef.current &&
          !nextSnapshot.isPlaying &&
          !game.getSessionConfig().loopRange &&
          nextSnapshot.currentTimeSec >= game.getSong().durationSec &&
          game.getSong().durationSec > 0
        ) {
          songEndedRef.current = true;
          const result = game.getFinalResult();
          if (source.kind === 'lesson-drill') {
            onLessonDrillFinished?.({
              lessonId: source.lessonId,
              stepIndex: source.stepIndex,
              result,
              sessionConfig: game.getSessionConfig(),
            });
          } else {
            onGameFinished({
              result,
              song: activeSong,
              sessionConfig: game.getSessionConfig(),
              baselineStats: baselineStatsRef.current,
              playlistQueue,
            });
          }
        }

        prevPlayingRef.current = nextSnapshot.isPlaying;
        startTransition(() => {
          setSnapshot(nextSnapshot);
        });
      }
      rafRef.current = window.requestAnimationFrame(frame);
    };

    rafRef.current = window.requestAnimationFrame(frame);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
      audioEngine.pauseSong();
    };
  }, [audioEngine, onGameFinished, onLessonDrillFinished, playlistQueue, source]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setChordLabel(detectChord(snapshot.activeInputNotes)?.label ?? null);
    }, 50);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [snapshot.activeInputNotes]);

  useEffect(() => {
    return () => {
      rhythmClapTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      rhythmClapTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    metronomeLastBeatRef.current = null;

    if (!sessionConfig.metronomeEnabled || !sessionSong) {
      return;
    }

    const interval = window.setInterval(() => {
      const game = gameSessionRef.current;
      if (!game || !game.isTransportPlaying()) {
        metronomeLastBeatRef.current = null;
        return;
      }

      const now = performance.now();
      // Song time already runs at the practice tempo, so the helper takes it as is.
      const { beatIndex, isDownbeat } = getBeatAtSongTime(sessionSong, game.getCurrentTimeSec(now));

      if (metronomeLastBeatRef.current === null) {
        metronomeLastBeatRef.current = beatIndex;
        return;
      }

      if (beatIndex < metronomeLastBeatRef.current) {
        metronomeLastBeatRef.current = beatIndex;
        return;
      }

      if (beatIndex > metronomeLastBeatRef.current) {
        metronomeLastBeatRef.current = beatIndex;
        void audioEngine.playMetronomeClick(isDownbeat);
      }
    }, 25);

    return () => {
      window.clearInterval(interval);
      metronomeLastBeatRef.current = null;
    };
  }, [audioEngine, sessionConfig.metronomeEnabled, sessionSong]);

  useEffect(() => {
    const loadSelectedSong = async () => {
      const bridge = window.appBridge;
      try {
        if (!bridge) {
          throw new Error('The app bridge is unavailable.');
        }

        setLoadError(null);
        setStatusMessage('Loading song from the library.');
        currentSongRef.current = initialSong;
        const [reminderValue, handSizeValue, displayModeValue] = await Promise.all([
          bridge.getSetting('practice', 'postureReminderMinutes'),
          bridge.getSetting('fingering', 'handSize'),
          bridge.getSetting('fingering', 'displayMode'),
        ]);

        let baselineStats: UserStatsRow | null = null;
        let fingerings: FingeringRow[] = [];
        if (source.kind === 'library-song') {
          [baselineStats, fingerings] = await Promise.all([
            bridge.getUserStats(initialSong.id),
            bridge.getCustomFingerings(initialSong.id),
          ]);
        }

        baselineStatsRef.current = baselineStats;
        setReminderFrequencyMinutes(reminderValue && reminderValue !== 'off' ? Number(reminderValue) || null : null);
        setCustomFingerings(fingerings);
        setIsEditingFingering(false);
        setFingeringEditorState(null);
        setSelectedFingeringNoteId(null);

        const nextSessionConfig: SessionConfig = {
          ...initialSessionConfig,
          handSize:
            handSizeValue === 'small' || handSizeValue === 'medium' || handSizeValue === 'large'
              ? handSizeValue
              : initialSessionConfig.handSize,
          fingeringDisplayMode:
            displayModeValue === 'always' ||
            displayModeValue === 'learning-only' ||
            displayModeValue === 'never'
              ? displayModeValue
              : initialSessionConfig.fingeringDisplayMode,
        };
        setSessionConfig(nextSessionConfig);

        if (source.kind === 'lesson-drill') {
          setDetectedKey(detectKey(source.parsedSong.notes));
          await mountSession(source.parsedSong, nextSessionConfig, []);
          setStatusMessage(`Loaded ${source.parsedSong.title} lesson drill with ${source.parsedSong.notes.length} notes.`);
          return;
        }

        const bytes = await bridge.loadMidiFileData(initialSong.id);
        await loadSongFromBytes(toArrayBuffer(bytes), initialSong, nextSessionConfig, fingerings);
      } catch (error) {
        const message = `Unable to load song: ${(error as Error).message}`;
        gameSessionRef.current = null;
        setSessionSong(null);
        setSourceSong(null);
        setLoadError(message);
        setStatusMessage(message);
      }
    };

    void loadSelectedSong();
  }, [initialSessionConfig, initialSong, loadAttempt, source]);

  useEffect(() => {
    if (!fingeringEditorState) {
      return;
    }

    const nextVisibleNote = snapshot.visibleNotes.find((note) => note.id === fingeringEditorState.noteId);
    if (!nextVisibleNote) {
      setSelectedFingeringNoteId(null);
      return;
    }

    setFingeringEditorState((current) =>
      current
        ? {
            ...current,
            finger: nextVisibleNote.finger,
            label: nextVisibleNote.label,
            hand: nextVisibleNote.hand,
          }
        : null,
    );
  }, [fingeringEditorState, snapshot.visibleNotes]);

  useEffect(() => {
    if (!reminderFrequencyMinutes) {
      return;
    }

    const interval = window.setInterval(() => {
      setShowReminder(true);
    }, reminderFrequencyMinutes * 60 * 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [reminderFrequencyMinutes]);

  useEffect(() => {
    if (!breakReminderMinutes) {
      return;
    }

    const interval = window.setInterval(() => {
      setShowBreakReminder(true);
    }, breakReminderMinutes * 60 * 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [breakReminderMinutes]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOverlayVisible((prev) => !prev);
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);


  const ensureAudioReady = async () => {
    try {
      await audioEngine.init();
    } catch (error) {
      setStatusMessage(`Audio failed to initialize: ${(error as Error).message}`);
    }
  };

  const playSessionAudio = async (songToPlay: ParsedSong, startSec: number, config: SessionConfig) => {
    await audioEngine.playSong(songToPlay, startSec, config.tempoMultiplier, loopEndForSong(songToPlay, config));
  };

  const mountSession = async (
    nextSourceSong: ParsedSong,
    nextSessionConfig: SessionConfig,
    nextCustomFingerings: FingeringRow[],
    options: { keepTime?: boolean; currentTimeSec?: number } = {},
  ) => {
    const filteredSong = composeSessionSong(nextSourceSong, nextSessionConfig);
    const nextGame = new GameSession(filteredSong, nextSessionConfig, nextCustomFingerings);
    const now = performance.now();
    if (options.keepTime && typeof options.currentTimeSec === 'number') {
      nextGame.seek(options.currentTimeSec, now);
    }

    gameSessionRef.current = nextGame;
    setSourceSong(nextSourceSong);
    setSessionSong(filteredSong);
    setSnapshot(nextGame.getSnapshot(now));
    songEndedRef.current = false;
    prevPlayingRef.current = false;
  };

  const loadSongFromBytes = async (
    arrayBuffer: ArrayBuffer,
    songRecord: SongRow,
    nextSessionConfig: SessionConfig,
    nextCustomFingerings: FingeringRow[],
  ) => {
    const parsedSong = parseMidiFile(arrayBuffer, {
      songId: songRecord.id,
      title: songRecord.title,
    });
    const hydratedSong = applyTrackAssignments(parsedSong, songRecord.trackAssignments);
    setDetectedKey(detectKey(hydratedSong.notes));
    currentSongRef.current = {
      ...songRecord,
      durationSec: hydratedSong.durationSec,
      bpm: hydratedSong.bpm,
      noteCount: hydratedSong.notes.length,
      trackAssignments: getTrackAssignments(hydratedSong),
    };
    await mountSession(hydratedSong, nextSessionConfig, nextCustomFingerings);
    setStatusMessage(
      `Loaded ${hydratedSong.title} with ${hydratedSong.notes.length} notes across ${hydratedSong.tracks.length} tracks.`,
    );
  };

  const rebuildForSessionConfig = async (nextSessionConfig: SessionConfig) => {
    const currentSourceSong = sourceSong;
    const previousGame = gameSessionRef.current;
    if (!currentSourceSong || !previousGame) {
      setSessionConfig(nextSessionConfig);
      return;
    }

    const now = performance.now();
    const score = previousGame.getSnapshot(now).score;
    const hasJudgedNotes = score.perfectCount + score.goodCount + score.okCount + score.missCount > 0;
    if (hasJudgedNotes && !window.confirm('Changing the session setup restarts this run. Continue?')) {
      return;
    }

    setSessionConfig(nextSessionConfig);
    audioEngine.pauseSong();
    await mountSession(currentSourceSong, nextSessionConfig, customFingerings);
    setStatusMessage('Session setup changed. This run restarted.');
  };

  const handlePickMidi = async () => {
    if (source.kind !== 'library-song') {
      return;
    }

    const picked = await window.appBridge?.pickMidiFile();
    if (!picked) {
      return;
    }

    const tempSong = buildTempSong(picked.name.replace(/\.(mid|midi)$/i, ''));
    currentSongRef.current = tempSong;
    baselineStatsRef.current = null;
    setCustomFingerings([]);
    await loadSongFromBytes(toArrayBuffer(picked.data), tempSong, sessionConfig, []);
    setStatusMessage('Loaded an unsaved MIDI file for this run. Results and fingerings will not be saved.');
  };

  const handleDroppedFile = async (file: File) => {
    if (source.kind !== 'library-song') {
      return;
    }

    const bytes = await file.arrayBuffer();
    const tempSong = buildTempSong(file.name.replace(/\.(mid|midi)$/i, ''));
    currentSongRef.current = tempSong;
    baselineStatsRef.current = null;
    setCustomFingerings([]);
    await loadSongFromBytes(bytes, tempSong, sessionConfig, []);
    setStatusMessage('Loaded an unsaved MIDI file for this run. Results and fingerings will not be saved.');
  };

  const runCountdown = async (song: ParsedSong, startSec: number, countdownConfig: SessionConfig) => {
    countdownCancelRef.current = false;
    await ensureAudioReady();

    for (const count of [3, 2, 1] as const) {
      if (countdownCancelRef.current) { setCountdownValue(null); return; }
      setCountdownValue(count);
      void audioEngine.playMetronomeClick(count === 1);
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    }

    const leadInBeats = countdownConfig.leadInBeats ?? 0;
    const beatMs = (60 / Math.max(song.bpm * countdownConfig.tempoMultiplier, 1)) * 1000;
    for (let beat = 0; beat < leadInBeats; beat += 1) {
      if (countdownCancelRef.current) { setCountdownValue(null); return; }
      void audioEngine.playMetronomeClick(false);
      await new Promise<void>((resolve) => setTimeout(resolve, beatMs));
    }

    if (countdownCancelRef.current) { setCountdownValue(null); return; }
    setCountdownValue(null);

    const game = gameSessionRef.current;
    if (!game) return;
    const now = performance.now();
    if (shouldAutoplayMode(countdownConfig.mode)) {
      await playSessionAudio(song, startSec, countdownConfig);
    }
    game.play(now);
    setStatusMessage(
      countdownConfig.mode === 'learning'
        ? 'Learning mode active. Progress pauses until the correct note is played.'
        : 'Playback running. Play along at the hit line.',
    );
  };

  const handlePlayPause = async () => {
    const currentSessionSong = sessionSong;
    const game = gameSessionRef.current;
    if (!currentSessionSong || !game) {
      return;
    }

    const now = performance.now();
    if (game.isTransportPlaying()) {
      countdownCancelRef.current = true;
      setCountdownValue(null);
      game.pause(now);
      audioEngine.pauseSong();
      setStatusMessage('Playback paused.');
      return;
    }

    if (countdownValue !== null) {
      countdownCancelRef.current = true;
      setCountdownValue(null);
      return;
    }

    if (game.getCurrentTimeSec(now) < 0.05) {
      void runCountdown(currentSessionSong, 0, sessionConfig);
      return;
    }

    await ensureAudioReady();
    if (shouldAutoplayMode(sessionConfig.mode)) {
      await playSessionAudio(currentSessionSong, game.getCurrentTimeSec(now), sessionConfig);
    }
    game.play(now);
    setStatusMessage(
      sessionConfig.mode === 'learning'
        ? 'Learning mode active. Progress pauses until the correct note is played.'
        : 'Playback running. Play along at the hit line.',
    );
  };

  const handleRestart = async () => {
    const currentSessionSong = sessionSong;
    const game = gameSessionRef.current;
    if (!currentSessionSong || !game) {
      return;
    }

    countdownCancelRef.current = true;
    setCountdownValue(null);
    songEndedRef.current = false;
    prevPlayingRef.current = false;
    const now = performance.now();
    const wasPlaying = game.isTransportPlaying();
    game.restart(now);
    if (wasPlaying && shouldAutoplayMode(sessionConfig.mode)) {
      await playSessionAudio(currentSessionSong, loopStartForSong(currentSessionSong, sessionConfig), sessionConfig);
      game.play(now);
    } else {
      audioEngine.pauseSong();
    }
  };

  const handleTempoChange = async (value: number) => {
    const game = gameSessionRef.current;
    const currentSessionSong = sessionSong;
    const nextSessionConfig = {
      ...sessionConfig,
      tempoMultiplier: value,
    };
    setSessionConfig(nextSessionConfig);
    if (!game || !currentSessionSong) {
      return;
    }

    const now = performance.now();
    const currentTime = game.getCurrentTimeSec(now);
    const shouldResume = game.isTransportPlaying() && shouldAutoplayMode(nextSessionConfig.mode);
    game.setTempo(value, now);
    await audioEngine.setTempo(
      currentSessionSong,
      currentTime,
      value,
      shouldResume,
      loopEndForSong(currentSessionSong, nextSessionConfig),
    );
  };

  const handleSeek = async (progress: number) => {
    const currentSessionSong = sessionSong;
    const game = gameSessionRef.current;
    if (!currentSessionSong || !game) {
      return;
    }

    const now = performance.now();
    const loopStart = loopStartForSong(currentSessionSong, sessionConfig);
    const targetSec = loopStart + progress * snapshot.durationSec;
    const shouldResume = game.isTransportPlaying() && shouldAutoplayMode(sessionConfig.mode);
    game.seek(targetSec, now);
    if (shouldResume) {
      await playSessionAudio(currentSessionSong, targetSec, sessionConfig);
      game.play(now);
    } else {
      audioEngine.seek();
    }
  };

  const handleAssignmentChange = async (trackId: string, assignment: TrackAssignment) => {
    if (!sourceSong) {
      return;
    }

    const previousGame = gameSessionRef.current;
    const now = performance.now();
    const score = previousGame?.getSnapshot(now).score;
    const hasJudgedNotes = score && score.perfectCount + score.goodCount + score.okCount + score.missCount > 0;
    if (hasJudgedNotes && !window.confirm('Changing track assignments restarts this run. Continue?')) {
      return;
    }

    const updatedSourceSong = setTrackAssignment(sourceSong, trackId, assignment);
    const updatedSongRecord: SongRow = {
      ...currentSongRef.current,
      trackAssignments: getTrackAssignments(updatedSourceSong),
    };
    currentSongRef.current = updatedSongRecord;

    setCustomFingerings([]);
    setIsEditingFingering(false);
    setFingeringEditorState(null);
    setSelectedFingeringNoteId(null);
    audioEngine.pauseSong();
    await mountSession(updatedSourceSong, sessionConfig, []);
    setStatusMessage('Track assignments changed. This run restarted.');

    if (window.appBridge && canPersistCurrentSong) {
      await window.appBridge.clearCustomFingerings(updatedSongRecord.id);
      await window.appBridge.updateSong(updatedSongRecord.id, {
        title: updatedSongRecord.title,
        trackAssignments: updatedSongRecord.trackAssignments,
      });
    }
  };

  useEffect(() => {
    const handleShortcut = (event: Event) => {
      const customEvent = event as CustomEvent<{ action?: string }>;
      if (customEvent.detail?.action === 'play-pause') {
        void handlePlayPause();
      }
    };

    window.addEventListener('lumakeys-shortcut', handleShortcut);
    return () => {
      window.removeEventListener('lumakeys-shortcut', handleShortcut);
    };
  }, [handlePlayPause]);

  useEffect(() => {
    const handleSpacePlay = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      if (overlayVisible) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();

      if (source.kind === 'lesson-drill' && source.isRhythmClapping) {
        if (event.repeat) {
          return;
        }
        const game = gameSessionRef.current;
        if (!game) {
          return;
        }
        const timestamp = event.timeStamp;
        const note = 60;
        const clapSourceId = 'computer-keyboard:space-clap';
        const noteOn: InputEvent = {
          type: 'noteon',
          source: 'computer-keyboard',
          sourceId: clapSourceId,
          timestamp,
          note,
          velocity: 0.9,
        };
        game.ingestInputEvent(noteOn);
        void audioEngine.noteOn(note, 0.9);
        const timeout = window.setTimeout(() => {
          rhythmClapTimeoutsRef.current = rhythmClapTimeoutsRef.current.filter((id) => id !== timeout);
          game.ingestInputEvent({
            type: 'noteoff',
            source: 'computer-keyboard',
            sourceId: clapSourceId,
            timestamp: performance.now(),
            note,
          });
          audioEngine.noteOff(note);
        }, 80);
        rhythmClapTimeoutsRef.current.push(timeout);
        return;
      }

      void handlePlayPause();
    };
    window.addEventListener('keydown', handleSpacePlay, true);
    return () => {
      window.removeEventListener('keydown', handleSpacePlay, true);
    };
  }, [audioEngine, handlePlayPause, overlayVisible, source]);

  const handleSelectFingeringNote = (
    note: PlaybackSnapshot['visibleNotes'][number],
    anchorPoint: { x: number; y: number },
  ) => {
    if (!isEditingFingering || !canPersistCurrentSong) {
      return;
    }

    setSelectedFingeringNoteId(note.id);
    setFingeringEditorState({
      noteId: note.id,
      scheduledIndex: note.scheduledIndex,
      label: note.label,
      hand: note.hand,
      finger: note.finger,
      anchorPoint,
    });
  };

  const handleSaveFingering = async (finger: number) => {
    if (!window.appBridge || !fingeringEditorState || !canPersistCurrentSong) {
      return;
    }

    const nextFingerings = [
      ...customFingerings.filter((row) => row.noteId !== fingeringEditorState.noteId),
      {
        songId: currentSongRef.current.id,
        noteIndex: -1,
        noteId: fingeringEditorState.noteId,
        finger,
        hand: fingeringEditorState.hand,
      },
    ];
    setCustomFingerings(nextFingerings);
    gameSessionRef.current?.setCustomFingerings(nextFingerings);
    await window.appBridge.saveCustomFingering(
      currentSongRef.current.id,
      -1,
      finger,
      fingeringEditorState.hand,
      fingeringEditorState.noteId,
    );
    setFingeringEditorState((current) => current ? { ...current, finger } : null);
  };

  const handleResetFingerings = async () => {
    if (!window.appBridge || !canPersistCurrentSong) {
      return;
    }

    await window.appBridge.clearCustomFingerings(currentSongRef.current.id);
    setCustomFingerings([]);
    gameSessionRef.current?.setCustomFingerings([]);
    setFingeringEditorState(null);
    setSelectedFingeringNoteId(null);
  };

  const loopStart = loopStartForSong(sessionSong, sessionConfig);
  const progress = snapshot.durationSec > 0 ? (snapshot.currentTimeSec - loopStart) / snapshot.durationSec : 0;
  const currentTimeLabel = formatTime(snapshot.currentTimeSec - loopStart);
  const durationLabel = formatTime(snapshot.durationSec);
  const canImportMidi = source.kind === 'library-song' && !IS_WEB;
  const isTemporaryLibrarySong = source.kind === 'library-song' && currentSongRef.current.id.startsWith('temp-');
  const canPersistCurrentSong = source.kind === 'library-song' && !isTemporaryLibrarySong;

  const sessionToolbar = (
    <SessionToolbar
      sessionConfig={sessionConfig}
      totalMeasures={sessionSong ? getMeasureCount(sessionSong) : 0}
      canEditFingering={canPersistCurrentSong}
      isEditingFingering={isEditingFingering}
      onRebuild={(next) => void rebuildForSessionConfig(next)}
      onHandSizeChange={(handSize) => {
        const nextConfig = { ...sessionConfig, handSize };
        setSessionConfig(nextConfig);
        gameSessionRef.current?.updateSessionConfig(nextConfig, performance.now());
        void saveSetting('fingering', 'handSize', handSize).then(({ saved }) => {
          if (!saved) {
            setStatusMessage('Hand size is active for this session only. Save failed; try again.');
          }
        });
      }}
      onFingeringDisplayModeChange={(fingeringDisplayMode) => {
        const nextConfig = { ...sessionConfig, fingeringDisplayMode };
        setSessionConfig(nextConfig);
        gameSessionRef.current?.updateSessionConfig(nextConfig, performance.now());
        void saveSetting('fingering', 'displayMode', fingeringDisplayMode).then(({ saved }) => {
          if (!saved) {
            setStatusMessage('Fingering display is active for this session only. Save failed; try again.');
          }
        });
      }}
      onToggleFingeringEditor={() => {
        if (!canPersistCurrentSong) {
          setStatusMessage('Save the song to the library before editing fingerings.');
          return;
        }
        setIsEditingFingering((current) => !current);
      }}
      onResetFingerings={() => void handleResetFingerings()}
    />
  );

  const fallingNotesCanvas = (
    <div className="fingering-editor-shell">
      <FallingNotesCanvas
        snapshot={snapshot}
        fingeringEditEnabled={isEditingFingering && canPersistCurrentSong}
        selectedNoteId={selectedFingeringNoteId}
        onNoteSelect={handleSelectFingeringNote}
        onFileDrop={(file) => {
          if (canImportMidi) {
            void handleDroppedFile(file);
          }
        }}
        colorBlindMode={colorBlindMode}
        noteLabels={noteLabels}
        noteLabelSize={noteLabelSize}
      />
      {fingeringEditorState && (
        <FingeringEditor
          note={{
            id: fingeringEditorState.noteId,
            scheduledIndex: fingeringEditorState.scheduledIndex,
            midi: 0,
            label: fingeringEditorState.label,
            hand: fingeringEditorState.hand,
            judgement: 'pending',
            finger: fingeringEditorState.finger,
            xRatio: 0,
            widthRatio: 0,
            topRatio: 0,
            heightRatio: 0,
          }}
          anchorPoint={fingeringEditorState.anchorPoint}
          onSelectFinger={(finger) => void handleSaveFingering(finger)}
          onReset={() => void handleResetFingerings()}
          onClose={() => {
            setFingeringEditorState(null);
            setSelectedFingeringNoteId(null);
          }}
        />
      )}
    </div>
  );

  const pianoKeyboard = (
    <PianoKeyboard
      activeNotes={snapshot.activeInputNotes}
      upcomingNotes={snapshot.upcomingNotes}
      highlightedNotes={snapshot.activeInputNotes}
      highlightColor="chord"
      chordLabel={chordLabel}
      size={keyboardOverlaySize}
    />
  );
  const resolvedHudNavigationItems = hudNavigationItems.map((item) => ({
    ...item,
    onSelect: () => {
      setOverlayVisible(false);
      audioEngine.pauseSong();
      item.onSelect();
    },
  }));

  return (
    <main className="app-shell app-shell-immersive" onPointerDownCapture={() => void ensureAudioReady()}>
      <ImmersiveHud
        currentDestination={hudCurrentDestination ?? (source.kind === 'lesson-drill' ? 'learn-hub' : 'library')}
        navigationItems={resolvedHudNavigationItems}
        stats={
        <div className="immersive-hud-stats">
          {isTemporaryLibrarySong && (
            <div className="immersive-hud-item">
              <span>Run</span>
              <strong>Unsaved MIDI</strong>
            </div>
          )}
          <div className="immersive-hud-item">
            <span>Score</span>
            <strong>{snapshot.score.totalScore.toLocaleString()}</strong>
          </div>
          <div className="immersive-hud-item">
            <span>Combo</span>
            <strong key={snapshot.score.combo} className="combo-pop">
              {snapshot.score.combo} x{snapshot.score.comboMultiplier.toFixed(1)}
            </strong>
          </div>
          <div className="immersive-hud-item">
            <span>Accuracy</span>
            <strong className={
              snapshot.score.accuracy >= 90 ? 'accuracy-high' :
              snapshot.score.accuracy >= 70 ? 'accuracy-mid'  :
                                               'accuracy-low'
            }>
              {snapshot.score.accuracy.toFixed(1)}%
            </strong>
          </div>
        </div>
        }
        actions={
        <div className="immersive-hud-actions">
          <ImmersiveInstrumentControl
            instrumentId={instrumentId}
            instrumentSamplePackStatuses={instrumentSamplePackStatuses}
            unlockedRewardIds={unlockedRewardIds}
            onInstrumentChange={onInstrumentChange}
          />
          <button className="immersive-menu-btn" ref={menuButtonRef} onClick={() => setOverlayVisible(true)}>
            Menu
          </button>
        </div>
        }
      />

      {/* Fingering hint bar */}
      {isEditingFingering && !fingeringEditorState && canPersistCurrentSong && (
        <div className="fingering-hint-bar">
          Click any falling note to assign a fingering number (1-5)
        </div>
      )}

      {/* Main canvas area — fills all available space */}
      <div className="immersive-canvas-area">
        {loadError && (
          <section className="panel game-load-error" role="alert">
            <p className="eyebrow">Practice unavailable</p>
            <h2>Could not start this session.</h2>
            <p className="panel-copy">{loadError}</p>
            <div className="immersive-overlay-actions">
              <button className="primary-button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>
                Retry
              </button>
              <button className="secondary-button" onClick={onExit}>
                {exitLabel ?? (source.kind === 'lesson-drill' ? 'Back to Lesson' : 'Main Menu')}
              </button>
            </div>
          </section>
        )}
        {fallingNotesCanvas}
        {countdownValue !== null && (
          <div className="countdown-overlay" aria-live="assertive">
            <span className="countdown-number" key={countdownValue}>{countdownValue}</span>
          </div>
        )}
      </div>

      {/* Piano keyboard anchored at the bottom */}
      <div className="immersive-keyboard">
        {pianoKeyboard}
      </div>

      {/* Reminder overlays float on top of the game */}
      {showReminder && (
        <section className="panel reminder-overlay">
          <div>
            <p className="eyebrow">Posture Reminder</p>
            <h2>Reset your body before the next repetition.</h2>
            <p className="panel-copy">Relax the shoulders, level the wrists, and keep both feet planted.</p>
          </div>
          <button className="primary-button" onClick={() => setShowReminder(false)}>
            Dismiss
          </button>
        </section>
      )}

      {showBreakReminder && (
        <section className="panel reminder-overlay">
          <div>
            <p className="eyebrow">Break Reminder</p>
            <h2>Time for a short break.</h2>
            <p className="panel-copy">Step away for a few minutes to rest your hands and eyes before continuing.</p>
          </div>
          <button className="primary-button" onClick={() => setShowBreakReminder(false)}>
            Dismiss
          </button>
        </section>
      )}

      {/* Session overlay — shown when Escape is pressed */}
      {overlayVisible && (
        <div className="immersive-overlay" onClick={(e) => { if (e.target === e.currentTarget) setOverlayVisible(false); }}>
          <div
            ref={overlayRef}
            className="immersive-overlay-panel game-overlay-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-overlay-title"
          >
            <div className="immersive-overlay-header">
              <div>
                <p className="eyebrow">Session</p>
                <h2 id="game-overlay-title">{currentSongRef.current.title}</h2>
                {isTemporaryLibrarySong ? (
                  <p className="panel-copy">Unsaved MIDI run. Results, trouble spots, and fingerings are disabled.</p>
                ) : null}
              </div>
              <div className="immersive-overlay-actions">
                <button className="primary-button" onClick={() => setOverlayVisible(false)}>
                  Resume
                </button>
                <button className="secondary-button" onClick={() => { audioEngine.pauseSong(); onExit(); }}>
                  {exitLabel ?? (source.kind === 'lesson-drill' ? 'Back to Lesson' : 'Main Menu')}
                </button>
              </div>
            </div>

            <ControlBar
              canPlay={Boolean(sessionSong)}
              isPlaying={snapshot.isPlaying}
              tempo={sessionConfig.tempoMultiplier}
              progress={Math.max(0, Math.min(1, progress))}
              songTitle={currentSongRef.current.title}
              currentTimeLabel={currentTimeLabel}
              durationLabel={durationLabel}
              onImport={canImportMidi ? () => void handlePickMidi() : undefined}
              onPlayPause={() => void handlePlayPause()}
              onRestart={() => void handleRestart()}
              onTempoChange={(value) => void handleTempoChange(value)}
              onSeek={(value) => void handleSeek(value)}
              onBackToLibrary={onExit}
              backLabel={exitLabel ?? (source.kind === 'lesson-drill' ? 'Back to Lesson' : 'Main Menu')}
            />

            <section className="status-strip">
              {detectedKey && (
                <div className="status-card">
                  <span>Key</span>
                  <KeySignatureBadge detectedKey={detectedKey} />
                </div>
              )}
              <div className="status-card">
                <span>Mode</span>
                <strong>
                  {sessionConfig.mode === 'luma-keys'
                    ? 'LumaKeys'
                    : sessionConfig.mode === 'performance'
                      ? 'Performance'
                      : 'Learning'}
                </strong>
              </div>
              <div className="status-card">
                <span>Input Mode</span>
                <strong>{inputMode === 'both' ? 'Both' : inputMode === 'midi' ? 'MIDI' : 'Computer Keyboard'}</strong>
              </div>
              <div className="status-card">
                <span>Keyboard Octave</span>
                <strong>{keyboardOctaveShift >= 0 ? `+${keyboardOctaveShift}` : keyboardOctaveShift}</strong>
              </div>
              <div className="status-card wide">
                <span>Status</span>
                <strong>{statusMessage}</strong>
              </div>
            </section>

            {sessionToolbar}

            <section className="workspace-grid">
              <section className="status-strip compact-strip">
                <div className="status-card wide">
                  <span>MIDI Devices</span>
                  <strong>
                    {devices.length > 0 ? devices.map((device) => device.name).join(', ') : 'No devices detected'}
                  </strong>
                </div>
                <div className="status-card">
                  <span>Keyboard Mapping</span>
                  <button className="secondary-button" onClick={onOpenKeyboardSetup}>
                    Open Setup
                  </button>
                </div>
              </section>
              {source.kind === 'library-song' ? (
                <TrackAssignmentPanel
                  tracks={sourceSong?.tracks ?? []}
                  onAssignmentChange={(trackId, assignment) => {
                    void handleAssignmentChange(trackId, assignment);
                  }}
                />
              ) : null}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
