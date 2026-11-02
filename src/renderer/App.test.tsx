import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS } from '../lib/achievements/achievementDefinitions';
import { App, parseStoredAudioNumber } from './App';
import type { AchievementRow, SongRow } from '../shared/dbTypes';

const preloadSpy = vi.fn(() => Promise.resolve());
const unlockSpy = vi.fn(() => Promise.resolve());
const prepareForPlaybackSpy = vi.fn(() => Promise.resolve());
const setInstrumentSpy = vi.fn(() => Promise.resolve());
const setInstrumentReverbPresetSpy = vi.fn();
const clearCustomSamplerSpy = vi.fn(() => Promise.resolve());
const unlockAchievementSpy = vi.fn((_achievementId: string) => Promise.resolve());
const setSettingSpy = vi.fn().mockResolvedValue(undefined);
const setMasterVolumeSpy = vi.fn();
const setMetronomeVolumeSpy = vi.fn();
const setReverbLevelSpy = vi.fn();
const gameSourceChangeSpy = vi.fn();
const midiDeviceListeners = new Set<(devices: unknown[]) => void>();

vi.mock('./components/AchievementToast', () => ({
  AchievementToast: () => null,
}));

vi.mock('./components/MainMenuScreen', () => ({
  MainMenuScreen: ({
    onOpenLibrary,
    onOpenFreePlay,
    onOpenLearn,
    onOpenProgress,
    onOpenSoundboard,
    onOpenSettings,
    onStartSong,
  }: {
    onOpenLibrary: () => void;
    onOpenFreePlay: () => void;
    onOpenLearn: () => void;
    onOpenProgress: () => void;
    onOpenSoundboard: () => void;
    onOpenSettings: () => void;
    onStartSong: (song: SongRow) => void;
  }) => (
    <>
      <button onClick={onOpenLibrary}>Open Library</button>
      <button onClick={onOpenFreePlay}>Open Free Play</button>
      <button onClick={onOpenLearn}>Open Learn</button>
      <button onClick={onOpenProgress}>Open Progress</button>
      <button onClick={onOpenSoundboard}>Open Soundboard</button>
      <button onClick={onOpenSettings}>Open Settings</button>
      <button
        onClick={() => onStartSong({
          id: 'quick-song',
          title: 'Quick Song',
          artist: '',
          genre: '',
          filePath: '/tmp/quick.mid',
          difficulty: 3,
          durationSec: 60,
          bpm: 120,
          noteCount: 100,
          dateAdded: '2026-04-18T00:00:00.000Z',
          timesPlayed: 0,
          tags: [],
          isFavorite: false,
          folderId: null,
          trackAssignments: { left: 'left', right: 'right' },
        })}
      >
        Start Recommended Song
      </button>
    </>
  ),
}));

vi.mock('./components/LearnHubScreen', () => ({
  LearnHubScreen: ({
    onOpenLesson,
    onStartCapstone,
  }: {
    onOpenLesson: (lessonId: string) => void;
    onStartCapstone: (tierId: string) => void;
  }) => (
    <>
      <button onClick={() => onOpenLesson('novice-02-finger-numbers')}>Open Lesson</button>
      <button onClick={() => onStartCapstone('novice')}>Start Capstone</button>
    </>
  ),
}));

vi.mock('./components/LessonScreen', () => ({
  LessonScreen: ({ onStartDrill }: { onStartDrill: (lessonId: string, stepIndex: number) => void }) => (
    <>
      <div>Lesson</div>
      <button onClick={() => onStartDrill('novice-02-finger-numbers', 3)}>Start Drill</button>
    </>
  ),
}));

vi.mock('./components/FreePlayScreen', () => ({
  FreePlayScreen: ({
    instrumentId,
    onInstrumentChange,
  }: {
    instrumentId: string;
    onInstrumentChange: (instrumentId: string) => void;
  }) => (
    <>
      <div>Mock Free Play</div>
      <div data-testid="free-play-instrument">{instrumentId}</div>
      <button onClick={() => onInstrumentChange('organ')}>Switch Free Play Instrument</button>
    </>
  ),
}));

vi.mock('./components/NoveltySoundboardScreen', () => ({
  NoveltySoundboardScreen: () => <div>Mock Soundboard</div>,
}));

vi.mock('./components/SetupGuideScreen', () => ({
  SetupGuideScreen: () => <div>Setup</div>,
}));

vi.mock('./components/LibraryScreen', () => ({
  LibraryScreen: () => <div>Library</div>,
}));

