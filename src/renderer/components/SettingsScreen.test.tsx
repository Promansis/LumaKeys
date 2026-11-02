import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsScreen } from './SettingsScreen';

describe('SettingsScreen', () => {
  const resetUserData = vi.fn().mockResolvedValue(undefined);
  const resetLearningProgress = vi.fn().mockResolvedValue(undefined);
  const developerUnlockAll = vi.fn().mockResolvedValue(undefined);
  const onLearningProgressReset = vi.fn();
  const onUserDataReset = vi.fn();
  const renderSettingsScreen = (
    overrides: Partial<React.ComponentProps<typeof SettingsScreen>> = {},
  ) => render(
    <SettingsScreen
      audioEngine={{ playMetronomeClick: vi.fn().mockResolvedValue(undefined), prepareForPlayback: vi.fn().mockResolvedValue(undefined) } as unknown as import('../../lib/audio/audioEngine').AudioEngine}
      inputMode="both"
      midiDevices={[]}
      midiError={false}
      instrumentSamplePackStatuses={{}}
      pitchBendEnabled
      onInstallInstrumentSamplePack={vi.fn().mockResolvedValue(undefined)}
      onRemoveInstrumentSamplePack={vi.fn().mockResolvedValue(undefined)}
      onDeveloperUnlockAll={developerUnlockAll}
      onLearningProgressReset={onLearningProgressReset}
      onSettingChange={vi.fn()}
      onInputModeChange={vi.fn()}
      onRetryMidi={vi.fn()}
      onUserDataReset={onUserDataReset}
      onOpenKeyboardSetup={vi.fn()}
      {...overrides}
    />,
  );

  beforeEach(() => {
    window.appBridge = {
      getSetting: vi.fn().mockResolvedValue(null),
      setSetting: vi.fn().mockResolvedValue(undefined),
      listAudioFiles: vi.fn().mockResolvedValue([]),
      resetLearningProgress,
      resetUserData,
    } as unknown as typeof window.appBridge;
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetLearningProgress.mockClear();
    resetUserData.mockClear();
    developerUnlockAll.mockClear();
    onLearningProgressReset.mockClear();
    onUserDataReset.mockClear();
  });

  it('does not reset learning progress when modal confirmation is cancelled', async () => {
    localStorage.setItem('lumakeys-filter-presets', '{"demo":true}');

    renderSettingsScreen();

    fireEvent.click(await screen.findByText('Practice'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Learning Progress' }));

    expect(screen.getAllByRole('button', { name: 'Clear Learning Progress' })).toHaveLength(2);

    // Click cancel — reset should NOT fire
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => {
      expect(resetLearningProgress).not.toHaveBeenCalled();
      expect(resetUserData).not.toHaveBeenCalled();
      expect(localStorage.getItem('lumakeys-filter-presets')).toBe('{"demo":true}');
    });
  });

  const REMOVED_STORES = [
    'songs',
    'playlists',
    'folders',
    'results',
    'practice history and streak',
    'achievements',
    'fingerings',
    'trouble spots',
    'lesson progress',
    'saved settings',
    'installed instrument packs',
  ];

  it('names every store the desktop reset removes on the card and in the dialog', async () => {
    vi.stubGlobal('IS_WEB', false);
    renderSettingsScreen();

    fireEvent.click(await screen.findByText('Practice'));
    const card = screen.getByText('Delete User Data', { selector: 'span' }).closest('article') as HTMLElement;
    const dialogCopy = () => (screen.getByRole('dialog').textContent ?? '');

    for (const store of REMOVED_STORES) {
      expect(card.textContent).toContain(store);
    }
    expect(card.textContent).toContain('from this device');
    expect(card.textContent).not.toContain('server');

    fireEvent.click(screen.getByRole('button', { name: 'Delete User Data' }));
    for (const store of REMOVED_STORES) {
      expect(dialogCopy()).toContain(store);
    }
    expect(dialogCopy()).toContain('from this device');
    expect(dialogCopy()).not.toContain('server');
  });

  it('says on the web that the data is on the server and affects every browser', async () => {
    vi.stubGlobal('IS_WEB', true);
    renderSettingsScreen();

    fireEvent.click(await screen.findByText('Practice'));
    const card = screen.getByText('Delete User Data', { selector: 'span' }).closest('article') as HTMLElement;

    for (const store of REMOVED_STORES) {
      expect(card.textContent).toContain(store);
    }
    expect(card.textContent).toContain('from the server');
    expect(card.textContent).toContain('every browser that uses it');
    expect(card.textContent).not.toContain('from this device');

    fireEvent.click(screen.getByRole('button', { name: 'Delete User Data' }));
    const dialog = screen.getByRole('dialog').textContent ?? '';
    for (const store of REMOVED_STORES) {
      expect(dialog).toContain(store);
    }
    expect(dialog).toContain('from the server');
    expect(dialog).toContain('every browser that uses it');
    expect(dialog).not.toContain('from this device');
  });

  it('keeps all five settings tabs and action button names after adding decorative icons', async () => {
    const { container } = renderSettingsScreen();

    const tabNames = ['Audio', 'Visual', 'Gameplay', 'Input', 'Practice'];
    for (const tabName of tabNames) {
      expect(await screen.findByRole('tab', { name: tabName })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('tab')).toHaveLength(tabNames.length);

    expect(container.querySelector('.settings-panel')).toContainElement(screen.getByRole('tablist', { name: 'Settings sections' }));
    expect(container.querySelector('#settings-panel-audio')).toHaveClass('settings-content-grid-audio');
    expect(screen.getByRole('button', { name: 'Calibrate…' })).toBeInTheDocument();

    for (const tabName of tabNames) {
      fireEvent.click(screen.getByRole('tab', { name: tabName }));
      expect(screen.getByRole('tabpanel', { name: tabName })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole('tab', { name: 'Input' }));
    expect(screen.getByRole('button', { name: 'Edit Key Layout' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Practice' }));
    expect(screen.getByRole('button', { name: 'Clear Learning Progress' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Learning Progress' }));
    expect(screen.getAllByRole('button', { name: 'Clear Learning Progress' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('keeps advanced audio controls hidden until requested', async () => {
    renderSettingsScreen();

    expect(await screen.findByText('Playback Mix')).toBeInTheDocument();
    expect(screen.queryByLabelText('Acoustic Piano Reverb Shape')).not.toBeInTheDocument();
    expect(screen.queryByText('Locked Sound Controls')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show Advanced Options' }));

    expect(screen.getByLabelText('Acoustic Piano Reverb Shape')).toBeInTheDocument();
    expect(screen.getByText('Locked Sound Controls')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide Advanced Options' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('relies on the header save signal instead of a duplicate practice save card', async () => {
    renderSettingsScreen();

    fireEvent.click(await screen.findByText('Practice'));

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.queryByText('Save State')).not.toBeInTheDocument();
    expect(screen.queryByText('All changes saved')).not.toBeInTheDocument();
  });

  it('resets learning progress when modal confirmation is confirmed', async () => {
    renderSettingsScreen();

    fireEvent.click(await screen.findByText('Practice'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Learning Progress' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear Learning Progress' })[1]);

    await waitFor(() => {
      expect(resetLearningProgress).toHaveBeenCalledOnce();
      expect(onLearningProgressReset).toHaveBeenCalledOnce();
    });
  });

  it('persists per-instrument reverb overrides when the Music Theorist reward is unlocked', async () => {
    const onSettingChange = vi.fn();
    const appBridge = window.appBridge!;
    appBridge.getSetting = vi.fn(async (category: string, key: string) => {
      if (category === 'audio' && key === 'instrumentId') {
        return 'acoustic-piano';
      }
      return null;
    }) as typeof appBridge.getSetting;

    renderSettingsScreen({
      unlockedRewardIds: new Set(['audio:reverb-customization']),
      onSettingChange,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Show Advanced Options' }));
    fireEvent.change(await screen.findByLabelText('Acoustic Piano Reverb Shape'), { target: { value: 'hall' } });

    await waitFor(() => {
      expect(onSettingChange).toHaveBeenCalledWith(
        'audio',
        'instrumentReverbPresets',
        JSON.stringify({ 'acoustic-piano': 'hall' }),
      );
    });
  });

  it('persists audio controls through the bridge after the layout simplification', async () => {
    const onSettingChange = vi.fn();

    renderSettingsScreen({ onSettingChange });

    fireEvent.change(await screen.findByRole('slider', { name: 'Master Volume' }), { target: { value: '55' } });

    await waitFor(() => {
      expect(onSettingChange).toHaveBeenCalledWith('audio', 'masterVolume', '55');
      expect(window.appBridge?.setSetting).toHaveBeenCalledWith('audio', 'masterVolume', '55');
    });
  });

  it('coalesces rapid range changes into one bridge write', async () => {
    const onSettingChange = vi.fn();

    renderSettingsScreen({ onSettingChange });

    const masterVolume = await screen.findByRole('slider', { name: 'Master Volume' });
    fireEvent.change(masterVolume, { target: { value: '51' } });
    fireEvent.change(masterVolume, { target: { value: '52' } });
    fireEvent.change(masterVolume, { target: { value: '53' } });

    expect(onSettingChange).toHaveBeenCalledWith('audio', 'masterVolume', '51');
    expect(onSettingChange).toHaveBeenCalledWith('audio', 'masterVolume', '52');
    expect(onSettingChange).toHaveBeenCalledWith('audio', 'masterVolume', '53');

    await waitFor(() => {
      expect(window.appBridge?.setSetting).toHaveBeenCalledTimes(1);
      expect(window.appBridge?.setSetting).toHaveBeenCalledWith('audio', 'masterVolume', '53');
    });
  });

  it('shows saxophone as an available instrument option', async () => {
    renderSettingsScreen();

    const instrumentSelect = await screen.findByRole('combobox', { name: 'Instrument' });
    expect(screen.getByRole('option', { name: 'Saxophone' })).toBeEnabled();
    expect(instrumentSelect).toContainElement(screen.getByRole('option', { name: 'Saxophone' }));
  });

  it('unlocks developer content only after confirmation', async () => {
    vi.stubEnv('DEV', true);
    renderSettingsScreen();

    fireEvent.click(await screen.findByText('Practice'));
    fireEvent.click(screen.getByRole('button', { name: 'Unlock Test Content' }));

    expect(screen.getAllByRole('button', { name: 'Unlock Test Content' })).toHaveLength(2);
    expect(developerUnlockAll).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Unlock Test Content' })[1]);

    await waitFor(() => {
      expect(developerUnlockAll).toHaveBeenCalledOnce();
    });
  });

  it('hides developer unlock controls outside dev mode', async () => {
    vi.stubEnv('DEV', false);

    renderSettingsScreen();

    fireEvent.click(await screen.findByText('Practice'));

    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Unlock Test Content' })).not.toBeInTheDocument();
  });

  it('shows unset practice reminder defaults as off', async () => {
    renderSettingsScreen();

    fireEvent.click(await screen.findByText('Practice'));

    expect(screen.getByLabelText('Daily Goal (minutes)')).toHaveValue(0);
    expect(screen.getByLabelText('Posture Reminder (minutes)')).toHaveValue(0);
    expect(screen.getByLabelText('Break Reminder (minutes)')).toHaveValue(0);
  });

  it('delegates input mode persistence to the parent app shell', async () => {
    const onInputModeChange = vi.fn();
    const onSettingChange = vi.fn();

    renderSettingsScreen({ onInputModeChange, onSettingChange });

    fireEvent.click(await screen.findByText('Input'));
    fireEvent.change(screen.getByLabelText('Play Notes With'), { target: { value: 'midi' } });

    expect(onInputModeChange).toHaveBeenCalledWith('midi');
    expect(onSettingChange).toHaveBeenCalledWith('input', 'mode', 'midi');
    expect(window.appBridge?.setSetting).not.toHaveBeenCalledWith('input', 'mode', 'midi');
  });

  describe('saved MIDI device that is not connected', () => {
    const savedDeviceBridge = () => {
      window.appBridge = {
        ...window.appBridge!,
        getSetting: vi.fn(async (category: string, key: string) =>
          category === 'input' && key === 'midiDeviceId' ? 'gone-1' : null),
      } as unknown as typeof window.appBridge;
    };

    it('names the missing device on the card and in the select instead of reading Any connected device', async () => {
      savedDeviceBridge();
      renderSettingsScreen({ midiDevices: [{ id: 'fake-2', name: 'Fake Second Keys' }] });

      fireEvent.click(await screen.findByText('Input'));

      expect(await screen.findByText('Saved device not connected: gone-1', { selector: 'strong' })).toBeInTheDocument();
      expect(screen.queryByText('Any connected device', { selector: 'strong' })).not.toBeInTheDocument();
      const select = screen.getByLabelText('MIDI Device') as HTMLSelectElement;
      expect(select.value).toBe('gone-1');
      expect(select.selectedOptions[0]).toHaveTextContent('Saved device not connected: gone-1');
    });

    it('switches to any connected device in one click and saves that choice', async () => {
      savedDeviceBridge();
      const onSettingChange = vi.fn();
      renderSettingsScreen({ midiDevices: [{ id: 'fake-2', name: 'Fake Second Keys' }], onSettingChange });

      fireEvent.click(await screen.findByText('Input'));
      fireEvent.click(await screen.findByRole('button', { name: 'Use any connected device' }));

      expect(onSettingChange).toHaveBeenCalledWith('input', 'midiDeviceId', '');
      await waitFor(() => {
        expect(window.appBridge?.setSetting).toHaveBeenCalledWith('input', 'midiDeviceId', '');
      });
      expect(await screen.findByText('Any connected device', { selector: 'strong' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Use any connected device' })).not.toBeInTheDocument();
    });

    it('does not write the saved setting just by showing the missing device', async () => {
      savedDeviceBridge();
      const onSettingChange = vi.fn();
      renderSettingsScreen({ midiDevices: [], onSettingChange });

      fireEvent.click(await screen.findByText('Input'));
      await screen.findByText('Saved device not connected: gone-1', { selector: 'strong' });

      expect(onSettingChange).not.toHaveBeenCalledWith('input', 'midiDeviceId', expect.anything());
      expect(window.appBridge?.setSetting).not.toHaveBeenCalledWith('input', 'midiDeviceId', expect.anything());
    });

    it('still names a connected saved device and shows no repair button', async () => {
      savedDeviceBridge();
      renderSettingsScreen({ midiDevices: [{ id: 'gone-1', name: 'Fake Piano 88' }] });

      fireEvent.click(await screen.findByText('Input'));

      expect(await screen.findByText('Fake Piano 88', { selector: 'strong' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Use any connected device' })).not.toBeInTheDocument();
    });
  });

  it('keeps settings usable when saved settings fail to load', async () => {
    window.appBridge = {
      ...window.appBridge!,
      getSetting: vi.fn().mockRejectedValue(new Error('storage unavailable')),
    } as typeof window.appBridge;

    renderSettingsScreen();

    expect(await screen.findByText('Some saved settings could not be loaded. Defaults are active for this session.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Audio' })).toBeInTheDocument();
  });

  it('reports save failures without rolling back the active setting', async () => {
    const onSettingChange = vi.fn();
    window.appBridge = {
      ...window.appBridge!,
      setSetting: vi.fn().mockRejectedValue(new Error('write failed')),
    } as typeof window.appBridge;

    renderSettingsScreen({ onSettingChange });

    fireEvent.change(await screen.findByRole('slider', { name: 'Master Volume' }), { target: { value: '44' } });

    await waitFor(() => {
      expect(onSettingChange).toHaveBeenCalledWith('audio', 'masterVolume', '44');
      expect(screen.getByText('Save failed. The change is active for this session only.')).toBeInTheDocument();
    });
  });

  it('does not report a debounced setting saved before its write resolves', async () => {
    let resolveWrite!: () => void;
    const setSetting = vi.fn(() => new Promise<void>((resolve) => {
      resolveWrite = resolve;
    }));
    window.appBridge = {
      ...window.appBridge!,
      setSetting,
    } as typeof window.appBridge;

    renderSettingsScreen();
    fireEvent.change(await screen.findByRole('slider', { name: 'Master Volume' }), { target: { value: '46' } });

    await waitFor(() => expect(setSetting).toHaveBeenCalledWith('audio', 'masterVolume', '46'));
    expect(screen.queryByText('Changes saved.')).not.toBeInTheDocument();
    resolveWrite();
    await waitFor(() => expect(screen.getByText('Changes saved.')).toBeInTheDocument());
  });

  it('shows 0 for a posture reminder stored as the legacy "off"', async () => {
    window.appBridge = {
      ...window.appBridge!,
      getSetting: vi.fn(async (category: string, key: string) =>
        category === 'practice' && key === 'postureReminderMinutes' ? 'off' : null),
    } as unknown as typeof window.appBridge;

    renderSettingsScreen();

    fireEvent.click(await screen.findByRole('tab', { name: 'Practice' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Posture Reminder (minutes)')).toHaveValue(0);
    });
  });

  it('clamps numeric settings before saving', async () => {
    const onSettingChange = vi.fn();

    renderSettingsScreen({ onSettingChange });

    fireEvent.change(await screen.findByLabelText('Input Delay Fix (ms)'), { target: { value: '9999' } });

    await waitFor(() => {
      expect(onSettingChange).toHaveBeenCalledWith('audio', 'latencyCompMs', '300');
      expect(window.appBridge?.setSetting).toHaveBeenCalledWith('audio', 'latencyCompMs', '300');
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Practice' }));
    fireEvent.change(screen.getByLabelText('Posture Reminder (minutes)'), { target: { value: '-12' } });

    await waitFor(() => {
      expect(onSettingChange).toHaveBeenCalledWith('practice', 'postureReminderMinutes', '0');
      expect(window.appBridge?.setSetting).toHaveBeenCalledWith('practice', 'postureReminderMinutes', '0');
    });
  });

  it('cancels confirmation dialogs with Escape', async () => {
    renderSettingsScreen();

    fireEvent.click(await screen.findByText('Practice'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Learning Progress' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(resetLearningProgress).not.toHaveBeenCalled();
    });
  });

  it('keeps keyboard focus inside confirmation dialogs', async () => {
    renderSettingsScreen();

    fireEvent.click(await screen.findByText('Practice'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Learning Progress' }));

    const confirmButton = screen.getAllByRole('button', { name: 'Clear Learning Progress' })[1];
    const cancelButton = screen.getByRole('button', { name: 'Cancel' });

    expect(cancelButton).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(confirmButton).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(cancelButton).toHaveFocus();
  });

  it.each([
    ['Cancel button', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
  ])('returns focus to the trigger when %s closes a confirmation dialog, even after a re-render', async (_label, close) => {
    const { rerender } = renderSettingsScreen();

    fireEvent.click(await screen.findByText('Practice'));
    const trigger = screen.getByRole('button', { name: 'Clear Learning Progress' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    // A parent re-render hands the modal new inline callbacks while it is open.
    rerender(
      <SettingsScreen
        audioEngine={{ playMetronomeClick: vi.fn(), prepareForPlayback: vi.fn() } as unknown as import('../../lib/audio/audioEngine').AudioEngine}
        inputMode="both"
        midiDevices={[]}
        midiError={false}
        instrumentSamplePackStatuses={{}}
        pitchBendEnabled
        onInstallInstrumentSamplePack={vi.fn().mockResolvedValue(undefined)}
        onRemoveInstrumentSamplePack={vi.fn().mockResolvedValue(undefined)}
        onDeveloperUnlockAll={developerUnlockAll}
        onLearningProgressReset={onLearningProgressReset}
        onSettingChange={vi.fn()}
        onInputModeChange={vi.fn()}
        onRetryMidi={vi.fn()}
        onUserDataReset={onUserDataReset}
        onOpenKeyboardSetup={vi.fn()}
      />,
    );

    close();

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Clear Learning Progress' })).toHaveFocus();
  });

  it('supports standard arrow-key navigation for settings tabs', async () => {
    renderSettingsScreen();

    const audioTab = await screen.findByRole('tab', { name: 'Audio' });
    const visualTab = screen.getByRole('tab', { name: 'Visual' });
    const practiceTab = screen.getByRole('tab', { name: 'Practice' });

    audioTab.focus();
    fireEvent.keyDown(audioTab, { key: 'ArrowRight' });

    expect(visualTab).toHaveFocus();
    expect(visualTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(visualTab, { key: 'End' });

    expect(practiceTab).toHaveFocus();
    expect(practiceTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Practice' })).toBeInTheDocument();
  });
});
