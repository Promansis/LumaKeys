import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../../lib/audio/audioEngine';
import type { ComputerKeyboardInputService } from '../../lib/input/computerKeyboardInputService';
import type { InputEvent, KeyboardInputState } from '../../lib/input/types';
import type { ParsedSong, SessionConfig } from '../../lib/game/types';
import type { SongRow } from '../../shared/dbTypes';
import type { MidiInputService } from '../../lib/midi/midiInputService';
import type { MidiInputDevice } from '../../lib/midi/types';
import { GameScreen } from './GameScreen';

vi.mock('./FallingNotesCanvas', () => ({
  FallingNotesCanvas: () => <div data-testid="falling-notes" />,
}));

vi.mock('./PianoKeyboard', () => ({
  PianoKeyboard: () => <div data-testid="piano-keyboard" />,
}));

vi.mock('./ControlBar', () => ({
  ControlBar: () => <div data-testid="control-bar" />,
}));

vi.mock('./TrackAssignmentPanel', () => ({
  TrackAssignmentPanel: () => <div data-testid="track-assignment-panel" />,
}));

vi.mock('./ImmersiveInstrumentControl', () => ({
  ImmersiveInstrumentControl: () => <div data-testid="instrument-control" />,
}));

vi.mock('./FingeringEditor', () => ({
  FingeringEditor: () => <div data-testid="fingering-editor" />,
}));

class MockMidiInputService {
  private listeners = new Set<(event: InputEvent) => void>();

  subscribe(listener: (event: InputEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeDevices(listener: (devices: MidiInputDevice[]) => void): () => void {
    listener([]);
    return () => {};
  }

  emit(event: InputEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}

class MockKeyboardInputService {
  private listeners = new Set<(event: InputEvent) => void>();

  subscribe(listener: (event: InputEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeState(listener: (state: KeyboardInputState) => void): () => void {
    listener(this.getState());
    return () => {};
  }

  getState(): KeyboardInputState {
    return {
      octaveShift: 0,
      mapping: {} as KeyboardInputState['mapping'],
    };
  }

  emit(event: InputEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}

function buildAudioEngineStub(): AudioEngine {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    noteOn: vi.fn().mockResolvedValue(undefined),
    noteOff: vi.fn(),
    allNotesOff: vi.fn(),
    pauseSong: vi.fn(),
    playSong: vi.fn().mockResolvedValue(undefined),
    playMetronomeClick: vi.fn().mockResolvedValue(undefined),
    setPitchBend: vi.fn(),
    setModulation: vi.fn(),
    setSustain: vi.fn(),
    setTempo: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioEngine;
}

function buildSong(): ParsedSong {
  return {
    id: 'lesson-rhythm',
    title: 'Rhythm Drill',
    ppq: 480,
    bpm: 120,
    durationSec: 2,
    tracks: [
      {
        id: 'track-1',
        name: 'Right',
        sourceTrackIndex: 0,
        defaultAssignment: 'right',
        assignment: 'right',
      },
    ],
    notes: [
      {
        id: 'n1',
        trackId: 'track-1',
        midi: 60,
        name: 'C4',
        velocity: 0.8,
        startSec: 0,
        durationSec: 0.25,
        hand: 'right',
      },
    ],
  };
}

function buildLibrarySong(): SongRow {
  return {
    id: 'song-1',
    title: 'Etude',
    artist: 'Test',
    genre: '',
    filePath: 'song-1.mid',
    difficulty: 1,
    durationSec: 2,
    bpm: 120,
    noteCount: 1,
    dateAdded: '2026-01-01T00:00:00.000Z',
    timesPlayed: 0,
    tags: [],
    isFavorite: false,
    folderId: null,
    trackAssignments: {},
  };
}

function buildSessionConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    mode: 'luma-keys',
    tempoMultiplier: 1,
    handFilter: 'both',
    loopRange: null,
    waitForInput: false,
    metronomeEnabled: false,
    handSize: 'medium',
    fingeringDisplayMode: 'learning-only',
    pitchBendEnabled: true,
    latencyCompMs: 0,
    hitWindowMs: 120,
    beatsVisible: 4,
    leadInBeats: 0,
    ...overrides,
  };
}

function renderGameScreen(options: {
  audioEngine?: AudioEngine;
  midiInputService?: MockMidiInputService;
  keyboardInputService?: MockKeyboardInputService;
  isRhythmClapping?: boolean;
  sessionConfig?: SessionConfig;
  librarySong?: boolean;
  onExit?: () => void;
} = {}) {
  const audioEngine = options.audioEngine ?? buildAudioEngineStub();
  const midiInputService = options.midiInputService ?? new MockMidiInputService();
  const keyboardInputService = options.keyboardInputService ?? new MockKeyboardInputService();

  render(
    <GameScreen
      audioEngine={audioEngine}
      inputMode="both"
      keyboardInputService={keyboardInputService as unknown as ComputerKeyboardInputService}
      midiInputService={midiInputService as unknown as MidiInputService}
      source={options.librarySong
        ? { kind: 'library-song', song: buildLibrarySong(), playlistQueue: null }
        : {
          kind: 'lesson-drill',
          lessonId: 'lesson-1',
          stepIndex: 0,
          parsedSong: buildSong(),
          isRhythmClapping: options.isRhythmClapping,
        }}
      initialSessionConfig={options.sessionConfig ?? buildSessionConfig()}
      colorBlindMode={false}
      noteLabels="alphabetic"
      keyboardOverlaySize="medium"
      breakReminderMinutes={null}
      pitchBendEnabled
      instrumentId="acoustic-piano"
      onGameFinished={vi.fn()}
      onLessonDrillFinished={vi.fn()}
      onInstrumentChange={vi.fn()}
      onExit={options.onExit ?? vi.fn()}
      onOpenKeyboardSetup={vi.fn()}
    />,
  );

  return { audioEngine, midiInputService, keyboardInputService };
}

describe('GameScreen', () => {
  beforeEach(() => {
    window.appBridge = {
      getSetting: vi.fn().mockResolvedValue(null),
      setSetting: vi.fn().mockRejectedValue(new Error('write failed')),
    } as unknown as typeof window.appBridge;
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps live audio on until all input sources release the same note', async () => {
    const midiInputService = new MockMidiInputService();
    const keyboardInputService = new MockKeyboardInputService();
    const { audioEngine } = renderGameScreen({ midiInputService, keyboardInputService });

    await waitFor(() => {
      expect(window.appBridge?.getSetting).toHaveBeenCalled();
    });

    await act(async () => {
      midiInputService.emit({
        type: 'noteon',
        source: 'midi',
        sourceId: 'midi:1',
        timestamp: performance.now(),
        note: 60,
        velocity: 0.7,
      });
      keyboardInputService.emit({
        type: 'noteon',
        source: 'computer-keyboard',
        sourceId: 'keyboard:KeyZ',
        timestamp: performance.now(),
        note: 60,
        velocity: 0.8,
      });
      midiInputService.emit({
        type: 'noteoff',
        source: 'midi',
        sourceId: 'midi:1',
        timestamp: performance.now(),
        note: 60,
      });
    });

    expect(audioEngine.noteOn).toHaveBeenCalledTimes(1);
    expect(audioEngine.noteOff).not.toHaveBeenCalledWith(60);

    act(() => {
      keyboardInputService.emit({
        type: 'noteoff',
        source: 'computer-keyboard',
        sourceId: 'keyboard:KeyZ',
        timestamp: performance.now(),
        note: 60,
      });
    });

    expect(audioEngine.noteOff).toHaveBeenCalledWith(60);
  });

  it('uses Space as rhythm clap instead of transport in rhythm drills', async () => {
    const { audioEngine } = renderGameScreen({ isRhythmClapping: true });

    await waitFor(() => {
      expect(window.appBridge?.getSetting).toHaveBeenCalled();
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }));
    });

    expect(audioEngine.noteOn).toHaveBeenCalledWith(60, 0.9);
    expect(audioEngine.playSong).not.toHaveBeenCalled();
    expect(audioEngine.playMetronomeClick).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(audioEngine.noteOff).toHaveBeenCalledWith(60);
    });
  });

