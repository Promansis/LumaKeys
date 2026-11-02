import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../../lib/audio/audioEngine';
import type { ComputerKeyboardInputService } from '../../lib/input/computerKeyboardInputService';
import type { InputEvent, KeyboardInputState } from '../../lib/input/types';
import type { MidiInputService } from '../../lib/midi/midiInputService';
import { NoveltySoundboardScreen } from './NoveltySoundboardScreen';

class MockMidiInputService {
  private listeners = new Set<(event: InputEvent) => void>();

  subscribe(listener: (event: InputEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
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
    getOneShotDurationSec: vi.fn().mockResolvedValue(2),
    playOneShot: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioEngine;
}

function buildCanvasContextStub(): CanvasRenderingContext2D {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    stroke: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  } as unknown as CanvasRenderingContext2D;
}

describe('NoveltySoundboardScreen', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('handles every Escape before the app-level listener, however often the menu toggles', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(buildCanvasContextStub());
    const appLevelSawUnhandled = vi.fn();
    const appListener = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) appLevelSawUnhandled();
    };

    render(
      <NoveltySoundboardScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        onBackToMainMenu={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    // App's listener is added after the screen's at mount; a screen that re-registers on each
    // toggle ends up behind it.
    window.addEventListener('keydown', appListener);
    const expectedOpen = [true, false, true, false, true];
    for (const open of expectedOpen) {
      fireEvent.keyDown(window, { key: 'Escape' });
      if (open) {
        expect(screen.getByText('Soundboard Modes')).toBeInTheDocument();
      } else {
        expect(screen.queryByText('Soundboard Modes')).not.toBeInTheDocument();
      }
    }
    expect(appLevelSawUnhandled).not.toHaveBeenCalled();
    window.removeEventListener('keydown', appListener);
  });

