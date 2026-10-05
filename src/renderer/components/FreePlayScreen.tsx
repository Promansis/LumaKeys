import { Midi } from '@tonejs/midi';
import { Info, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine } from '../../lib/audio/audioEngine';
import { ComputerKeyboardInputService } from '../../lib/input/computerKeyboardInputService';
import type { InputEvent, InputMode } from '../../lib/input/types';
import { MidiInputService } from '../../lib/midi/midiInputService';
import type { MidiInputDevice } from '../../lib/midi/types';
import { getRewardDefinition, isRewardUnlocked, REWARD_CATALOG } from '../../lib/rewards/rewardCatalog';
import { detectChord } from '../../lib/theory/chords';
import { ImmersiveHud, type ImmersiveHudDestination, type ImmersiveHudNavigationItem } from './ImmersiveHud';
import { ImmersiveInstrumentControl } from './ImmersiveInstrumentControl';
import type { InstrumentSamplePackStatus } from '../../shared/ipc';
import { PianoKeyboard } from './PianoKeyboard';
import { useModalFocusTrap } from '../useModalFocusTrap';
import { saveSetting } from '../saveSetting';
import {
  FREE_PLAY_VISUAL_MODE_OPTIONS,
  FreePlayVisualizer,
  type FreePlayVisualMode,
  type FreePlayVisualNote,
  type VisualPreset,
} from './FreePlayVisualizer';

interface RecordedNote {
  midi: number;
  velocity: number;
  startTimeSec: number;
  durationSec: number;
}

interface SustainEvent {
  timeSec: number;
  value: number;
}

interface FreePlayScreenProps {
  audioEngine: AudioEngine;
  midiInputService: MidiInputService;
  keyboardInputService: ComputerKeyboardInputService;
  inputMode: InputMode;
  keyboardOverlaySize: 'small' | 'medium' | 'large';
  postureReminderMinutes: number | null;
  breakReminderMinutes: number | null;
  pitchBendEnabled: boolean;
  stagePalette: 'default' | 'aurora-emerald' | 'constellation-galactic';
  instrumentId: string;
  instrumentSamplePackStatuses?: Record<string, InstrumentSamplePackStatus>;
  onBackToMainMenu: () => void;
  onStagePaletteChange: (value: 'default' | 'aurora-emerald' | 'constellation-galactic') => void;
  onInstrumentChange: (instrumentId: string) => void;
  onOpenKeyboardSetup: () => void;
  unlockedRewardIds?: Set<string>;
  hudNavigationItems?: ImmersiveHudNavigationItem[];
  hudCurrentDestination?: ImmersiveHudDestination;
}

const VISUAL_NOTE_LIFETIME_MS = 4200;
type StagePaletteOption = {
  value: FreePlayScreenProps['stagePalette'];
  label: string;
  description: string;
  requiredRewardId?: string;
};

const STAGE_PALETTE_OPTIONS: readonly StagePaletteOption[] = [
  {
    value: 'default',
    label: 'Studio Default',
    description: 'Use the active theme palette with no extra unlock required.',
  },
  {
    value: 'aurora-emerald',
    label: 'Aurora Emerald',
    description: 'A cool emerald glow for cinematic aurora and fluid-light scenes.',
    requiredRewardId: 'palette:aurora-emerald',
  },
  {
    value: 'constellation-galactic',
    label: 'Constellation Galactic',
    description: 'A deeper indigo and starlight palette tuned for orbital and constellation scenes.',
    requiredRewardId: 'palette:constellation-galactic',
  },
] as const;

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function makeSourceNoteKey(sourceId: string, midi: number): string {
  return `${sourceId}:${midi}`;
}

