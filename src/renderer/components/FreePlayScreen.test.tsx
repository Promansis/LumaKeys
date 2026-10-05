import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../../lib/audio/audioEngine';
import type { ComputerKeyboardInputService } from '../../lib/input/computerKeyboardInputService';
import type { InputEvent, KeyboardInputState } from '../../lib/input/types';
import type { MidiInputService } from '../../lib/midi/midiInputService';
import type { MidiInputDevice } from '../../lib/midi/types';
import { FreePlayScreen } from './FreePlayScreen';

vi.mock('./FreePlayVisualizer', async () => {
  const actual = await vi.importActual<typeof import('./FreePlayVisualizer')>('./FreePlayVisualizer');

  return {
    ...actual,
    FreePlayVisualizer: ({
      mode,
      activeNotes,
      recentNotes,
      resetToken,
    }: {
      mode: string;
      activeNotes: number[];
      recentNotes: Array<{ id: string }>;
      resetToken: number;
    }) => {
      const label =
        actual.FREE_PLAY_VISUAL_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? mode;

      return (
        <div
          role="region"
          aria-label={`${label} visualizer`}
          data-active-notes={activeNotes.join(',')}
          data-recent-notes={String(recentNotes.length)}
          data-reset-token={String(resetToken)}
        >
          {label}
        </div>
      );
    },
  };
});

const gradientStub = {
  addColorStop: vi.fn(),
};

HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  ellipse: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  clip: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  drawImage: vi.fn(),
  measureText: vi.fn(() => ({ width: 80 })),
  createLinearGradient: vi.fn(() => gradientStub),
  createRadialGradient: vi.fn(() => gradientStub),
})) as never;

class MockMidiInputService {
  private listeners = new Set<(event: InputEvent) => void>();

  private deviceListeners = new Set<(devices: MidiInputDevice[]) => void>();