vi.mock('./components/GameScreen', () => ({
  GameScreen: ({
    onOpenKeyboardSetup,
    initialSessionConfig,
    source,
  }: {
    onOpenKeyboardSetup: () => void;
    initialSessionConfig: { mode: string; waitForInput: boolean; leadInBeats?: number };
    source: { kind: string };
  }) => {
    // Mirrors GameScreen: its song-load effect re-runs whenever `source` changes identity.
    useEffect(() => {
      gameSourceChangeSpy(source.kind);
    }, [source]);
    return (
    <>
      <div>Game</div>
      <div data-testid="game-session-mode">{initialSessionConfig.mode}</div>
      <div data-testid="game-session-wait">{String(initialSessionConfig.waitForInput)}</div>
      <div data-testid="game-session-lead-in">{String(initialSessionConfig.leadInBeats)}</div>
      <div data-testid="game-source-kind">{source.kind}</div>
      <button onClick={onOpenKeyboardSetup}>Open Keyboard Setup</button>
    </>
    );
  },
}));

vi.mock('./components/ResultsScreen', () => ({
  ResultsScreen: () => <div>Results</div>,
}));

vi.mock('./components/TheoryHubScreen', () => ({
  TheoryHubScreen: () => <div>Theory</div>,
}));

vi.mock('./components/ProgressDashboardScreen', () => ({
  ProgressDashboardScreen: () => <div>Progress</div>,
}));

vi.mock('./components/SettingsScreen', () => ({
  SettingsScreen: ({
    onSettingChange,
    onInputModeChange,
    onDeveloperUnlockAll,
    onUserDataReset,
  }: {
    onSettingChange: (category: string, key: string, value: string) => void;
    onInputModeChange: (mode: 'both' | 'midi' | 'computer-keyboard') => void;
    onDeveloperUnlockAll: () => Promise<void>;
    onUserDataReset: () => void;
  }) => (
    <>
      <div>Settings</div>
      <button onClick={() => onSettingChange('visual', 'theme', 'neon')}>Select Neon</button>
      <button onClick={() => onInputModeChange('midi')}>Select MIDI Input</button>
      <button onClick={() => void onDeveloperUnlockAll()}>Unlock All Developer Content</button>
      <button onClick={onUserDataReset}>Trigger User Data Reset</button>
    </>
  ),
}));

vi.mock('./components/ScalePracticeScreen', () => ({
  ScalePracticeScreen: () => <div>Scale</div>,
}));

vi.mock('./components/IntervalTrainerScreen', () => ({
  IntervalTrainerScreen: () => <div>Interval</div>,
}));

vi.mock('./components/TheoryQuizScreen', () => ({
  TheoryQuizScreen: () => <div>Quiz</div>,
}));

vi.mock('./components/KeyboardSetupScreen', () => ({
  KeyboardSetupScreen: () => <div>Keyboard Setup</div>,
}));

vi.mock('../lib/audio/audioEngine', () => ({
  AudioEngine: class {
    preload = preloadSpy;
    unlock = unlockSpy;
    prepareForPlayback = prepareForPlaybackSpy;
    init() {
      return Promise.resolve();
    }
    setMasterVolume = setMasterVolumeSpy;
    setMetronomeVolume = setMetronomeVolumeSpy;
    setReverbLevel = setReverbLevelSpy;
    setInstrument = setInstrumentSpy;
    setInstrumentReverbPreset = setInstrumentReverbPresetSpy;
    setCustomSampler() {
      return Promise.resolve();
    }
    clearCustomSampler = clearCustomSamplerSpy;
    playOneShot() {
      return Promise.resolve();
    }
    setMetronomeSound() {}
  },
}));

vi.mock('../lib/midi/midiInputService', () => ({
  MidiInputService: class {
    subscribeDevices(listener: (devices: unknown[]) => void) {
      listener([]);
      midiDeviceListeners.add(listener);
      return () => {
        midiDeviceListeners.delete(listener);
      };
    }
    init() {
      return Promise.resolve();
    }
    dispose() {}
    setDeviceFilter() {}
  },
}));

vi.mock('../lib/input/computerKeyboardInputService', () => ({
  ComputerKeyboardInputService: class {
    init() {}
    dispose() {}
    setMapping() {}
  },
}));

vi.mock('../lib/midi/midiFileParser', () => ({
  parseMidiFile: vi.fn(() => ({
    id: 'capstone-novice',
    title: 'Capstone',
    ppq: 480,
    bpm: 120,
    durationSec: 2,
    tracks: [],
    notes: [],
  })),
}));