export function FreePlayScreen({
  audioEngine,
  inputMode,
  keyboardInputService,
  midiInputService,
  keyboardOverlaySize,
  postureReminderMinutes,
  breakReminderMinutes,
  pitchBendEnabled,
  stagePalette,
  instrumentId,
  instrumentSamplePackStatuses,
  onBackToMainMenu,
  onStagePaletteChange,
  onInstrumentChange,
  onOpenKeyboardSetup,
  unlockedRewardIds,
  hudNavigationItems = [],
  hudCurrentDestination = 'free-play',
}: FreePlayScreenProps) {
  const [devices, setDevices] = useState<MidiInputDevice[]>([]);
  const [showPostureReminder, setShowPostureReminder] = useState(false);
  const [showBreakReminder, setShowBreakReminder] = useState(false);
  const [activeNotes, setActiveNotes] = useState<number[]>([]);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);
  const [metronomeBpm, setMetronomeBpm] = useState(90);
  const [metronomeBeat, setMetronomeBeat] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Play with MIDI or your computer keyboard to begin free practice.');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordedNotes, setRecordedNotes] = useState<RecordedNote[]>([]);
  const [sustainEvents, setSustainEvents] = useState<SustainEvent[]>([]);
  const [recordingClock, setRecordingClock] = useState(0);
  const [isPlayingRecording, setIsPlayingRecording] = useState(false);
  const [keyboardOctaveShift, setKeyboardOctaveShift] = useState(keyboardInputService.getState().octaveShift);
  const [chordLabel, setChordLabel] = useState<string | null>(null);
  const [backingTrackName, setBackingTrackName] = useState<string | null>(null);
  const [isBackingTrackPlaying, setIsBackingTrackPlaying] = useState(false);
  const [backingTrackVolume, setBackingTrackVolume] = useState(70);
  const [isExportingWav, setIsExportingWav] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [visualMode, setVisualMode] = useState<FreePlayVisualMode>('classic-piano');
  const [visualPreset, setVisualPreset] = useState<VisualPreset>('balanced');
  const [sustainOn, setSustainOn] = useState(false);
  const [visualNotes, setVisualNotes] = useState<FreePlayVisualNote[]>([]);
  const [visualizerActiveNotes, setVisualizerActiveNotes] = useState<number[]>([]);
  const [visualSceneResetToken, setVisualSceneResetToken] = useState(0);
  const [isVisualControlsPinned, setIsVisualControlsPinned] = useState(false);
  const [isVisualControlsHovered, setIsVisualControlsHovered] = useState(false);
  const [isInstrumentPopoutHovered, setIsInstrumentPopoutHovered] = useState(false);
  const [openVisualInfoMode, setOpenVisualInfoMode] = useState<FreePlayVisualMode | null>(null);
  const [visualStageElement, setVisualStageElement] = useState<HTMLDivElement | null>(null);
  const noteStartMapRef = useRef(new Map<string, { startTimeSec: number; velocity: number; midi: number }>());
  const playbackTimeoutsRef = useRef<number[]>([]);
  const visualNoteTimeoutsRef = useRef<number[]>([]);
  const visualHeldByNoteRef = useRef(new Map<number, Set<string>>());
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const visualToggleRef = useRef<HTMLButtonElement | null>(null);
  const visualPopoutRef = useRef<HTMLElement | null>(null);
  const visualHoverCloseTimeoutRef = useRef<number | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useModalFocusTrap({
    open: overlayVisible,
    dialogRef: overlayRef,
    triggerRef: menuButtonRef,
    onEscape: () => setOverlayVisible(false),
  });

  useEffect(() => {
    const heldByNote = new Map<number, Set<string>>();
    const shouldHandleEvent = (event: InputEvent): boolean => {
      if (inputMode === 'both') {
        return true;
      }
      if (inputMode === 'midi') {
        return event.source === 'midi';
      }
      return event.source === 'computer-keyboard';
    };

    const pushVisualNote = (midi: number, velocity: number, source: FreePlayVisualNote['source']) => {
      const createdAt = performance.now();
      const id = `${source}-${createdAt}-${midi}`;
      setVisualNotes((previous) => [...previous.slice(-17), { id, midi, velocity, createdAt, source }]);
      const timeout = window.setTimeout(() => {
        setVisualNotes((previous) => previous.filter((note) => note.id !== id));
      }, VISUAL_NOTE_LIFETIME_MS);
      visualNoteTimeoutsRef.current.push(timeout);
    };

    const handleInputEvent = async (event: InputEvent) => {
      if (!shouldHandleEvent(event)) {
        return;
      }

      if (event.type === 'noteon' && typeof event.note === 'number') {
        const midi = event.note;
        const heldSources = heldByNote.get(midi) ?? new Set<string>();
        heldSources.add(event.sourceId);
        heldByNote.set(midi, heldSources);
        setActiveNotes([...heldByNote.keys()].sort((left, right) => left - right));
        const visualHeldSources = visualHeldByNoteRef.current.get(midi) ?? new Set<string>();
        visualHeldSources.add(event.sourceId);
        visualHeldByNoteRef.current.set(midi, visualHeldSources);
        setVisualizerActiveNotes([...visualHeldByNoteRef.current.keys()].sort((left, right) => left - right));
        pushVisualNote(midi, event.velocity ?? 0.8, 'live');

        if (heldSources.size === 1) {
          await audioEngine.noteOn(midi, event.velocity ?? 0.8);
        }

        if (isRecording && recordingStartedAt !== null) {
          noteStartMapRef.current.set(makeSourceNoteKey(event.sourceId, midi), {
            midi,
            startTimeSec: (event.timestamp - recordingStartedAt) / 1000,
            velocity: event.velocity ?? 0.8,
          });
        }
        return;
      }

      if (event.type === 'noteoff' && typeof event.note === 'number') {
        const midi = event.note;
        const heldSources = heldByNote.get(midi);
        if (heldSources) {
          heldSources.delete(event.sourceId);
          if (heldSources.size === 0) {
            heldByNote.delete(midi);
            audioEngine.noteOff(midi);
          }
          setActiveNotes([...heldByNote.keys()].sort((left, right) => left - right));
        }
        const visualHeldSources = visualHeldByNoteRef.current.get(midi);
        if (visualHeldSources) {
          visualHeldSources.delete(event.sourceId);
          if (visualHeldSources.size === 0) {
            visualHeldByNoteRef.current.delete(midi);
          }
          setVisualizerActiveNotes([...visualHeldByNoteRef.current.keys()].sort((left, right) => left - right));
        }

        if (isRecording && recordingStartedAt !== null) {
          const started = noteStartMapRef.current.get(makeSourceNoteKey(event.sourceId, midi));
          if (started) {
            setRecordedNotes((previous) => [
              ...previous,
              {
                midi,
                velocity: started.velocity,
                startTimeSec: started.startTimeSec,
                durationSec: Math.max(0.05, (event.timestamp - recordingStartedAt) / 1000 - started.startTimeSec),
              },
            ]);
            noteStartMapRef.current.delete(makeSourceNoteKey(event.sourceId, midi));
          }
        }
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

      const nextSustainOn = (event.sustainValue ?? 0) >= 64;
      audioEngine.setSustain(nextSustainOn);
      setSustainOn(nextSustainOn);
      if (isRecording && recordingStartedAt !== null) {
        setSustainEvents((previous) => [
          ...previous,
          {
            timeSec: (event.timestamp - recordingStartedAt) / 1000,
            value: event.sustainValue ?? 0,
          },
        ]);
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
      playbackTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      visualNoteTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
      playbackTimeoutsRef.current = [];
      visualNoteTimeoutsRef.current = [];
      visualHeldByNoteRef.current.clear();
      audioEngine.stopBackingTrack();
      audioEngine.setSustain(false);
      audioEngine.setPitchBend(0);
      audioEngine.allNotesOff();
    };
  }, [audioEngine, inputMode, isRecording, keyboardInputService, midiInputService, recordingStartedAt]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setChordLabel(detectChord(activeNotes)?.label ?? null);
    }, 50);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeNotes]);

  useEffect(() => {
    if (!isRecording || recordingStartedAt === null) {
      return;
    }

    const interval = window.setInterval(() => {
      setRecordingClock((performance.now() - recordingStartedAt) / 1000);
    }, 200);

    return () => {
      window.clearInterval(interval);
    };
  }, [isRecording, recordingStartedAt]);

  useEffect(() => {
    if (!metronomeEnabled) {
      return;
    }

    let beat = 0;
    const intervalMs = (60 / Math.max(30, metronomeBpm)) * 1000;
    setMetronomeBeat(1);
    void audioEngine.playMetronomeClick(true);
    const interval = window.setInterval(() => {
      beat += 1;
      setMetronomeBeat(beat + 1);
      void audioEngine.playMetronomeClick(beat % 4 === 0);
    }, intervalMs);

    return () => {
      window.clearInterval(interval);
    };
  }, [audioEngine, metronomeBpm, metronomeEnabled]);

  useEffect(() => {
    if (!postureReminderMinutes) {
      return;
    }
    const interval = window.setInterval(() => {
      setShowPostureReminder(true);
    }, postureReminderMinutes * 60 * 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [postureReminderMinutes]);

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
      if (event.key !== 'Escape' || event.defaultPrevented) {
        return;
      }
      event.stopPropagation();
      event.preventDefault();
      setOverlayVisible((prev) => !prev);
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    if (!isVisualControlsPinned) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (visualToggleRef.current?.contains(target) || visualPopoutRef.current?.contains(target)) {
        return;
      }
      setIsVisualControlsPinned(false);
      setIsVisualControlsHovered(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [isVisualControlsPinned]);

  useEffect(() => () => {
    if (visualHoverCloseTimeoutRef.current !== null) {
      window.clearTimeout(visualHoverCloseTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      const saved = await window.appBridge?.getSetting('audio', 'backingTrackVolume');
      if (ignore) {
        return;
      }
      if (saved !== null && saved !== undefined) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed)) {
          setBackingTrackVolume(parsed);
          audioEngine.setBackingTrackVolume(parsed);
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, [audioEngine]);

  const recordingDuration = useMemo(() => {
    if (isRecording) {
      return recordingClock;
    }

    return recordedNotes.reduce(
      (max, note) => Math.max(max, note.startTimeSec + note.durationSec),
      0,
    );
  }, [isRecording, recordedNotes, recordingClock]);

  const ensureAudioReady = async () => {
    try {
      await audioEngine.prepareForPlayback();
    } catch (error) {
      setStatusMessage(`Audio failed to initialize: ${(error as Error).message}`);
    }
  };

  const startRecording = () => {
    noteStartMapRef.current.clear();
    setRecordedNotes([]);
    setSustainEvents([]);
    setRecordingClock(0);
    setRecordingStartedAt(performance.now());
    setIsRecording(true);
    setStatusMessage('Recording keyboard and MIDI input.');
  };

  const stopRecording = () => {
    const stoppedAt = performance.now();
    const completedNotes: RecordedNote[] = [];
    if (recordingStartedAt !== null) {
      for (const started of noteStartMapRef.current.values()) {
        completedNotes.push({
          midi: started.midi,
          velocity: started.velocity,
          startTimeSec: started.startTimeSec,
          durationSec: Math.max(0.05, (stoppedAt - recordingStartedAt) / 1000 - started.startTimeSec),
        });
      }
    }
    noteStartMapRef.current.clear();
    if (completedNotes.length > 0) {
      setRecordedNotes((previous) => [...previous, ...completedNotes]);
    }
    setIsRecording(false);
    setRecordingStartedAt(null);
    setStatusMessage('Recording captured. You can replay or export it now.');
  };

  const playRecording = async () => {
    if (recordedNotes.length === 0) {
      setStatusMessage('Record something first.');
      return;
    }

    await audioEngine.prepareForPlayback();
    playbackTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    playbackTimeoutsRef.current = [];
    setIsPlayingRecording(true);
    setStatusMessage('Playing recorded MIDI.');

    const queueVisualNote = (midi: number, velocity: number) => {
      const createdAt = performance.now();
      const id = `playback-${createdAt}-${midi}`;
      setVisualNotes((previous) => [...previous.slice(-17), { id, midi, velocity, createdAt, source: 'playback' }]);
      const timeout = window.setTimeout(() => {
        setVisualNotes((previous) => previous.filter((note) => note.id !== id));
      }, VISUAL_NOTE_LIFETIME_MS);
      visualNoteTimeoutsRef.current.push(timeout);
    };

    for (const note of recordedNotes) {
      playbackTimeoutsRef.current.push(
        window.setTimeout(() => {
          setActiveNotes((previous) => [...new Set([...previous, note.midi])].sort((left, right) => left - right));
          setVisualizerActiveNotes((previous) => [...new Set([...previous, note.midi])].sort((left, right) => left - right));
          queueVisualNote(note.midi, note.velocity);
          void audioEngine.noteOn(note.midi, note.velocity);
        }, note.startTimeSec * 1000),
      );
      playbackTimeoutsRef.current.push(
        window.setTimeout(() => {
          setActiveNotes((previous) => previous.filter((value) => value !== note.midi));
          setVisualizerActiveNotes((previous) => previous.filter((value) => value !== note.midi));
          audioEngine.noteOff(note.midi);
        }, (note.startTimeSec + note.durationSec) * 1000),
      );
    }

    for (const event of sustainEvents) {
      playbackTimeoutsRef.current.push(
        window.setTimeout(() => {
          const nextSustainOn = event.value >= 64;
          setSustainOn(nextSustainOn);
          audioEngine.setSustain(nextSustainOn);
        }, event.timeSec * 1000),
      );
    }

    const totalDuration = recordedNotes.reduce(
      (max, note) => Math.max(max, note.startTimeSec + note.durationSec),
      0,
    );
    playbackTimeoutsRef.current.push(
      window.setTimeout(() => {
        setIsPlayingRecording(false);
        setVisualizerActiveNotes([]);
        setSustainOn(false);
        audioEngine.setSustain(false);
        setStatusMessage('Playback finished.');
      }, totalDuration * 1000 + 120),
    );
  };

  const loadBackingTrack = async () => {
    if (!window.appBridge) {
      return;
    }
    if (IS_WEB) {
      setStatusMessage('Backing tracks are available in the desktop app.');
      return;
    }
    const picked = await window.appBridge.pickAudioFile();
    if (!picked) {
      return;
    }
    const src = 'file:///' + picked.path.replace(/\\/g, '/');
    await audioEngine.loadBackingTrack(src);
    setBackingTrackName(picked.name);
    audioEngine.setBackingTrackVolume(backingTrackVolume);
    setIsBackingTrackPlaying(false);
    setStatusMessage(`Backing track loaded: ${picked.name}`);
  };

  const toggleBackingTrack = () => {
    if (isBackingTrackPlaying) {
      audioEngine.pauseBackingTrack();
      setIsBackingTrackPlaying(false);
      setStatusMessage('Backing track paused.');
    } else {
      audioEngine.playBackingTrack();
      setIsBackingTrackPlaying(true);
      setStatusMessage('Backing track playing.');
    }
  };

  const stopBackingTrack = () => {
    audioEngine.stopBackingTrack();
    setIsBackingTrackPlaying(false);
    setStatusMessage('Backing track stopped.');
  };

  const handleBackingTrackVolumeChange = (value: number) => {
    setBackingTrackVolume(value);
    audioEngine.setBackingTrackVolume(value);
    void saveSetting('audio', 'backingTrackVolume', String(value)).then(({ saved }) => {
      if (!saved) {
        setStatusMessage('Backing track volume is active for this session only. Save failed; try again.');
      }
    });
  };

  const exportWav = async () => {
    if (recordedNotes.length === 0 || !window.appBridge) {
      setStatusMessage('Record something before exporting.');
      return;
    }
    if (IS_WEB) {
      setStatusMessage('WAV export to a file is available in the desktop app.');
      return;
    }
    setIsExportingWav(true);
    setStatusMessage('Rendering WAV (this may take a moment)...');
    try {
      const duration = recordedNotes.reduce(
        (max, note) => Math.max(max, note.startTimeSec + note.durationSec),
        0,
      );
      const wavBytes = await audioEngine.renderRecordingToWav(recordedNotes, duration);
      const savedPath = await window.appBridge.saveWavFile('free-play-recording.wav', wavBytes);
      if (savedPath) {
        setStatusMessage(`WAV saved to ${savedPath}.`);
      } else {
        setStatusMessage('Export cancelled.');
      }
    } catch {
      setStatusMessage('WAV export failed. Try exporting MIDI instead.');
    } finally {
      setIsExportingWav(false);
    }
  };

  const exportRecording = async () => {
    if (recordedNotes.length === 0 || !window.appBridge) {
      setStatusMessage('Record something before exporting.');
      return;
    }
    if (IS_WEB) {
      setStatusMessage('MIDI export to a file is available in the desktop app.');
      return;
    }

    const midi = new Midi();
    const track = midi.addTrack();
    for (const note of recordedNotes) {
      track.addNote({
        midi: note.midi,
        time: note.startTimeSec,
        duration: note.durationSec,
        velocity: note.velocity,
      });
    }
    for (const event of sustainEvents) {
      track.addCC({
        number: 64,
        time: event.timeSec,
        value: Math.max(0, Math.min(1, event.value / 127)),
      });
    }

    const savedPath = await window.appBridge.saveMidiFile('free-play-recording.mid', midi.toArray());
    if (savedPath) {
      setStatusMessage(`Saved recording to ${savedPath}.`);
    } else {
      setStatusMessage('MIDI export cancelled.');
    }
  };

  const visualModeLabel =
    FREE_PLAY_VISUAL_MODE_OPTIONS.find((option) => option.value === visualMode)?.label ?? 'Concert Stage';
  const visualModeDescription =
    FREE_PLAY_VISUAL_MODE_OPTIONS.find((option) => option.value === visualMode)?.description ??
    'Switch scenes instantly without interrupting recording or backing tracks.';
  const isVisualControlsOpen = isVisualControlsPinned || isVisualControlsHovered;
  const harmonyStatus = chordLabel ?? (sustainOn ? 'Pedal down' : 'Exploring');
  const sessionStatus = isPlayingRecording
    ? `Playback ${formatCount(recordedNotes.length, 'note')}`
    : isRecording
      ? `Recording ${formatDuration(recordingDuration)}`
      : recordedNotes.length > 0
        ? `${formatCount(recordedNotes.length, 'note')} captured`
        : 'Live input';
  const sessionDetail = backingTrackName
    ? `${sessionStatus} · ${isBackingTrackPlaying ? 'Track: ' : 'Track loaded: '}${backingTrackName}`
    : sessionStatus;
  const focusAfterClose = (ref: { current: HTMLButtonElement | null }) => {
    window.requestAnimationFrame(() => {
      ref.current?.focus();
    });
  };
  const closeOverlay = (returnFocus = false) => {
    setOverlayVisible(false);
    if (returnFocus) {
      focusAfterClose(menuButtonRef);
    }
  };
  const closeVisualControls = (returnFocus = false) => {
    if (visualHoverCloseTimeoutRef.current !== null) {
      window.clearTimeout(visualHoverCloseTimeoutRef.current);
      visualHoverCloseTimeoutRef.current = null;
    }
    setIsVisualControlsPinned(false);
    setIsVisualControlsHovered(false);
    if (returnFocus) {
      focusAfterClose(visualToggleRef);
    }
  };
  const keepVisualControlsOpen = () => {
    if (visualHoverCloseTimeoutRef.current !== null) {
      window.clearTimeout(visualHoverCloseTimeoutRef.current);
      visualHoverCloseTimeoutRef.current = null;
    }
    setIsVisualControlsHovered(true);
  };
  const scheduleVisualControlsClose = () => {
    if (visualHoverCloseTimeoutRef.current !== null) {
      window.clearTimeout(visualHoverCloseTimeoutRef.current);
    }
    if (isVisualControlsPinned) {
      return;
    }
    visualHoverCloseTimeoutRef.current = window.setTimeout(() => {
      setIsVisualControlsHovered(false);
      visualHoverCloseTimeoutRef.current = null;
    }, 180);
  };

  const clearVisualCanvas = () => {
    visualHeldByNoteRef.current.clear();
    setVisualizerActiveNotes([]);
    setVisualNotes([]);
    visualNoteTimeoutsRef.current.forEach((timeout) => window.clearTimeout(timeout));
    visualNoteTimeoutsRef.current = [];
    setVisualSceneResetToken((current) => current + 1);
  };

  const handleVisualModeChange = (nextMode: FreePlayVisualMode) => {
    if (nextMode === visualMode) {
      return;
    }
    clearVisualCanvas();
    setVisualMode(nextMode);
  };
  const resolvedHudNavigationItems = hudNavigationItems.map((item) => ({
    ...item,
    onSelect: () => {
      closeOverlay(false);
      closeVisualControls(false);
      item.onSelect();
    },
  }));

  return (
    <main className="app-shell app-shell-immersive free-play-immersive-shell" onPointerDownCapture={() => void ensureAudioReady()}>
      <ImmersiveHud
        className="free-play-hud"
        externalHover={isVisualControlsHovered || isInstrumentPopoutHovered}
        currentDestination={hudCurrentDestination}
        navigationItems={resolvedHudNavigationItems}
        stats={
        <div className="immersive-hud-stats">
          <div className="immersive-hud-item">
            <span>Mode</span>
            <strong>{visualModeLabel}</strong>
          </div>
          <div className="immersive-hud-item">
            <span>Harmony</span>
            <strong>{harmonyStatus}</strong>
          </div>
          <div className="immersive-hud-item">
            <span>Session</span>
            <strong>{sessionDetail}</strong>
          </div>
        </div>
        }
        actions={
        <div className="free-play-hud-actions">
          <ImmersiveInstrumentControl
            instrumentId={instrumentId}
            instrumentSamplePackStatuses={instrumentSamplePackStatuses}
            popoutHost={visualStageElement}
            popoutPlacement="stage"
            onPopoutHoverChange={setIsInstrumentPopoutHovered}
            unlockedRewardIds={unlockedRewardIds}
            onInstrumentChange={onInstrumentChange}
          />
          <button
            className="immersive-menu-btn free-play-visual-toggle"
            ref={visualToggleRef}
            aria-label="Show visual mode controls"
            aria-controls="free-play-visual-popout"
            aria-expanded={isVisualControlsOpen}
            onClick={() => {
              if (isVisualControlsOpen) {
                closeVisualControls(true);
                return;
              }
              setIsVisualControlsPinned(true);
              setIsVisualControlsHovered(false);
            }}
            onMouseEnter={keepVisualControlsOpen}
            onMouseLeave={scheduleVisualControlsClose}
            onFocus={keepVisualControlsOpen}
            onBlur={scheduleVisualControlsClose}
          >
            <Sparkles size={17} strokeWidth={2.2} aria-hidden="true" />
          </button>
          <button
            className="immersive-menu-btn"
            ref={menuButtonRef}
            aria-controls="free-play-overlay-panel"
            aria-expanded={overlayVisible}
            onClick={() => setOverlayVisible(true)}
          >
            Menu
          </button>
        </div>
        }
      />

      <div
        className="immersive-canvas-area free-play-stage-area"
        ref={setVisualStageElement}
        onMouseLeave={() => {
          scheduleVisualControlsClose();
        }}
      >
        <FreePlayVisualizer
          mode={visualMode}
          activeNotes={visualizerActiveNotes}
          recentNotes={visualNotes}
          resetToken={visualSceneResetToken}
          sustainOn={sustainOn}
          metronomeEnabled={metronomeEnabled}
          metronomeBeat={metronomeBeat}
          visualPreset={visualPreset}
        />

        <section
          ref={visualPopoutRef}
          className={`panel free-play-visual-popout${isVisualControlsOpen ? ' open' : ''}`}
          id="free-play-visual-popout"
          aria-label="Visual mode controls"
          aria-hidden={!isVisualControlsOpen}
          data-testid="free-play-visual-popout"
           onMouseEnter={keepVisualControlsOpen}
           onMouseLeave={scheduleVisualControlsClose}
        >
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Visual Palette</p>
              <h2>{visualModeLabel}</h2>
            </div>
            <p className="panel-copy">{visualModeDescription}</p>
          </div>
          <div className="free-play-preset-row">
            <span className="free-play-preset-label">Intensity</span>
            {(['subtle', 'balanced', 'vivid'] as VisualPreset[]).map((presetOption) => (
              <button
                key={presetOption}
                className={`free-play-preset-btn ${visualPreset === presetOption ? 'active' : ''}`}
                onClick={() => setVisualPreset(presetOption)}
              >
                {presetOption.charAt(0).toUpperCase() + presetOption.slice(1)}
              </button>
            ))}
          </div>
          <div className="free-play-mode-grid">
            {FREE_PLAY_VISUAL_MODE_OPTIONS.map((option) => {
              const locked = option.requiredRewardId
                ? !isRewardUnlocked(option.requiredRewardId, unlockedRewardIds ?? new Set())
                : false;
              const reward = option.requiredRewardId
                ? REWARD_CATALOG.find((r) => r.id === option.requiredRewardId)
                : undefined;
              return (
                <div
                  key={option.value}
                  className={`free-play-mode-card ${visualMode === option.value ? 'active' : ''} ${locked ? 'locked' : ''}`}
                  title={locked && reward ? `Locked — ${reward.description}` : undefined}
                >
                  <button
                    className="free-play-mode-card-select"
                    onClick={() => !locked && handleVisualModeChange(option.value)}
                    disabled={locked}
                    type="button"
                  >
                    {locked ? `🔒 ${option.label}` : option.label}
                  </button>
                  <span className="card-info-control">
                    <span
                      className={`card-info-popover${openVisualInfoMode === option.value ? ' open' : ''}`}
                      role="status"
                    >
                      {locked && reward ? `Unlock: ${reward.description}` : option.description}
                    </span>
                    <button
                      className="card-info-button"
                      aria-label={`${option.label} info`}
                      aria-pressed={openVisualInfoMode === option.value}
                      title={locked && reward ? `Unlock: ${reward.description}` : option.description}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setOpenVisualInfoMode((current) => (current === option.value ? null : option.value));
                      }}
                    >
                      <Info size={13} strokeWidth={2.2} aria-hidden="true" />
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="immersive-keyboard free-play-keyboard">
        <PianoKeyboard
          activeNotes={activeNotes}
          upcomingNotes={[]}
          highlightedNotes={activeNotes}
          highlightColor="chord"
          chordLabel={chordLabel}
          size={keyboardOverlaySize}
        />
      </div>

      {showPostureReminder && (
        <section className="panel reminder-overlay">
          <div>
            <p className="eyebrow">Posture Reminder</p>
            <h2>Reset your body before continuing.</h2>
            <p className="panel-copy">Relax the shoulders, level the wrists, and keep both feet planted.</p>
          </div>
          <button className="primary-button" onClick={() => setShowPostureReminder(false)}>
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

      {overlayVisible && (
        <div
          className="immersive-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeOverlay(true);
            }
          }}
        >
          <div
            ref={overlayRef}
            className="immersive-overlay-panel free-play-overlay-panel"
            id="free-play-overlay-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="free-play-overlay-title"
          >
            <div className="immersive-overlay-header">
              <div>
                <p className="eyebrow">Session</p>
                <h2 id="free-play-overlay-title">Free Play</h2>
              </div>
              <div className="immersive-overlay-actions">
                <button className="primary-button" onClick={() => closeOverlay(true)}>
                  Resume
                </button>
                <button className="secondary-button" onClick={onBackToMainMenu}>
                  Back to Main Menu
                </button>
              </div>
            </div>

            <section className="status-strip">
              <div className="status-card">
                <span>Visual Mode</span>
                <strong>{visualModeLabel}</strong>
              </div>
              <div className="status-card">
                <span>Input Mode</span>
                <strong>{inputMode === 'both' ? 'Both' : inputMode === 'midi' ? 'MIDI' : 'Computer Keyboard'}</strong>
              </div>
              <div className="status-card">
                <span>Keyboard Octave</span>
                <strong>{keyboardOctaveShift >= 0 ? `+${keyboardOctaveShift}` : keyboardOctaveShift}</strong>
              </div>
              <div className="status-card">
                <span>Captured</span>
                <strong>{formatCount(recordedNotes.length, 'note')}</strong>
              </div>
              <div className="status-card">
                <span>Sustain</span>
                <strong>{sustainOn ? 'Down' : 'Up'}</strong>
              </div>
              <div className="status-card wide">
                <span>Status</span>
                <strong>{statusMessage}</strong>
              </div>
            </section>

            <section className="panel free-play-overlay-section">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Session Controls</p>
                  <h2>Keep the instrument live</h2>
                </div>
                <p className="panel-copy">Recording, transport, and practice tools stay here so the stage HUD can stay clean.</p>
              </div>
              <div className="transport-buttons">
                <button className="secondary-button" onClick={onOpenKeyboardSetup}>
                  Keyboard Setup
                </button>
                <button className={metronomeEnabled ? 'primary-button' : 'secondary-button'} onClick={() => setMetronomeEnabled((value) => !value)}>
                  {metronomeEnabled ? 'Metronome On' : 'Metronome Off'}
                </button>
                <button className={isRecording ? 'primary-button' : 'secondary-button'} onClick={isRecording ? stopRecording : startRecording}>
                  {isRecording ? 'Stop Recording' : 'Record'}
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void playRecording()}
                  disabled={isRecording || recordedNotes.length === 0 || isPlayingRecording}
                >
                  Play Recording
                </button>
                {!IS_WEB ? (
                  <button className="secondary-button" onClick={() => void loadBackingTrack()}>
                    Load Track
                  </button>
                ) : null}
                {!IS_WEB ? (
                  <button className="primary-button" onClick={() => void exportRecording()} disabled={recordedNotes.length === 0}>
                    Export MIDI
                  </button>
                ) : null}
                {!IS_WEB ? (
                  <button
                    className="primary-button"
                    onClick={() => void exportWav()}
                    disabled={recordedNotes.length === 0 || isExportingWav}
                  >
                    {isExportingWav ? 'Rendering...' : 'Export WAV'}
                  </button>
                ) : null}
              </div>

              <div className="free-play-overlay-grid">
                <label className="status-card free-play-slider-card">
                  <span>Metronome BPM</span>
                  <strong>{metronomeBpm}</strong>
                  <input
                    type="range"
                    min={40}
                    max={180}
                    step={1}
                    value={metronomeBpm}
                    onChange={(event) => setMetronomeBpm(Number(event.target.value))}
                  />
                </label>

                <div className="status-card">
                  <span>Playback</span>
                  <strong>{isPlayingRecording ? 'Running' : 'Idle'}</strong>
                </div>

                <div className="status-card">
                  <span>Sustain Events</span>
                  <strong>{formatCount(sustainEvents.length, 'event')}</strong>
                </div>

                <div className="status-card wide">
                  <span>MIDI Devices</span>
                  <strong>{devices.length > 0 ? devices.map((device) => device.name).join(', ') : 'No devices detected'}</strong>
                </div>
              </div>
            </section>

            <section className="panel free-play-overlay-section">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Backing Track</p>
                  <h2>{backingTrackName ?? 'No track loaded'}</h2>
                </div>
                <p className="panel-copy">
                  {backingTrackName
                    ? 'Blend a groove underneath the keyboard while staying in the same visual scene.'
                    : 'Load a backing track to turn open practice into a performance space.'}
                </p>
              </div>
              <div className="transport-buttons">
                <button className="secondary-button" onClick={toggleBackingTrack} disabled={!backingTrackName}>
                  {isBackingTrackPlaying ? 'Pause' : 'Play'}
                </button>
                <button className="secondary-button" onClick={stopBackingTrack} disabled={!backingTrackName}>
                  Stop
                </button>
              </div>
              <label className="status-card free-play-slider-card">
                <span>Track Volume</span>
                <strong>{backingTrackVolume}%</strong>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={backingTrackVolume}
                  onChange={(event) => handleBackingTrackVolumeChange(Number(event.target.value))}
                />
              </label>
            </section>

            <section className="panel free-play-overlay-section">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Visual Palette</p>
                  <h2>{visualModeLabel}</h2>
                </div>
                <p className="panel-copy">{visualModeDescription}</p>
              </div>
              <div className="free-play-preset-row">
                <span className="free-play-preset-label">Intensity</span>
                {(['subtle', 'balanced', 'vivid'] as VisualPreset[]).map((presetOption) => (
                  <button
                    key={presetOption}
                    className={`free-play-preset-btn ${visualPreset === presetOption ? 'active' : ''}`}
                    onClick={() => setVisualPreset(presetOption)}
                  >
                    {presetOption.charAt(0).toUpperCase() + presetOption.slice(1)}
                  </button>
                ))}
              </div>
              <div className="free-play-mode-grid">
                {FREE_PLAY_VISUAL_MODE_OPTIONS.map((option) => {
                  const locked = option.requiredRewardId
                    ? !isRewardUnlocked(option.requiredRewardId, unlockedRewardIds ?? new Set())
                    : false;
                  const reward = option.requiredRewardId ? getRewardDefinition(option.requiredRewardId) : undefined;
                  return (
                    <button
                      key={option.value}
                      className={`free-play-mode-card ${visualMode === option.value ? 'active' : ''} ${locked ? 'locked' : ''}`}
                      onClick={() => !locked && handleVisualModeChange(option.value)}
                      disabled={locked}
                      title={locked && reward ? `Locked — ${reward.description}` : undefined}
                    >
                      <strong>{locked ? `🔒 ${option.label}` : option.label}</strong>
                      <span>{locked && reward ? `Unlock: ${reward.description}` : option.description}</span>
                    </button>
                  );
                })}
              </div>
              <div className="panel-heading free-play-stage-palette-heading">
                <div>
                  <p className="eyebrow">Stage Color</p>
                  <h2>Set the color language</h2>
                </div>
                <p className="panel-copy">Reward palettes stay visible here even before they are unlocked.</p>
              </div>
              <div className="free-play-mode-grid">
                {STAGE_PALETTE_OPTIONS.map((option) => {
                  const locked = option.requiredRewardId
                    ? !isRewardUnlocked(option.requiredRewardId, unlockedRewardIds ?? new Set())
                    : false;
                  const reward = option.requiredRewardId ? getRewardDefinition(option.requiredRewardId) : undefined;
                  return (
                    <button
                      key={option.value}
                      className={`free-play-mode-card ${stagePalette === option.value ? 'active' : ''} ${locked ? 'locked' : ''}`}
                      onClick={() => !locked && onStagePaletteChange(option.value)}
                      disabled={locked}
                      title={locked && reward ? `Locked — ${reward.description}` : undefined}
                    >
                      <strong>{locked ? `🔒 ${option.label}` : option.label}</strong>
                      <span>{locked && reward ? `Unlock: ${reward.description}` : option.description}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
