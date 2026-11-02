import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS } from '../../lib/achievements/achievementDefinitions';
import type { ProgressStatsResult } from '../../shared/dbTypes';
import { ProgressDashboardScreen } from './ProgressDashboardScreen';

function buildCanvasContextStub(): CanvasRenderingContext2D {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createStats(overrides?: Partial<ProgressStatsResult>): ProgressStatsResult {
  return {
    practiceTimeByDay: [],
    theorySessionsByDay: [],
    songsPlayedByWeek: [],
    accuracyTrend: [],
    hitQuality: {
      perfect: 0,
      good: 0,
      ok: 0,
      misses: 0,
    },
    totalStats: {
      totalSongs: 0,
      songsMastered: 0,
      totalPracticeTimeSec: 0,
      favoriteGenre: 'Classical',
    },
    ...overrides,
  };
}

describe('ProgressDashboardScreen', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(buildCanvasContextStub());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows an empty-state CTA that routes back to the library when no meaningful progress exists', async () => {
    const onOpenLibrary = vi.fn();

    window.appBridge = {
      getProgressStats: vi.fn().mockResolvedValue(createStats()),
      getPracticeStreak: vi.fn().mockResolvedValue({ currentStreak: 0, longestStreak: 0, streakFreezes: 0 }),
      getAllAchievements: vi.fn().mockResolvedValue([]),
      getSetting: vi.fn().mockResolvedValue(null),
      getProgressTopSongs: vi.fn().mockResolvedValue([]),
      getAllUnresolvedTroubleSpots: vi.fn().mockResolvedValue([]),
    } as unknown as typeof window.appBridge;

    render(<ProgressDashboardScreen onOpenLibrary={onOpenLibrary} />);

    expect(await screen.findByText('Nothing to chart yet')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to Library' }));

    expect(onOpenLibrary).toHaveBeenCalledOnce();
  });

  it('renders the populated dashboard without falling back to the empty state', async () => {
    const onStartTopSong = vi.fn();
    const onPracticeTroubleSpot = vi.fn();
    window.appBridge = {
      getProgressStats: vi.fn().mockResolvedValue(
        createStats({
          practiceTimeByDay: [
            { date: '2026-04-20', minutes: 20 },
            { date: '2026-04-21', minutes: 35 },
          ],
          songsPlayedByWeek: [{ weekStart: '2026-04-20', count: 4 }],
          accuracyTrend: [{ date: '2026-04-21', avgAccuracy: 94 }],
          totalStats: {
            totalSongs: 6,
            songsMastered: 2,
            totalPracticeTimeSec: 4200,
            favoriteGenre: 'Classical',
          },
        }),
      ),
      getPracticeStreak: vi.fn().mockResolvedValue({ currentStreak: 5, longestStreak: 7, streakFreezes: 0 }),
      getAllAchievements: vi.fn().mockResolvedValue([
        { id: ACHIEVEMENTS[0].id, unlockedAt: '2026-04-21T00:00:00.000Z' },
      ]),
      getSetting: vi.fn().mockResolvedValue('30'),
      getProgressTopSongs: vi.fn().mockResolvedValue([
        { songId: 'song-1', title: 'Etude', playCount: 4, bestAccuracy: 98, totalPracticeTimeSec: 1200 },
      ]),
      getAllUnresolvedTroubleSpots: vi.fn().mockResolvedValue([
        {
          id: 'spot-1',
          songId: 'song-1',
          songTitle: 'Etude',
          measureStart: 8,
          measureEnd: 10,
          struggleCount: 3,
          lowestAccuracy: 62,
          latestAccuracy: 81,
        },
      ]),
    } as unknown as typeof window.appBridge;

    render(
      <ProgressDashboardScreen
        onOpenLibrary={vi.fn()}
        onStartTopSong={onStartTopSong}
        onPracticeTroubleSpot={onPracticeTroubleSpot}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Current streak')).toBeInTheDocument();
    });

    expect(screen.queryByText('Nothing to chart yet')).not.toBeInTheDocument();
    expect(screen.getAllByText('Etude').length).toBeGreaterThan(0);
    expect(screen.getByText(ACHIEVEMENTS[0].name)).toBeInTheDocument();
    expect(screen.getByText('Measures 9–11')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Etude' }));
    fireEvent.click(screen.getByRole('button', { name: 'Practice' }));

    expect(onStartTopSong).toHaveBeenCalledWith('song-1');
    expect(onPracticeTroubleSpot).toHaveBeenCalledWith('song-1', { startMeasure: 8, endMeasure: 10 });
  });

  it('labels stored zero-based trouble-spot measures one-based, as Results does', async () => {
    const onPracticeTroubleSpot = vi.fn();
    window.appBridge = {
      getProgressStats: vi.fn().mockResolvedValue(
        createStats({ accuracyTrend: [{ date: '2026-04-21', avgAccuracy: 94 }] }),
      ),
      getPracticeStreak: vi.fn().mockResolvedValue({ currentStreak: 0, longestStreak: 0, streakFreezes: 0 }),
      getAllAchievements: vi.fn().mockResolvedValue([]),
      getSetting: vi.fn().mockResolvedValue(null),
      getProgressTopSongs: vi.fn().mockResolvedValue([]),
      getAllUnresolvedTroubleSpots: vi.fn().mockResolvedValue([
        { id: 'spot-a', songId: 'song-1', songTitle: 'Etude', measureStart: 0, measureEnd: 0, struggleCount: 1, lowestAccuracy: 50, latestAccuracy: 100 },
        { id: 'spot-b', songId: 'song-1', songTitle: 'Etude', measureStart: 1, measureEnd: 1, struggleCount: 1, lowestAccuracy: 50, latestAccuracy: 100 },
      ]),
    } as unknown as typeof window.appBridge;

    render(<ProgressDashboardScreen onOpenLibrary={vi.fn()} onPracticeTroubleSpot={onPracticeTroubleSpot} />);

    expect(await screen.findByText('Measures 1–1')).toBeInTheDocument();
    expect(screen.getByText('Measures 2–2')).toBeInTheDocument();
    expect(screen.queryByText('Measures 0–0')).not.toBeInTheDocument();

    // The loop range handed to Practice stays zero-based.
    fireEvent.click(screen.getAllByRole('button', { name: 'Practice' })[0]);
    expect(onPracticeTroubleSpot).toHaveBeenCalledWith('song-1', { startMeasure: 0, endMeasure: 0 });
  });
});