  it('opens the immersive overlay with Escape, switches modes there, and keeps note triggering live', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(buildCanvasContextStub());
    const midiService = new MockMidiInputService();
    const audioEngine = buildAudioEngineStub();

    render(
      <NoveltySoundboardScreen
        audioEngine={audioEngine}
        midiInputService={midiService as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        onBackToMainMenu={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    expect(screen.queryByText('Soundboard Modes')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Animals$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Menu/i })).toBeInTheDocument();
    expect(screen.getByText('🪈', { selector: '.key-caption.custom' })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByText('Soundboard Modes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Animals Real animal calls/i }));
    expect(screen.getByRole('button', { name: /Show animal key map/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show Credits/i }));
    expect(screen.getByText('Animal sound credits')).toBeInTheDocument();
    expect(screen.getAllByText('🐶 Dog').length).toBeGreaterThan(0);
    expect(screen.getByText('🐶', { selector: '.key-caption.custom' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Soundboard Modes')).not.toBeInTheDocument();

    await act(async () => {
      midiService.emit({
        type: 'noteon',
        source: 'midi',
        sourceId: 'controller-1',
        timestamp: 1000,
        note: 36,
        velocity: 0.9,
      });
    });

    expect(audioEngine.playOneShot).toHaveBeenCalled();
    expect(screen.queryByAltText('Dog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('animal-emoji-burst')).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1600);
    });

    expect(screen.queryByAltText('Dog')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows the key map from the HUD in animal and classic modes', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(buildCanvasContextStub());
    render(
      <NoveltySoundboardScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        onBackToMainMenu={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /Animals Real animal calls/i }));
    fireEvent.click(screen.getByRole('button', { name: /Resume/i }));
    const popout = screen.getByTestId('animal-key-map-popout');
    expect(popout).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Show animal key map/i }));
    expect(popout).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText('Tap any animal')).toBeInTheDocument();
    expect(screen.getByText('🐶', { selector: '.soundboard-key-map-card .soundboard-card-emoji' })).toBeInTheDocument();
    expect(screen.getByText('Dog', { selector: '.soundboard-key-map-card strong' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show animal key map/i }));
    expect(popout).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /Classic Recorded cartoon/i }));
    fireEvent.click(screen.getByRole('button', { name: /Resume/i }));
    expect(screen.queryByRole('button', { name: /Show animal key map/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show sound key map/i })).toBeInTheDocument();
    expect(screen.getByTestId('animal-key-map-popout')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Show sound key map/i }));
    expect(screen.getByTestId('animal-key-map-popout')).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText('Tap any sound')).toBeInTheDocument();
    expect(screen.getByText(/Toy Whistle/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Menu/i })).toBeInTheDocument();
    expect(screen.getByText('🪈', { selector: '.key-caption.custom' })).toBeInTheDocument();
  });

  it('keeps soundboard popouts and the HUD open while moving into the panels', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(buildCanvasContextStub());
    render(
      <NoveltySoundboardScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        onBackToMainMenu={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    const modeToggle = screen.getByRole('button', { name: /Show soundboard mode controls/i });
    const modePopout = screen.getByTestId('soundboard-mode-popout');
    const hud = screen.getByTestId('immersive-hud-shell');

    fireEvent.mouseEnter(modeToggle);
    fireEvent.mouseLeave(modeToggle);
    fireEvent.mouseEnter(modePopout);

    expect(modePopout).toHaveAttribute('aria-hidden', 'false');
    expect(hud).toHaveClass('open');

    const mapToggle = screen.getByRole('button', { name: /Show sound key map/i });
    const mapPopout = screen.getByTestId('animal-key-map-popout');
    fireEvent.mouseEnter(mapToggle);
    fireEvent.mouseLeave(mapToggle);
    fireEvent.mouseEnter(mapPopout);

    expect(mapPopout).toHaveAttribute('aria-hidden', 'false');
    expect(hud).toHaveClass('open');
  });

  it('closes pinned soundboard popouts when clicking elsewhere on the stage', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(buildCanvasContextStub());
    render(
      <NoveltySoundboardScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        onBackToMainMenu={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    const modePopout = screen.getByTestId('soundboard-mode-popout');
    fireEvent.click(screen.getByRole('button', { name: /Show soundboard mode controls/i }));
    fireEvent.pointerDown(modePopout.closest('.animal-soundboard-stage')!);
    expect(modePopout).toHaveAttribute('aria-hidden', 'true');

    const mapPopout = screen.getByTestId('animal-key-map-popout');
    fireEvent.click(screen.getByRole('button', { name: /Show sound key map/i }));
    fireEvent.pointerDown(mapPopout.closest('.animal-soundboard-stage')!);
    expect(mapPopout).toHaveAttribute('aria-hidden', 'true');
  });

  it('switches between classic and animals from the HUD mode selector', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(buildCanvasContextStub());
    render(
      <NoveltySoundboardScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        onBackToMainMenu={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    expect(screen.getByText('Classic', { selector: '.immersive-hud-item strong' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show animal key map/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('soundboard-mode-popout')).toHaveAttribute('aria-hidden', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Show soundboard mode controls/i }));
    expect(screen.getByTestId('soundboard-mode-popout')).toHaveAttribute('aria-hidden', 'false');
    fireEvent.click(screen.getByRole('button', { name: /^Animals$/i }));

    expect(screen.getByText('Animals', { selector: '.immersive-hud-item strong' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show animal key map/i })).toBeInTheDocument();
    expect(screen.getByText('🐶', { selector: '.key-caption.custom' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Show soundboard mode controls/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Classic$/i }));

    expect(screen.getByText('Classic', { selector: '.immersive-hud-item strong' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show animal key map/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show sound key map/i })).toBeInTheDocument();
    expect(screen.getByText('🪈', { selector: '.key-caption.custom' })).toBeInTheDocument();
  });

  it('keeps visual effects live while suppressing overlapping animal audio', async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(buildCanvasContextStub());
    const midiService = new MockMidiInputService();
    const audioEngine = buildAudioEngineStub();

    render(
      <NoveltySoundboardScreen
        audioEngine={audioEngine}
        midiInputService={midiService as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        onBackToMainMenu={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /Animals Real animal calls/i }));
    fireEvent.click(screen.getByRole('button', { name: /Resume/i }));

    await act(async () => {
      midiService.emit({
        type: 'noteon',
        source: 'midi',
        sourceId: 'controller-1',
        timestamp: 1000,
        note: 36,
        velocity: 0.9,
      });
    });

    await act(async () => {
      midiService.emit({
        type: 'noteon',
        source: 'midi',
        sourceId: 'controller-2',
        timestamp: 1100,
        note: 37,
        velocity: 0.9,
      });
    });

    expect(audioEngine.playOneShot).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Cat', { selector: '.immersive-hud-item strong' })).toBeInTheDocument();
    expect(screen.getByText('🐱', { selector: '.soundboard-clip-card.active .soundboard-card-emoji' })).toBeInTheDocument();
    expect(screen.getByText('Cat', { selector: '.soundboard-clip-card.active strong' })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await act(async () => {
      midiService.emit({
        type: 'noteon',
        source: 'midi',
        sourceId: 'controller-3',
        timestamp: 3200,
        note: 38,
        velocity: 0.9,
      });
    });

    expect(audioEngine.playOneShot).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('keeps closed soundboard popouts inert and pins them on the first keyboard press', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(buildCanvasContextStub());
    render(
      <NoveltySoundboardScreen
        audioEngine={buildAudioEngineStub()}
        midiInputService={new MockMidiInputService() as unknown as MidiInputService}
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        keyboardOverlaySize="medium"
        onBackToMainMenu={vi.fn()}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    const cases = [
      { toggle: /Show soundboard mode controls/i, popout: screen.getByTestId('soundboard-mode-popout') },
      { toggle: /Show sound key map/i, popout: screen.getByTestId('animal-key-map-popout') },
    ];

    for (const { toggle, popout } of cases) {
      const button = screen.getByRole('button', { name: toggle });
      expect(popout).toHaveAttribute('inert');

      fireEvent.focus(button);
      fireEvent.click(button);
      fireEvent.blur(button);
      expect(popout).toHaveAttribute('aria-hidden', 'false');
      expect(popout).not.toHaveAttribute('inert');

      fireEvent.click(button);
      expect(popout).toHaveAttribute('aria-hidden', 'true');
      expect(popout).toHaveAttribute('inert');
    }
  });
});
