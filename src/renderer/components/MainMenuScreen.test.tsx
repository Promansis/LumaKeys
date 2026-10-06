import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibrarySnapshot, SongRow, UserStatsRow } from '../../shared/dbTypes';
import { MainMenuScreen } from './MainMenuScreen';

function createHandlers() {
  return {
    onOpenLibrary: vi.fn(),
    onOpenLearn: vi.fn(),
    onOpenFreePlay: vi.fn(),
    onOpenSoundboard: vi.fn(),
    onOpenTheory: vi.fn(),
    onOpenProgress: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenSetup: vi.fn(),
    onStartSong: vi.fn(),
  };
}

function createSong(overrides: Partial<SongRow> = {}): SongRow {
  return {
    id: overrides.id ?? 'song-1',
    title: overrides.title ?? 'Practice Song',
    artist: overrides.artist ?? '',
    genre: overrides.genre ?? '',
    filePath: overrides.filePath ?? '/tmp/practice.mid',
    difficulty: overrides.difficulty ?? 3,
    durationSec: overrides.durationSec ?? 80,
    bpm: overrides.bpm ?? 120,
    noteCount: overrides.noteCount ?? 120,
    dateAdded: overrides.dateAdded ?? '2026-04-18T00:00:00.000Z',
    timesPlayed: overrides.timesPlayed ?? 0,
    tags: overrides.tags ?? [],
    isFavorite: overrides.isFavorite ?? false,
    folderId: overrides.folderId ?? null,
    trackAssignments: overrides.trackAssignments ?? { left: 'left', right: 'right' },
  };
}

function createStats(songId: string, overrides: Partial<UserStatsRow> = {}): UserStatsRow {
  return {
    songId,
    playCount: overrides.playCount ?? 2,
    bestScore: overrides.bestScore ?? 1200,
    averageScore: overrides.averageScore ?? 1040,
    bestAccuracy: overrides.bestAccuracy ?? 84,
    lastPlayed: overrides.lastPlayed ?? '2026-05-20T12:00:00.000Z',
    totalPracticeTimeSec: overrides.totalPracticeTimeSec ?? 600,
  };
}