  it('keeps rejected in-session fingering settings session-only', async () => {
    renderGameScreen();

    await waitFor(() => expect(window.appBridge?.getSetting).toHaveBeenCalled());
    fireEvent.click(screen.getByText('Menu'));
    fireEvent.change(screen.getByLabelText('Hand Size'), { target: { value: 'large' } });
    fireEvent.change(screen.getByLabelText('Fingering'), { target: { value: 'always' } });

    await waitFor(() => {
      expect(screen.getByText(/active for this session only/)).toBeInTheDocument();
    });
  });

  it('requires confirmation before structural controls restart a judged run', async () => {
    const midiInputService = new MockMidiInputService();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderGameScreen({ midiInputService });

    await waitFor(() => expect(window.appBridge?.getSetting).toHaveBeenCalled());
    act(() => {
      midiInputService.emit({
        type: 'noteon',
        source: 'midi',
        sourceId: 'midi:1',
        timestamp: performance.now(),
        note: 60,
        velocity: 0.8,
      });
    });
    fireEvent.click(screen.getByText('Menu'));

    const learningButton = screen.getByRole('button', { name: 'Learning' });
    fireEvent.click(learningButton);

    expect(confirm).toHaveBeenCalledOnce();
    expect(learningButton).toHaveClass('secondary-button');

    confirm.mockReturnValue(true);
    fireEvent.click(learningButton);

    await waitFor(() => {
      expect(learningButton).toHaveClass('primary-button');
      expect(screen.getByText('Session setup changed. This run restarted.')).toBeInTheDocument();
    });
  });

  describe('prerequisite failures while opening a library song', () => {
    function stubBridge(overrides: Record<string, unknown>) {
      window.appBridge = {
        getSetting: vi.fn().mockResolvedValue(null),
        setSetting: vi.fn().mockResolvedValue(undefined),
        getUserStats: vi.fn().mockResolvedValue(null),
        getCustomFingerings: vi.fn().mockResolvedValue([]),
        loadMidiFileData: vi.fn().mockRejectedValue(new Error('song unavailable')),
        ...overrides,
      } as unknown as typeof window.appBridge;
    }

    it('shows Retry and Main Menu when the song bytes fail to load', async () => {
      stubBridge({});
      const onExit = vi.fn();
      renderGameScreen({ librarySong: true, onExit });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Unable to load song: song unavailable');

      const loadMidiFileData = window.appBridge?.loadMidiFileData as ReturnType<typeof vi.fn>;
      expect(loadMidiFileData).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(loadMidiFileData).toHaveBeenCalledTimes(2));
      expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load song: song unavailable');

      fireEvent.click(screen.getByRole('button', { name: 'Main Menu' }));
      expect(onExit).toHaveBeenCalledOnce();
    });

    it.each(['getUserStats', 'getCustomFingerings', 'getSetting'])(
      'shows the recovery panel when %s rejects',
      async (method) => {
        stubBridge({ [method]: vi.fn().mockRejectedValue(new Error(`${method} failed`)) });
        renderGameScreen({ librarySong: true });

        expect(await screen.findByRole('alert')).toHaveTextContent(`Unable to load song: ${method} failed`);
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Main Menu' })).toBeInTheDocument();
        expect(window.appBridge?.loadMidiFileData).not.toHaveBeenCalled();
      },
    );
  });
});
