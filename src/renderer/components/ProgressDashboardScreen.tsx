import { useEffect, useMemo, useState } from 'react';
import { ACHIEVEMENTS } from '../../lib/achievements/achievementDefinitions';
import type { LoopRange } from '../../lib/game/types';
import { isRewardUnlocked } from '../../lib/rewards/rewardCatalog';
import type { AchievementRow, GlobalTroubleSpot, PracticeStreak, ProgressStatsResult, TopSongStat } from '../../shared/dbTypes';
import { BarChart } from './charts/BarChart';
import { LineChart } from './charts/LineChart';
import { LoadingPanel } from './LoadingPanel';
import { DeckBackdrop } from './DeckBackdrop';

function formatDuration(totalSeconds: number): string {
  const totalMinutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function hasSeriesData<T>(entries: T[], getValue: (entry: T) => number): boolean {
  return entries.some((entry) => getValue(entry) > 0);
}

function sumSeries<T>(entries: T[], getValue: (entry: T) => number): number {
  return entries.reduce((total, entry) => total + getValue(entry), 0);
}

interface ProgressDashboardScreenProps {
  unlockedRewardIds?: Set<string>;
  onOpenLibrary: () => void;
  onStartTopSong?: (songId: string) => void;
  onPracticeTroubleSpot?: (songId: string, loopRange: LoopRange) => void;
}

export function ProgressDashboardScreen({
  unlockedRewardIds = new Set(),
  onOpenLibrary,
  onStartTopSong,
  onPracticeTroubleSpot,
}: ProgressDashboardScreenProps) {
  const [stats, setStats] = useState<ProgressStatsResult | null>(null);
  const [streak, setStreak] = useState<PracticeStreak | null>(null);
  const [achievements, setAchievements] = useState<AchievementRow[]>([]);
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number | null>(null);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [topSongs, setTopSongs] = useState<TopSongStat[]>([]);
  const [troubleSpots, setTroubleSpots] = useState<GlobalTroubleSpot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      if (!window.appBridge) {
        if (!ignore) {
          setErrorMessage('The app bridge is unavailable.');
          setIsLoading(false);
        }
        return;
      }

      try {
        const fromDate = daysAgo(29);
        const toDate = daysAgo(0);
        const [nextStats, nextStreak, nextAchievements, rawDailyGoal, nextTopSongs, nextTroubleSpots] =
          await Promise.all([
            window.appBridge.getProgressStats(fromDate, toDate),
            window.appBridge.getPracticeStreak(),
            window.appBridge.getAllAchievements(),
            window.appBridge.getSetting('practice', 'dailyGoalMinutes'),
            window.appBridge.getProgressTopSongs(),
            window.appBridge.getAllUnresolvedTroubleSpots(),
          ]);

        if (ignore) {
          return;
        }

        setStats(nextStats);
        setStreak(nextStreak);
        setAchievements(nextAchievements);
        setTopSongs(nextTopSongs);
        setTroubleSpots(nextTroubleSpots);

        const parsedGoal = Number(rawDailyGoal);
        if (Number.isFinite(parsedGoal) && parsedGoal > 0) {
          setDailyGoalMinutes(parsedGoal);
        } else {
          setDailyGoalMinutes(null);
        }

        const today = daysAgo(0);
        const todayEntry = nextStats.practiceTimeByDay.find((entry) => entry.date === today);
        setTodayMinutes(todayEntry?.minutes ?? 0);
        setErrorMessage(null);
      } catch (error) {
        if (!ignore) {
          setErrorMessage((error as Error).message);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => {
      ignore = true;
    };
  }, []);

  const unlockedAchievements = useMemo(
    () => achievements.filter((achievement) => achievement.unlockedAt),
    [achievements],
  );
  const averageAccuracy = useMemo(() => {
    if (!stats) {
      return null;
    }

    const entries = stats.accuracyTrend.filter((entry) => entry.avgAccuracy > 0);
    if (entries.length === 0) {
      return null;
    }

    return Math.round((entries.reduce((total, entry) => total + entry.avgAccuracy, 0) / entries.length) * 10) / 10;
  }, [stats]);
  const songsPlayedTotal = useMemo(
    () => (stats ? sumSeries(stats.songsPlayedByWeek, (entry) => entry.count) : 0),
    [stats],
  );
  const practiceTimeHasData = stats ? hasSeriesData(stats.practiceTimeByDay, (entry) => entry.minutes) : false;
  const accuracyHasData = stats ? hasSeriesData(stats.accuracyTrend, (entry) => entry.avgAccuracy) : false;
  const songsPlayedHasData = stats ? hasSeriesData(stats.songsPlayedByWeek, (entry) => entry.count) : false;
  const hasMeaningfulProgress = Boolean(
    stats &&
      (stats.totalStats.totalPracticeTimeSec > 0 || songsPlayedHasData || accuracyHasData),
  );
  const dailyGoalProgress =
    dailyGoalMinutes && dailyGoalMinutes > 0
      ? Math.min(100, Math.round((todayMinutes / dailyGoalMinutes) * 100))
      : 0;

  if (isLoading) {
    return (
      <LoadingPanel
        eyebrow="Progress Dashboard"
        title="Loading progress"
        message="Gathering practice history, streaks, and chart data."
        className="progress-dashboard-screen"
      />
    );
  }

  if (!stats || !streak) {
    return (
      <main className="app-shell progress-dashboard-screen">
        <DeckBackdrop />
        <div className="deck-layout-shell">
        <section className="panel progress-hero-card progress-empty-state-card">
          <div>
            <p className="eyebrow">Progress Dashboard</p>
            <h1>Progress unavailable</h1>
            <p className="song-title">{errorMessage ?? 'No progress data is available yet.'}</p>
          </div>
        </section>
        </div>
      </main>
    );
  }

  if (!hasMeaningfulProgress) {
    return (
      <main className="app-shell progress-dashboard-screen">
        <DeckBackdrop />
        <div className="deck-layout-shell">
        <section className="panel progress-hero-card progress-empty-state-card">
          <div>
            <p className="eyebrow">Progress Dashboard</p>
            <h1>Nothing to chart yet</h1>
            <p className="song-title">
              Import a song, play a session, or finish a lesson so this dashboard has real practice data to track.
            </p>
          </div>
          <div className="progress-empty-state-actions">
            <button className="primary-button" onClick={onOpenLibrary}>
              Go to Library
            </button>
            {errorMessage ? <p className="panel-copy">{errorMessage}</p> : null}
          </div>
        </section>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell progress-dashboard-screen">
      <DeckBackdrop />
      <div className="deck-layout-shell">
      <section className="panel progress-hero-card deck-card">
        <div className="progress-hero-copy">
          <p className="eyebrow">Progress Dashboard</p>
          <h1>
            Current streak
            {isRewardUnlocked('title:maestro', unlockedRewardIds) ? (
              <span className="maestro-title-badge"> · Maestro</span>
            ) : null}
          </h1>
          <p className="song-title">Keep your chain alive, keep your charts moving, and make the next session count.</p>
        </div>
        <div className="progress-hero-highlight">
          <strong>{streak.currentStreak}</strong>
          <span>{streak.currentStreak === 1 ? 'day in a row' : 'days in a row'}</span>
        </div>
        <div className="progress-hero-stats">
          <article className="progress-hero-stat deck-card">
            <span>Total Practice</span>
            <strong>{formatDuration(stats.totalStats.totalPracticeTimeSec)}</strong>
          </article>
          <article className="progress-hero-stat deck-card">
            <span>Songs Played</span>
            <strong>{songsPlayedTotal}</strong>
          </article>
          <article className="progress-hero-stat deck-card">
            <span>Accuracy Avg</span>
            <strong>{averageAccuracy !== null ? `${averageAccuracy}%` : 'No scored runs'}</strong>
          </article>
          <article className="progress-hero-stat deck-card">
            <span>Longest Streak</span>
            <strong>{streak.longestStreak} days</strong>
          </article>
          {dailyGoalMinutes !== null ? (
            <article className="progress-hero-stat progress-hero-stat-goal deck-card">
              <span>Today&apos;s Goal</span>
              <strong>
                {todayMinutes}m / {dailyGoalMinutes}m
              </strong>
              <div className="daily-goal-bar-track">
                <div className="daily-goal-bar-fill" style={{ width: `${dailyGoalProgress}%` }} />
              </div>
            </article>
          ) : null}
        </div>
      </section>

      <section className="dashboard-chart-grid progress-primary-chart-grid">
        <article className="panel chart-panel deck-card">
          {practiceTimeHasData ? (
            <LineChart
              title="Practice Time"
              color="var(--color-accent)"
              data={stats.practiceTimeByDay.map((entry) => ({
                label: entry.date.slice(5),
                value: entry.minutes,
              }))}
              emptyLabel="No practice time recorded yet."
            />
          ) : (
            <div className="progress-inline-empty">
              <p className="eyebrow">Practice Time</p>
              <h2>Practice time will show up here.</h2>
              <p className="panel-copy">Play or learn a song to start building the timeline.</p>
            </div>
          )}
        </article>
        <article className="panel chart-panel deck-card">
          {accuracyHasData ? (
            <LineChart
              title="Accuracy Trend"
              color="var(--color-good)"
              data={stats.accuracyTrend.map((entry) => ({
                label: entry.date.slice(5),
                value: entry.avgAccuracy,
              }))}
              maxValue={100}
              emptyLabel="No scored song sessions yet."
            />
          ) : (
            <div className="progress-inline-empty">
              <p className="eyebrow">Accuracy Trend</p>
              <h2>Scored sessions will fill this chart.</h2>
              <p className="panel-copy">Use Play mode to track how cleanly your runs are improving.</p>
            </div>
          )}
        </article>
        <article className="panel chart-panel deck-card">
          {songsPlayedHasData ? (
            <BarChart
              title="Songs Played"
              color="var(--color-accent-secondary)"
              data={stats.songsPlayedByWeek.map((entry) => ({
                label: entry.weekStart.slice(5),
                value: entry.count,
              }))}
              emptyLabel="No weekly song history yet."
            />
          ) : (
            <div className="progress-inline-empty">
              <p className="eyebrow">Songs Played</p>
              <h2>Your weekly play count starts here.</h2>
              <p className="panel-copy">Open the library and finish a few sessions to give this chart shape.</p>
            </div>
          )}
        </article>
      </section>

      <section className="progress-secondary-grid">
        <article className="panel top-songs-panel deck-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Most Played</p>
              <h2>Top songs</h2>
            </div>
          </div>
          {topSongs.length === 0 ? (
            <p className="empty-state">No songs played yet.</p>
          ) : (
            <ol className="top-songs-list">
              {topSongs.map((song, index) => (
                <li key={song.songId} className="top-songs-item">
                  <span className="top-songs-rank">{index + 1}</span>
                  <button
                    className="top-songs-title"
                    title={song.title}
                    type="button"
                    onClick={() => onStartTopSong?.(song.songId)}
                    disabled={!onStartTopSong}
                  >
                    {song.title}
                  </button>
                  <span className="top-songs-plays">{song.playCount}×</span>
                  <span className="top-songs-accuracy">{Math.round(song.bestAccuracy)}%</span>
                </li>
              ))}
            </ol>
          )}
        </article>

        <article className="panel trouble-spots-global-panel deck-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Needs Work</p>
              <h2>Trouble spots</h2>
            </div>
          </div>
          {troubleSpots.length === 0 ? (
            <p className="empty-state">No unresolved trouble spots.</p>
          ) : (
            <ul className="trouble-spots-global-list">
              {troubleSpots.map((spot) => (
                <li key={spot.id} className="trouble-spots-global-item">
                  <div className="trouble-spots-global-main">
                    <strong className="trouble-spots-global-song" title={spot.songTitle}>
                      {spot.songTitle}
                    </strong>
                    <span className="trouble-spots-global-range">
                      Measures {spot.measureStart + 1}–{spot.measureEnd + 1}
                    </span>
                  </div>
                  <div className="trouble-spots-global-stats">
                    {spot.latestAccuracy !== null ? (
                      <span className="trouble-spots-global-acc">{Math.round(spot.latestAccuracy)}%</span>
                    ) : null}
                    {spot.struggleCount > 0 ? (
                      <span className="trouble-spots-global-struggles">×{spot.struggleCount}</span>
                    ) : null}
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() =>
                        onPracticeTroubleSpot?.(spot.songId, {
                          startMeasure: spot.measureStart,
                          endMeasure: spot.measureEnd,
                        })
                      }
                      disabled={!onPracticeTroubleSpot}
                    >
                      Practice
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel achievements-panel deck-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Achievements</p>
              <h2>Unlocked milestones</h2>
            </div>
          </div>
          {unlockedAchievements.length === 0 ? (
            <p className="empty-state">No achievements unlocked yet.</p>
          ) : (
            <div className="achievement-grid">
              {ACHIEVEMENTS.filter((achievement) =>
                unlockedAchievements.some((row) => row.id === achievement.id),
              ).map((achievement) => (
                <article className="achievement-card unlocked deck-card" key={achievement.id}>
                  <span className="achievement-card-icon">{achievement.icon}</span>
                  <strong>{achievement.name}</strong>
                  <p className="panel-copy">{achievement.description}</p>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
      </div>
    </main>
  );
}