describe('MainMenuScreen', () => {
  afterEach(() => {
    cleanup();
    window.appBridge = undefined;
  });

  it('plays the looping neon background video behind the menu', () => {
    render(<MainMenuScreen {...createHandlers()} />);

    const video = screen.getByTestId('main-menu-background-video') as HTMLVideoElement;
    expect(video).toHaveAttribute('src', expect.stringContaining('/assets/main-menu/mainmenu-neonbackground.webm'));
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('loop');
    expect(video).toHaveAttribute('playsinline');
    expect(video.muted).toBe(true);
    expect(video).toHaveAttribute('aria-hidden', 'true');
  });

  it.each([
    ['reduced motion is preferred', '(prefers-reduced-motion: reduce)'],
    ['the viewport is compact', '(max-width: 780px)'],
  ])('keeps the static background image when %s', (_label, matchingQuery) => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn((query: string) => ({
      matches: query === matchingQuery,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    try {
      render(<MainMenuScreen {...createHandlers()} />);
      expect(screen.queryByTestId('main-menu-background-video')).not.toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it('keeps all destination buttons accessible and wired to the same handlers', async () => {
    const user = userEvent.setup();
    const handlers = createHandlers();

    render(<MainMenuScreen {...handlers} />);

    expect(screen.getByRole('heading', { name: 'LumaKeys' })).toBeInTheDocument();

    const primaryDestinations = screen.getByRole('region', { name: 'Primary destinations' });
    const moreDestinations = screen.getByRole('region', { name: 'More destinations' });

    const destinations = [
      {
        button: within(primaryDestinations).getByRole('button', {
          name: 'Play Songs',
        }),
        name: 'Play Songs',
        description: 'Import a MIDI song to start scored practice.',
        actionLabel: 'Choose Song',
        handler: handlers.onOpenLibrary,
      },
      {
        button: within(primaryDestinations).getByRole('button', {
          name: 'Guided Lessons',
        }),
        name: 'Guided Lessons',
        description: 'Follow guided lessons, drills, and checkpoints.',
        actionLabel: 'Resume Lesson',
        handler: handlers.onOpenLearn,
      },
      {
        button: within(primaryDestinations).getByRole('button', {
          name: 'Free Play',
        }),
        name: 'Free Play',
        description: 'Play without score or timing pressure.',
        actionLabel: 'Open Free Play',
        handler: handlers.onOpenFreePlay,
      },
      {
        button: within(primaryDestinations).getByRole('button', {
          name: 'Soundboard',
        }),
        name: 'Soundboard',
        description: 'Trigger pads, one-shots, and playful sounds.',
        actionLabel: 'Open Soundboard',
        handler: handlers.onOpenSoundboard,
      },
      {
        button: within(moreDestinations).getByRole('button', {
          name: 'Theory Trainer',
        }),
        name: 'Theory Trainer',
        description: 'Intervals, scales, and quiz practice.',
        handler: handlers.onOpenTheory,
      },
      {
        button: within(moreDestinations).getByRole('button', {
          name: 'Progress',
        }),
        name: 'Progress',
        description: 'Streaks, accuracy, and practice history.',
        handler: handlers.onOpenProgress,
      },
      {
        button: within(moreDestinations).getByRole('button', {
          name: 'Settings',
        }),
        name: 'Settings',
        description: 'Audio, visuals, input, and accessibility.',
        handler: handlers.onOpenSettings,
      },
      {
        button: within(moreDestinations).getByRole('button', {
          name: 'Keyboard Setup',
        }),
        name: 'Keyboard Setup',
        description: 'Map keys, devices, and onboarding basics.',
        handler: handlers.onOpenSetup,
      },
    ];

    expect(within(primaryDestinations).getByRole('button', { name: 'Soundboard' })).toBeInTheDocument();
    expect(within(moreDestinations).queryByRole('button', { name: 'Soundboard' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Training and Setup' })).toBeInTheDocument();
    expect(within(primaryDestinations).getByRole('button', { name: 'Play Songs' })).toHaveStyle({
      '--entrance-delay': '220ms',
    });
    expect(within(primaryDestinations).getByRole('button', { name: 'Soundboard' })).toHaveStyle({
      '--entrance-delay': '430ms',
    });
    expect(within(moreDestinations).getByRole('button', { name: 'Theory Trainer' })).toHaveStyle({
      '--entrance-delay': '500ms',
    });
    expect(screen.getByRole('heading', { name: 'Training and Setup' }).closest('section')).toHaveStyle({
      '--entrance-delay': '450ms',
    });

    for (const destination of destinations) {
      expect(destination.button).toBeInTheDocument();
      expect(destination.button).toHaveAccessibleDescription(destination.description);
      expect(destination.button).toHaveAccessibleName(destination.name);
      expect(within(destination.button).getByText(destination.description)).toBeInTheDocument();
      if (destination.actionLabel) {
        expect(within(destination.button).getByText(destination.actionLabel)).toHaveAttribute('aria-hidden', 'true');
      }
      await user.click(destination.button);
      expect(destination.handler).toHaveBeenCalledOnce();
    }
  });

  it('reacts to focused destinations with matching stage variables', async () => {
    const user = userEvent.setup();
    const handlers = createHandlers();

    render(<MainMenuScreen {...handlers} />);

    const mainMenu = screen.getByRole('main');
    const primaryDestinations = screen.getByRole('region', { name: 'Primary destinations' });
    const freePlayButton = within(primaryDestinations).getByRole('button', { name: 'Free Play' });

    freePlayButton.focus();

    expect(freePlayButton).toHaveFocus();
    expect(mainMenu).toHaveAttribute('data-active-card', 'free-play');
    expect(mainMenu).toHaveStyle({
      '--active-card-color': 'var(--menu-neon-cyan)',
      '--sequencer-column': '2',
      '--sequencer-lane': '2',
      '--sequencer-position': '25%',
    });

    await user.tab();

    expect(mainMenu).toHaveAttribute('data-active-card', 'soundboard');
    expect(mainMenu).toHaveStyle({
      '--active-card-color': 'var(--menu-neon-blue)',
      '--sequencer-column': '3',
      '--sequencer-lane': '3',
      '--sequencer-position': '31.25%',
    });
  });

  it('shows a data-backed recommended song and starts it directly', async () => {
    const user = userEvent.setup();
    const handlers = createHandlers();
    const challengeSong = createSong({
      id: 'challenge',
      title: 'Brighter Etude',
      difficulty: 4,
    });
    const stats = createStats(challengeSong.id, { bestAccuracy: 88 });
    const snapshot: LibrarySnapshot = {
      songs: [challengeSong],
      folders: [],
      playlists: [],
      recommendations: {
        nextChallenge: [
          {
            song: challengeSong,
            reason: 'Difficulty 4 is just above your recent comfort zone.',
          },
        ],
        skillBuilder: [],
        youMightLike: [],
        revisit: [],
      },
      statsBySongId: {
        [challengeSong.id]: stats,
      },
      songGoals: {},
    };

    window.appBridge = {
      getLibrarySnapshot: vi.fn().mockResolvedValue(snapshot),
      getPracticeStreak: vi.fn().mockResolvedValue({ currentStreak: 3, longestStreak: 5, streakFreezes: 0 }),
    } as unknown as typeof window.appBridge;

    render(<MainMenuScreen {...handlers} />);

    const recommendation = await screen.findByRole('region', { name: 'Recommended practice' });
    expect(within(recommendation).getByRole('heading', { name: 'Brighter Etude' })).toBeInTheDocument();
    expect(within(recommendation).getByText('Next Challenge')).toBeInTheDocument();
    expect(within(recommendation).getByText('Difficulty 4')).toBeInTheDocument();
    expect(within(recommendation).getByText('88% best')).toBeInTheDocument();
    const primaryDestinations = screen.getByRole('region', { name: 'Primary destinations' });
    expect(within(primaryDestinations).getByRole('button', { name: 'Play Songs' })).toHaveAccessibleDescription('1 song ready for scored practice.');

    await user.click(within(recommendation).getByRole('button', { name: 'Start Song' }));

    expect(handlers.onStartSong).toHaveBeenCalledWith(challengeSong);
  });
});