describe('parseStoredAudioNumber', () => {
  it('returns the fallback for a missing, empty or non-numeric value', () => {
    expect(parseStoredAudioNumber(null, 80)).toBe(80);
    expect(parseStoredAudioNumber(undefined, 80)).toBe(80);
    expect(parseStoredAudioNumber('', 80)).toBe(80);
    expect(parseStoredAudioNumber('   ', 80)).toBe(80);
    expect(parseStoredAudioNumber('loud', 80)).toBe(80);
  });

  it('keeps a stored number, including a saved zero', () => {
    expect(parseStoredAudioNumber('55', 80)).toBe(55);
    expect(parseStoredAudioNumber('0', 80)).toBe(0);
  });
});

describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    preloadSpy.mockClear();
    unlockSpy.mockClear();
    prepareForPlaybackSpy.mockClear();
    setInstrumentSpy.mockClear();
    setInstrumentReverbPresetSpy.mockClear();
    clearCustomSamplerSpy.mockClear();
    setMasterVolumeSpy.mockClear();
    setMetronomeVolumeSpy.mockClear();
    setReverbLevelSpy.mockClear();
    gameSourceChangeSpy.mockClear();
    midiDeviceListeners.clear();
    unlockAchievementSpy.mockClear();
    setSettingSpy.mockReset();
    setSettingSpy.mockResolvedValue(undefined);
    const achievements: AchievementRow[] = ACHIEVEMENTS.map((achievement) => ({
      id: achievement.id,
      unlockedAt: null,
    }));
    window.appBridge = {
      getSetting: vi.fn(async (category: string, key: string) => {
        if (category === 'onboarding' && key === 'setupComplete') {
          return 'true';
        }
        if (category === 'visual' && key === 'theme') {
          return 'light';
        }
        if (category === 'audio' && key === 'instrumentReverbPresets') {
          return JSON.stringify({ 'acoustic-piano': 'hall' });
        }
        return null;
      }),
      setSetting: setSettingSpy,
      listAudioFiles: vi.fn().mockResolvedValue([]),
      loadCurriculumMidi: vi.fn(async () => new Uint8Array([1, 2, 3])),
      getAllAchievements: vi.fn(async () =>
        achievements.map((achievement) => ({
          ...achievement,
        })),
      ),
      unlockAchievement: vi.fn(async (achievementId: string) => {
        unlockAchievementSpy(achievementId);
        const achievement = achievements.find((entry) => entry.id === achievementId);
        if (achievement) {
          achievement.unlockedAt = '2026-01-01T00:00:00.000Z';
        }
      }),
    } as unknown as typeof window.appBridge;
  });

  it('keeps the running game session when the MIDI device list changes', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Start Recommended Song'));
    expect(await screen.findByText('Game')).toBeInTheDocument();
    expect(gameSourceChangeSpy).toHaveBeenCalledTimes(1);

    act(() => {
      midiDeviceListeners.forEach((listener) => listener([{ id: 'fake-1', name: 'Fake Piano 88' }]));
    });
    act(() => {
      midiDeviceListeners.forEach((listener) => listener([]));
    });

    expect(screen.getByText('Game')).toBeInTheDocument();
    expect(gameSourceChangeSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps a running lesson drill when the MIDI device list changes', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Open Learn'));
    fireEvent.click(await screen.findByText('Open Lesson'));
    fireEvent.click(await screen.findByText('Start Drill'));
    expect(await screen.findByText('Game')).toBeInTheDocument();
    expect(gameSourceChangeSpy).toHaveBeenCalledTimes(1);

    act(() => {
      midiDeviceListeners.forEach((listener) => listener([{ id: 'fake-1', name: 'Fake Piano 88' }]));
    });

    expect(gameSourceChangeSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps a running capstone when the MIDI device list changes', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Open Learn'));
    fireEvent.click(await screen.findByText('Start Capstone'));
    expect(await screen.findByText('Game')).toBeInTheDocument();
    expect(gameSourceChangeSpy).toHaveBeenCalledTimes(1);

    act(() => {
      midiDeviceListeners.forEach((listener) => listener([{ id: 'fake-1', name: 'Fake Piano 88' }]));
    });

    expect(gameSourceChangeSpy).toHaveBeenCalledTimes(1);
  });

  it('lets free play own Escape and hides the standard app chrome', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Open Free Play'));

    expect(screen.getByText('Mock Free Play')).toBeInTheDocument();
    expect(document.querySelector('.app-topbar')).toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.getByText('Mock Free Play')).toBeInTheDocument();
  });

  it('returns keyboard setup opened from a lesson drill back to that lesson', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Open Learn'));
    fireEvent.click(await screen.findByText('Open Lesson'));
    fireEvent.click(await screen.findByText('Start Drill'));
    fireEvent.click(await screen.findByText('Open Keyboard Setup'));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Lesson' }));

    expect(screen.getByText('Start Drill')).toBeInTheDocument();
    expect(screen.queryByText('Keyboard Setup')).not.toBeInTheDocument();
  });

  it('returns keyboard setup opened from a capstone back to the learn hub', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Open Learn'));
    fireEvent.click(await screen.findByText('Start Capstone'));
    fireEvent.click(await screen.findByText('Open Keyboard Setup'));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Learn' }));

    expect(screen.getByText('Open Lesson')).toBeInTheDocument();
    expect(screen.getByText('Start Capstone')).toBeInTheDocument();
    expect(screen.queryByText('Keyboard Setup')).not.toBeInTheDocument();
  });

  it('renders persistent HUD navigation on standard screens and can return to the main menu', async () => {
    render(<App />);

    expect(document.querySelector('.app-topbar')).toBeNull();

    fireEvent.click(await screen.findByText('Open Library'));

    expect(screen.getByText('Library', { selector: 'div' })).toBeInTheDocument();
    const topbarNavigation = screen.getByRole('navigation', { name: 'Application navigation' });
    expect(topbarNavigation).toHaveTextContent('Main');
    expect(topbarNavigation).toHaveTextContent('Play');
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Back to Main Menu' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Main' }));

    expect(screen.getByText('Open Library')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to Main Menu' })).not.toBeInTheDocument();
  });

  it('launches lesson drills in luma-keys mode instead of wait-for-input learning mode', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Open Learn'));
    fireEvent.click(await screen.findByText('Open Lesson'));
    fireEvent.click(await screen.findByText('Start Drill'));

    expect(screen.getByTestId('game-source-kind')).toHaveTextContent('lesson-drill');
    expect(screen.getByTestId('game-session-mode')).toHaveTextContent('luma-keys');
    expect(screen.getByTestId('game-session-wait')).toHaveTextContent('false');
  });

  it('keeps retrying audio unlock on later user gestures', async () => {
    render(<App />);

    await screen.findByText('Open Free Play');
    expect(screen.queryByText('Enable Audio')).not.toBeInTheDocument();
    const initialPrepareCalls = prepareForPlaybackSpy.mock.calls.length;

    fireEvent.pointerDown(window);
    fireEvent.pointerDown(window);
    fireEvent.keyDown(window, { key: 'a' });

    expect(preloadSpy).not.toHaveBeenCalled();
    expect(unlockSpy).not.toHaveBeenCalled();
    expect(prepareForPlaybackSpy.mock.calls.length).toBeGreaterThan(initialPrepareCalls);
  });

  it('routes the main menu soundboard entry to the dedicated soundboard screen', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Open Soundboard'));

    expect(screen.getByText('Mock Soundboard')).toBeInTheDocument();
  });

  it('starts the main menu recommended song in scored play mode', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Start Recommended Song'));

    expect(screen.getByText('Game')).toBeInTheDocument();
    expect(screen.getByTestId('game-source-kind')).toHaveTextContent('library-song');
    expect(screen.getByTestId('game-session-mode')).toHaveTextContent('luma-keys');
    expect(screen.getByTestId('game-session-wait')).toHaveTextContent('false');
  });

  it('applies the neon dataset theme when the settings screen selects it', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Open Settings'));
    fireEvent.click(screen.getByText('Select Neon'));

    expect(document.documentElement.dataset.theme).toBe('neon');
  });

  it('loads and applies saved per-instrument reverb presets during startup', async () => {
    render(<App />);

    await screen.findByText('Open Free Play');

    expect(setInstrumentReverbPresetSpy).toHaveBeenCalledWith('hall');
  });

  it('starts a fresh profile at the audio defaults the settings screen shows', async () => {
    render(<App />);

    await screen.findByText('Open Free Play');

    expect(setMasterVolumeSpy).toHaveBeenCalledWith(80);
    expect(setMetronomeVolumeSpy).toHaveBeenCalledWith(65);
    expect(setReverbLevelSpy).toHaveBeenCalledWith(20);
  });

  it('keeps saved audio levels, including a saved zero, over the defaults', async () => {
    vi.mocked(window.appBridge!.getSetting).mockImplementation(async (category: string, key: string) => {
      if (category === 'onboarding' && key === 'setupComplete') {
        return 'true';
      }
      if (category === 'audio' && key === 'masterVolume') {
        return '35';
      }
      if (category === 'audio' && key === 'metronomeVolume') {
        return '0';
      }
      if (category === 'audio' && key === 'reverbLevel') {
        return '50';
      }
      return null;
    });

    render(<App />);

    await screen.findByText('Open Free Play');

    expect(setMasterVolumeSpy).toHaveBeenCalledWith(35);
    expect(setMetronomeVolumeSpy).toHaveBeenCalledWith(0);
    expect(setReverbLevelSpy).toHaveBeenCalledWith(50);
  });

  it('starts a fresh profile with the two lead-in beats the settings screen shows', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Start Recommended Song'));

    expect(screen.getByTestId('game-session-lead-in')).toHaveTextContent('2');
  });

  it('keeps a saved lead-in of zero over the default', async () => {
    vi.mocked(window.appBridge!.getSetting).mockImplementation(async (category: string, key: string) => {
      if (category === 'onboarding' && key === 'setupComplete') {
        return 'true';
      }
      if (category === 'gameplay' && key === 'leadInBeats') {
        return '0';
      }
      return null;
    });

    render(<App />);

    fireEvent.click(await screen.findByText('Start Recommended Song'));

    expect(screen.getByTestId('game-session-lead-in')).toHaveTextContent('0');
  });

  it('keeps the shell usable with defaults when startup settings fail', async () => {
    window.appBridge = {
      ...window.appBridge!,
      getSetting: vi.fn(async () => {
        throw new Error('settings unavailable');
      }),
    } as typeof window.appBridge;

    render(<App />);

    expect(await screen.findByText('Open Library')).toBeInTheDocument();
    expect(screen.getByText('Startup Defaults Active')).toBeInTheDocument();
    expect(screen.getByText('Some saved settings could not be loaded. Defaults are active for this session.')).toBeInTheDocument();
  });

  it('persists instrument changes triggered from immersive free play controls', async () => {
    render(<App />);

    fireEvent.click(await screen.findByText('Open Free Play'));
    fireEvent.click(screen.getByText('Switch Free Play Instrument'));

    await waitFor(() => {
      expect(setInstrumentSpy).toHaveBeenCalledWith('organ');
      expect(setSettingSpy).toHaveBeenCalledWith('audio', 'instrumentId', 'organ');
      expect(screen.getByTestId('free-play-instrument')).toHaveTextContent('organ');
    });
  });

  it('shows a session-only notice when an input-mode write rejects', async () => {
    setSettingSpy.mockImplementation(async (category: string, key: string) => {
      if (category === 'input' && key === 'mode') {
        throw new Error('write failed');
      }
    });
    render(<App />);

    fireEvent.click(await screen.findByText('Open Settings'));
    fireEvent.click(screen.getByText('Select MIDI Input'));

    await waitFor(() => {
      expect(screen.getByText(/Input mode is active for this session only/)).toBeInTheDocument();
    });
  });

  it('unlocks all developer content through the settings action', async () => {
    render(<App />);

    const settingsButtons = await screen.findAllByText('Open Settings');
    fireEvent.click(settingsButtons[settingsButtons.length - 1]);
    fireEvent.click(screen.getByText('Unlock All Developer Content'));

    await waitFor(() => {
      expect(unlockAchievementSpy).toHaveBeenCalledTimes(ACHIEVEMENTS.length);
      expect(setSettingSpy).toHaveBeenCalledWith('learning', 'completedLessons', expect.any(String));
      expect(setSettingSpy).toHaveBeenCalledWith('learning', 'completedSteps', expect.any(String));
      expect(setSettingSpy).toHaveBeenCalledWith('learning', 'gatingEnabled', 'false');
      expect(setSettingSpy).toHaveBeenCalledWith('learning', 'capstoneResults', expect.any(String));
    });
  });

  it('clears the active custom sampler when user data resets', async () => {
    vi.mocked(window.appBridge!.getSetting).mockImplementation(async (category: string, key: string) => {
      if (category === 'onboarding' && key === 'setupComplete') {
        return 'true';
      }
      if (category === 'audio' && key === 'customSamplePackPath') {
        return '/samples/custom';
      }
      return null;
    });

    render(<App />);

    const settingsButtons = await screen.findAllByText('Open Settings');
    fireEvent.click(settingsButtons[settingsButtons.length - 1]);
    fireEvent.click(screen.getByText('Trigger User Data Reset'));

    await waitFor(() => {
      expect(clearCustomSamplerSpy).toHaveBeenCalled();
      expect(setInstrumentSpy).toHaveBeenCalledWith('acoustic-piano');
    });
  });
});
