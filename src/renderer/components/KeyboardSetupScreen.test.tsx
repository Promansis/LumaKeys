import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INPUT_MODE_SETTING_KEY,
  INPUT_SETTINGS_CATEGORY,
  createDefaultKeyboardMapping,
} from '../../lib/input/settings';
import type { ComputerKeyboardInputService } from '../../lib/input/computerKeyboardInputService';
import type { InputEvent, KeyboardInputState, KeyboardMapping } from '../../lib/input/types';
import { KeyboardSetupScreen } from './KeyboardSetupScreen';

class MockKeyboardInputService {
  private mapping: KeyboardMapping = createDefaultKeyboardMapping();

  private octaveShift = 0;

  private inputListeners = new Set<(event: InputEvent) => void>();

  private stateListeners = new Set<(state: KeyboardInputState) => void>();

  suspended = false;

  subscribe(listener: (event: InputEvent) => void): () => void {
    this.inputListeners.add(listener);
    return () => {
      this.inputListeners.delete(listener);
    };
  }

  subscribeState(listener: (state: KeyboardInputState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  getMapping(): KeyboardMapping {
    return { ...this.mapping };
  }

  getState(): KeyboardInputState {
    return {
      octaveShift: this.octaveShift,
      mapping: { ...this.mapping },
    };
  }

  setMapping(mapping: KeyboardMapping): void {
    this.mapping = { ...mapping };
    const state = this.getState();
    this.stateListeners.forEach((listener) => listener(state));
  }

  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
  }
}

describe('KeyboardSetupScreen', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.appBridge = {
      getSetting: vi.fn().mockResolvedValue(null),
      setSetting: vi.fn().mockResolvedValue(undefined),
    } as unknown as typeof window.appBridge;
  });

  it('renders the real-piano computer keyboard bindings', async () => {
    render(
      <KeyboardSetupScreen
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        onInputModeChange={vi.fn()}
      />,
    );

    await screen.findByText('34-note piano layout');

    expect(screen.getByRole('button', { name: 'Bind C3 to Z' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bind C#4 to L' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bind D#4 to ;' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bind F4 to Q' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bind F#4 to 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bind G#5 to 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bind A5 to P' })).toBeInTheDocument();
  });

  it('enters capture mode when a mapped piano key is clicked', async () => {
    const service = new MockKeyboardInputService();

    render(
      <KeyboardSetupScreen
        keyboardInputService={service as unknown as ComputerKeyboardInputService}
        inputMode="both"
        onInputModeChange={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Bind C3 to Z' }));

    expect(screen.getByText('Press a key to bind C3. Press Escape to cancel.')).toBeInTheDocument();
    await waitFor(() => {
      expect(service.suspended).toBe(true);
    });
  });

  it('delegates input mode persistence to the parent app shell', async () => {
    const onInputModeChange = vi.fn();

    render(
      <KeyboardSetupScreen
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        onInputModeChange={onInputModeChange}
      />,
    );

    fireEvent.change(await screen.findByLabelText('Input Mode'), { target: { value: 'midi' } });

    expect(onInputModeChange).toHaveBeenCalledWith('midi');
    expect(window.appBridge?.setSetting).not.toHaveBeenCalledWith(
      INPUT_SETTINGS_CATEGORY,
      INPUT_MODE_SETTING_KEY,
      'midi',
    );
  });

  it('does not claim a rejected binding was saved and preserves restart read-back', async () => {
    const getSetting = vi.fn().mockResolvedValue('{"note-c3":"Z"}');
    const setSetting = vi.fn().mockRejectedValue(new Error('write failed'));
    window.appBridge = { getSetting, setSetting } as unknown as typeof window.appBridge;

    render(
      <KeyboardSetupScreen
        keyboardInputService={new MockKeyboardInputService() as unknown as ComputerKeyboardInputService}
        inputMode="both"
        onInputModeChange={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Bind C3 to Z' }));
    fireEvent.keyDown(window, { code: 'KeyA' });

    await waitFor(() => {
      expect(screen.getByText(/Mapping active for this session only/)).toBeInTheDocument();
    });
    expect(screen.queryByText('C3 set to A.')).not.toBeInTheDocument();
    await expect(getSetting(INPUT_SETTINGS_CATEGORY, 'keyboardMapping')).resolves.toBe('{"note-c3":"Z"}');
  });

  it('keeps a note the player unbound unbound after a reload', async () => {
    window.appBridge = {
      getSetting: vi.fn().mockResolvedValue(JSON.stringify({ 'note-0': null, 'note-1': 'KeyS' })),
      setSetting: vi.fn().mockResolvedValue(undefined),
    } as unknown as typeof window.appBridge;
    const service = new MockKeyboardInputService();

    render(
      <KeyboardSetupScreen
        keyboardInputService={service as unknown as ComputerKeyboardInputService}
        inputMode="both"
        onInputModeChange={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Bind C3 to Unbound' })).toBeInTheDocument();
    expect(service.getMapping()['note-0']).toBeNull();
    expect(window.appBridge?.setSetting).not.toHaveBeenCalled();
  });

  it('catches rejected clear and reset writes', async () => {
    const setSetting = vi.fn().mockRejectedValue(new Error('write failed'));
    window.appBridge = {
      getSetting: vi.fn().mockResolvedValue(null),
      setSetting,
    } as unknown as typeof window.appBridge;
    const service = new MockKeyboardInputService();

    render(
      <KeyboardSetupScreen
        keyboardInputService={service as unknown as ComputerKeyboardInputService}
        inputMode="both"
        onInputModeChange={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Bind C3 to Z' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear' })[0]);
    await waitFor(() => expect(screen.getByText(/Mapping active for this session only/)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Reset Mapping' }));
    await waitFor(() => expect(setSetting).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/Mapping active for this session only/)).toBeInTheDocument();
  });
});