  subscribe(listener: (event: InputEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeDevices(listener: (devices: MidiInputDevice[]) => void): () => void {
    this.deviceListeners.add(listener);
    listener([]);
    return () => {
      this.deviceListeners.delete(listener);
    };
  }

  emit(event: InputEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}

class MockKeyboardInputService {
  private listeners = new Set<(event: InputEvent) => void>();

  private stateListeners = new Set<(state: KeyboardInputState) => void>();

  subscribe(listener: (event: InputEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeState(listener: (state: KeyboardInputState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  getState(): KeyboardInputState {
    return {
      octaveShift: 0,
      mapping: {} as KeyboardInputState['mapping'],
    };
  }
}

function buildAudioEngineStub(): AudioEngine {
  return {
    prepareForPlayback: vi.fn().mockResolvedValue(undefined),
    init: vi.fn().mockResolvedValue(undefined),
    noteOn: vi.fn().mockResolvedValue(undefined),
    noteOff: vi.fn(),
    allNotesOff: vi.fn(),
    setPitchBend: vi.fn(),
    setModulation: vi.fn(),
    setSustain: vi.fn(),
    playMetronomeClick: vi.fn().mockResolvedValue(undefined),
    loadBackingTrack: vi.fn().mockResolvedValue(undefined),
    setBackingTrackVolume: vi.fn(),
    playBackingTrack: vi.fn(),
    pauseBackingTrack: vi.fn(),
    stopBackingTrack: vi.fn(),
    renderRecordingToWav: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  } as unknown as AudioEngine;
}

describe('FreePlayScreen', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.appBridge = {
      getSetting: vi.fn().mockResolvedValue(null),
      pickAudioFile: vi.fn().mockResolvedValue({
        path: 'C:\\Audio\\jam.mp3',
        name: 'jam.mp3',
      }),
      saveMidiFile: vi.fn().mockResolvedValue('C:\\Exports\\free-play.mid'),
      saveWavFile: vi.fn().mockResolvedValue('C:\\Exports\\free-play.wav'),
    } as unknown as typeof window.appBridge;
  });

  it('warms audio on first pointer interaction before note playback', () => {
    const audioEngine = buildAudioEngineStub();

    render(
      <FreePlayScreen
        audioEngine={audioEngine}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByRole('main'));

    expect(audioEngine.prepareForPlayback).toHaveBeenCalledTimes(1);
  });

  it('toggles the immersive overlay with Escape', () => {
    render(
      <FreePlayScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    expect(screen.getByTestId('free-play-visual-popout')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Free Play' })).toBeInTheDocument();
    expect(screen.getByTestId('free-play-visual-popout')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Free Play' })).not.toBeInTheDocument();
  });

  it('opens the visual mode popout from the top-right toggle', () => {
    render(
      <FreePlayScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    expect(screen.getByTestId('free-play-visual-popout')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Show visual mode controls' }));

    const popout = screen.getByTestId('free-play-visual-popout');

    expect(popout).toHaveAttribute('aria-hidden', 'false');
    expect(within(popout).getByRole('heading', { name: 'Classic Piano' })).toBeInTheDocument();
    expect(within(popout).getByRole('button', { name: 'Ink in Water' })).toBeInTheDocument();
    expect(within(popout).getByRole('button', { name: 'Tree of Light' })).toBeInTheDocument();
    expect(within(popout).getByRole('button', { name: 'Particle Galaxy' })).toBeInTheDocument();
    expect(within(popout).getByRole('button', { name: 'Aurora Borealis' })).toBeInTheDocument();
    expect(within(popout).getByRole('button', { name: 'Fireworks' })).toBeInTheDocument();
  });

  it('reveals visual mode descriptions from compact info controls', () => {
    render(
      <FreePlayScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show visual mode controls' }));
    const popout = screen.getByTestId('free-play-visual-popout');
    fireEvent.click(within(popout).getByRole('button', { name: 'Ink in Water info' }));

    expect(within(popout).getByText(/watercolor built from your session/i)).toBeInTheDocument();
  });

  it('opens the instrument and visual popouts from the HUD controls', () => {
    render(
      <FreePlayScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show instrument controls' }));
    expect(screen.getByTestId('immersive-instrument-popout')).toHaveAttribute('aria-hidden', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Show visual mode controls' }));
    expect(screen.getByTestId('free-play-visual-popout')).toHaveAttribute('aria-hidden', 'false');
  });

  it('opens the visual mode popout on hover and closes it on click when already open', () => {
    render(
      <FreePlayScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    const toggleButton = screen.getByRole('button', { name: 'Show visual mode controls' });
    const popout = screen.getByTestId('free-play-visual-popout');

    fireEvent.mouseEnter(toggleButton);
    expect(popout).toHaveAttribute('aria-hidden', 'false');

    fireEvent.click(toggleButton);
    expect(popout).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps the visual popout open while moving from the toggle into the panel', () => {
    render(
      <FreePlayScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    const toggleButton = screen.getByRole('button', { name: 'Show visual mode controls' });
    const popout = screen.getByTestId('free-play-visual-popout');

    fireEvent.mouseEnter(toggleButton);
    fireEvent.mouseLeave(toggleButton);
    fireEvent.mouseEnter(popout);

    expect(popout).toHaveAttribute('aria-hidden', 'false');
  });

  it('changes the active instrument from the immersive HUD', () => {
    const onInstrumentChange = vi.fn();

    render(
      <FreePlayScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={onInstrumentChange}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Show instrument controls' }));
    const popout = screen.getByRole('region', { name: 'Instrument controls' });
    fireEvent.click(within(popout).getByRole('button', { name: 'Electric Piano' }));

    expect(onInstrumentChange).toHaveBeenCalledWith('electric-piano');
  });

  it('keeps the immersive HUD action buttons clickable', () => {
    render(
      <FreePlayScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show instrument controls' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show visual mode controls' }));

    expect(screen.getByTestId('immersive-instrument-popout')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByTestId('free-play-visual-popout')).toHaveAttribute('aria-hidden', 'false');
  });

  it('closes the pinned visual mode popout on outside pointer down', () => {
    render(
      <FreePlayScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    const toggleButton = screen.getByRole('button', { name: 'Show visual mode controls' });
    const popout = screen.getByTestId('free-play-visual-popout');

    fireEvent.click(toggleButton);
    expect(popout).toHaveAttribute('aria-hidden', 'false');

    fireEvent.pointerDown(document.body);

    expect(popout).toHaveAttribute('aria-hidden', 'true');
  });

  it('closes the pinned visual popout when another stage control is clicked', () => {
    render(
      <FreePlayScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    const popout = screen.getByTestId('free-play-visual-popout');
    fireEvent.click(screen.getByRole('button', { name: 'Show visual mode controls' }));
    fireEvent.pointerDown(screen.getByRole('region', { name: 'Classic Piano visualizer' }));

    expect(popout).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps recording and backing-track state when switching visual modes', async () => {
    const midiService = new MockMidiInputService();
    const audioEngine = buildAudioEngineStub();
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);

    render(
      <FreePlayScreen
        audioEngine={audioEngine}
        midiInputService={midiService as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Menu'));
    const visualizer = screen.getByRole('region', { name: 'Classic Piano visualizer' });
    fireEvent.click(screen.getByText('Record'));

    await act(async () => {
      midiService.emit({
        type: 'noteon',
        source: 'midi',
        sourceId: 'controller-1',
        timestamp: 1100,
        note: 60,
        velocity: 0.9,
      });
      midiService.emit({
        type: 'noteoff',
        source: 'midi',
        sourceId: 'controller-1',
        timestamp: 1250,
        note: 60,
        velocity: 0,
      });
    });

    nowSpy.mockReturnValue(1300);
    fireEvent.click(screen.getByText('Stop Recording'));
    fireEvent.click(screen.getByText('Load Track'));

    expect(await screen.findByText('jam.mp3')).toBeInTheDocument();
    expect(screen.getAllByText('1 note').length).toBeGreaterThan(0);
    expect(visualizer).toHaveAttribute('data-reset-token', '0');
    expect(visualizer).toHaveAttribute('data-recent-notes', '1');

    fireEvent.click(screen.getByRole('button', { name: 'Show visual mode controls' }));
    const popout = screen.getByTestId('free-play-visual-popout');
    fireEvent.click(within(popout).getByRole('button', { name: 'Ink in Water' }));

    expect(screen.getByRole('region', { name: 'Ink in Water visualizer' })).toBeInTheDocument();
    expect(screen.getByText('jam.mp3')).toBeInTheDocument();
    expect(screen.getAllByText('1 note').length).toBeGreaterThan(0);
    expect(screen.getByText('Play Recording')).toBeEnabled();
    expect(screen.getByRole('region', { name: 'Ink in Water visualizer' })).toHaveAttribute('data-reset-token', '1');
    expect(screen.getByRole('region', { name: 'Ink in Water visualizer' })).toHaveAttribute('data-recent-notes', '0');
    expect(screen.getByRole('region', { name: 'Ink in Water visualizer' })).toHaveAttribute('data-active-notes', '');

    nowSpy.mockRestore();
  });

  it('visual preset buttons appear in the popout and switching preset does not interrupt recording or backing track', async () => {
    const midiService = new MockMidiInputService();
    const audioEngine = buildAudioEngineStub();
    vi.spyOn(performance, 'now').mockReturnValue(1000);

    render(
      <FreePlayScreen
        audioEngine={audioEngine}
        midiInputService={midiService as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Show visual mode controls' }));
    const popout = screen.getByTestId('free-play-visual-popout');

    expect(within(popout).getByText('Intensity')).toBeInTheDocument();

    // Intensity buttons are present
    expect(within(popout).getByRole('button', { name: 'Subtle' })).toBeInTheDocument();
    expect(within(popout).getByRole('button', { name: 'Balanced' })).toBeInTheDocument();
    expect(within(popout).getByRole('button', { name: 'Vivid' })).toBeInTheDocument();

    // Start recording and load a backing track
    fireEvent.click(screen.getByText('Menu'));
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load Track' }));
    expect(await screen.findByText('jam.mp3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Show visual mode controls' }));

    // Switch preset — should not clear recording or backing track
    fireEvent.click(within(popout).getByRole('button', { name: 'Vivid' }));
    expect(screen.getAllByText(/jam\.mp3/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText('Menu'));
    expect(screen.getByRole('button', { name: 'Stop Recording' })).toBeInTheDocument();
    expect(screen.getByText('jam.mp3')).toBeInTheDocument();

    // Switch back
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Show visual mode controls' }));
    fireEvent.click(within(popout).getByRole('button', { name: 'Subtle' }));
    expect(screen.getAllByText(/jam\.mp3/).length).toBeGreaterThan(0);

    vi.restoreAllMocks();
  });

  it('ignores pitch-bend events when pitch bend is disabled', async () => {
    const midiService = new MockMidiInputService();
    const audioEngine = buildAudioEngineStub();

    render(
      <FreePlayScreen
        audioEngine={audioEngine}
        midiInputService={midiService as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled={false}
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    await act(async () => {
      midiService.emit({
        type: 'pitchbend',
        source: 'midi',
        sourceId: 'controller-1',
        timestamp: 1100,
        pitchBendValue: 0.5,
      });
    });

    expect(audioEngine.setPitchBend).not.toHaveBeenCalled();
  });

  it('shows locked palette rewards with a clear unlock explanation', () => {
    render(
      <FreePlayScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
        unlockedRewardIds={new Set()}
      />,
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByRole('button', { name: /Aurora Emerald/ })).toBeDisabled();
    expect(screen.getByText(/Unlock: Unlocked by reaching 100% accuracy\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Constellation Galactic/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Show visual mode controls' }));
    const popout = screen.getByTestId('free-play-visual-popout');
    expect(within(popout).getByRole('button', { name: 'Particle Galaxy' })).toBeEnabled();
    expect(within(popout).getByRole('button', { name: 'Sacred Geometry' })).toBeEnabled();
  });

  it('keeps backing-track volume session-only when persistence rejects', async () => {
    const setSetting = vi.fn().mockRejectedValue(new Error('write failed'));
    window.appBridge = {
      getSetting: vi.fn().mockResolvedValue('70'),
      setSetting,
    } as unknown as typeof window.appBridge;

    render(
      <FreePlayScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        postureReminderMinutes={null}
        breakReminderMinutes={null}
        pitchBendEnabled
        stagePalette="default"
        instrumentId="acoustic-piano"
        onBackToMainMenu={vi.fn()}
        onInstrumentChange={vi.fn()}
        onStagePaletteChange={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Menu'));
    fireEvent.change(screen.getAllByRole('slider')[1], { target: { value: '42' } });

    await waitFor(() => expect(screen.getByText(/Backing track volume is active for this session only/)).toBeInTheDocument());
    expect(setSetting).toHaveBeenCalledWith('audio', 'backingTrackVolume', '42');
  });
});
