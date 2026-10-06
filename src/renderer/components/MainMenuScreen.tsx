import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type {
  LibrarySnapshot,
  PracticeStreak,
  RecommendationItem,
  SongRow,
  UserStatsRow,
} from '../../shared/dbTypes';
import { resolvePublicAssetUrl } from '../../lib/audio/publicAssetUrl';

interface MainMenuScreenProps {
  onOpenLibrary: () => void;
  onOpenLearn: () => void;
  onOpenFreePlay: () => void;
  onOpenSoundboard: () => void;
  onOpenTheory: () => void;
  onOpenProgress: () => void;
  onOpenSettings: () => void;
  onOpenSetup: () => void;
  onStartSong: (song: SongRow) => void;
}

type MenuStyle = CSSProperties & {
  '--card-color'?: string;
  '--active-card-color'?: string;
  '--entrance-delay'?: string;
  '--mouse-x'?: string;
  '--mouse-y'?: string;
  '--note-color'?: string;
  '--note-delay'?: string;
  '--note-lane'?: string;
  '--note-size'?: string;
  '--note-top'?: string;
  '--note-speed'?: string;
  '--note-x'?: string;
  '--key-delay'?: string;
  '--key-spark-delay'?: string;
  '--key-index'?: string;
  '--black-key-column'?: string;
  '--sequencer-column'?: string;
  '--sequencer-lane'?: string;
  '--sequencer-position'?: string;
};

interface MenuCard {
  id: string;
  actionLabel?: string;
  description: string;
  getDescription?: (insights: MainMenuInsights) => string;
  icon: ReactNode;
  title: string;
  accent: string;
  priority: 'primary' | 'secondary';
  onSelect: (props: MainMenuScreenProps) => void;
}

interface MenuSongTarget {
  song: SongRow;
  stats: UserStatsRow | null;
}

interface MenuRecommendationTarget extends MenuSongTarget {
  group: 'Next Challenge' | 'Skill Builder' | 'You Might Like' | 'Revisit';
  item: RecommendationItem;
}

interface MainMenuInsights {
  status: 'loading' | 'ready' | 'unavailable';
  songCount: number;
  streak: PracticeStreak | null;
  recommendation: MenuRecommendationTarget | null;
  recentSong: MenuSongTarget | null;
  fallbackSong: SongRow | null;
}

interface MenuPracticeAction {
  actionLabel: string;
  accent: string;
  detail: string;
  eyebrow: string;
  meta: string[];
  song: SongRow | null;
  title: string;
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="none" aria-hidden="true">
      <polygon points="5,3 19,12 5,21" fill="currentColor" />
    </svg>
  );
}

function IconLearn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3L2 9l10 6 10-6-10-6z" />
      <path d="M12 15v7" />
      <path d="M7 11.8v4.2l5 2.5 5-2.5v-4.2" />
    </svg>
  );
}

function IconFreePlay() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="10" rx="2" />
      <line x1="6" y1="4" x2="6" y2="14" />
      <line x1="10" y1="4" x2="10" y2="14" />
      <line x1="14" y1="4" x2="14" y2="14" />
      <line x1="18" y1="4" x2="18" y2="14" />
      <rect x="4" y="4" width="4" height="6" rx="1" fill="currentColor" stroke="none" />
      <rect x="12" y="4" width="4" height="6" rx="1" fill="currentColor" stroke="none" />
      <path d="M8 18h8" strokeWidth="2.5" />
    </svg>
  );
}

function IconSoundboard() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function IconTheory() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <line x1="3" y1="7" x2="21" y2="7" />
      <line x1="3" y1="11" x2="21" y2="11" />
      <line x1="3" y1="15" x2="21" y2="15" />
      <line x1="3" y1="19" x2="21" y2="19" />
      <ellipse cx="9" cy="17" rx="2.5" ry="2" fill="currentColor" stroke="none" transform="rotate(-15 9 17)" />
      <line x1="11.3" y1="16.2" x2="11.3" y2="7" strokeWidth="1.8" />
      <ellipse cx="17" cy="14" rx="2.5" ry="2" fill="currentColor" stroke="none" transform="rotate(-15 17 14)" />
      <line x1="19.3" y1="13.2" x2="19.3" y2="4" strokeWidth="1.8" />
      <line x1="11.3" y1="7" x2="19.3" y2="4" strokeWidth="1.8" />
    </svg>
  );
}

function IconProgress() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="8" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="13" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function IconSetup() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="6" width="20" height="13" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </svg>
  );
}

const MENU_CARDS: MenuCard[] = [
  {
    id: 'play-songs',
    actionLabel: 'Choose Song',
    description: 'Open your MIDI library and start a scored run.',
    getDescription: (insights) => (
      insights.songCount > 0
        ? `${insights.songCount} ${insights.songCount === 1 ? 'song' : 'songs'} ready for scored practice.`
        : 'Import a MIDI song to start scored practice.'
    ),
    icon: <IconPlay />,
    title: 'Play Songs',
    accent: 'var(--menu-neon-gold)',
    priority: 'primary',
    onSelect: (props) => props.onOpenLibrary(),
  },
  {
    id: 'guided-lessons',
    actionLabel: 'Resume Lesson',
    description: 'Follow guided lessons, drills, and checkpoints.',
    icon: <IconLearn />,
    title: 'Guided Lessons',
    accent: 'var(--menu-neon-violet)',
    priority: 'primary',
    onSelect: (props) => props.onOpenLearn(),
  },
  {
    id: 'free-play',
    actionLabel: 'Open Free Play',
    description: 'Play without score or timing pressure.',
    icon: <IconFreePlay />,
    title: 'Free Play',
    accent: 'var(--menu-neon-cyan)',
    priority: 'primary',
    onSelect: (props) => props.onOpenFreePlay(),
  },
  {
    id: 'soundboard',
    actionLabel: 'Open Soundboard',
    description: 'Trigger pads, one-shots, and playful sounds.',
    icon: <IconSoundboard />,
    title: 'Soundboard',
    accent: 'var(--menu-neon-blue)',
    priority: 'primary',
    onSelect: (props) => props.onOpenSoundboard(),
  },
  {
    id: 'theory-trainer',
    description: 'Intervals, scales, and quiz practice.',
    icon: <IconTheory />,
    title: 'Theory Trainer',
    accent: 'var(--menu-neon-magenta)',
    priority: 'secondary',
    onSelect: (props) => props.onOpenTheory(),
  },
  {
    id: 'progress',
    description: 'Streaks, accuracy, and practice history.',
    getDescription: (insights) => (
      insights.streak
        ? `${insights.streak.currentStreak}-day streak. Longest: ${insights.streak.longestStreak}.`
        : 'Streaks, accuracy, and practice history.'
    ),
    icon: <IconProgress />,
    title: 'Progress',
    accent: 'var(--menu-neon-teal)',
    priority: 'secondary',
    onSelect: (props) => props.onOpenProgress(),
  },
  {
    id: 'settings',
    description: 'Audio, visuals, input, and accessibility.',
    icon: <IconSettings />,
    title: 'Settings',
    accent: 'var(--menu-neon-coral)',
    priority: 'secondary',
    onSelect: (props) => props.onOpenSettings(),
  },
  {
    id: 'keyboard-setup',
    description: 'Map keys, devices, and onboarding basics.',
    icon: <IconSetup />,
    title: 'Keyboard Setup',
    accent: 'var(--menu-neon-indigo)',
    priority: 'secondary',
    onSelect: (props) => props.onOpenSetup(),
  },
];

const EMPTY_INSIGHTS: MainMenuInsights = {
  status: 'loading',
  songCount: 0,
  streak: null,
  recommendation: null,
  recentSong: null,
  fallbackSong: null,
};

const SEQUENCER_NOTES = [
  { lane: 0, x: 12, size: 16, delay: -0.4, speed: 4.8, color: 'var(--menu-neon-gold)' },
  { lane: 2, x: 36, size: 22, delay: -2.2, speed: 5.6, color: 'var(--menu-neon-cyan)' },
  { lane: 4, x: 68, size: 14, delay: -1.4, speed: 4.4, color: 'var(--menu-neon-violet)' },
  { lane: 1, x: 24, size: 18, delay: -3.1, speed: 5.2, color: 'var(--menu-neon-blue)' },
  { lane: 5, x: 82, size: 24, delay: -0.9, speed: 6.1, color: 'var(--menu-neon-magenta)' },
  { lane: 3, x: 52, size: 16, delay: -2.8, speed: 4.9, color: 'var(--menu-neon-teal)' },
  { lane: 0, x: 74, size: 12, delay: -4.1, speed: 5.8, color: 'var(--menu-neon-coral)' },
  { lane: 4, x: 18, size: 20, delay: -5, speed: 6.4, color: 'var(--menu-neon-indigo)' },
] as const;

const SEQUENCER_WHITE_KEY_COUNT = 16;
const SEQUENCER_BLACK_KEY_POSITIONS = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12, 14] as const;

const PRIMARY_CARD_ENTRANCE_START_MS = 220;
const PRIMARY_CARD_ENTRANCE_STEP_MS = 70;
const SECONDARY_SHELL_ENTRANCE_DELAY_MS = 450;
const SECONDARY_CARD_ENTRANCE_START_MS = 500;
const SECONDARY_CARD_ENTRANCE_STEP_MS = 60;
const REDUCE_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const COMPACT_VIEWPORT_QUERY = '(max-width: 780px)';
const BACKGROUND_VIDEO_PATH = '/assets/main-menu/mainmenu-neonbackground.webm';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getMediaQueryMatches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

function subscribeMediaQuery(query: string, onChange: (matches: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const queryList = window.matchMedia(query);
  const handleChange = (event: MediaQueryListEvent) => onChange(event.matches);
  onChange(queryList.matches);

  if (typeof queryList.addEventListener === 'function') {
    queryList.addEventListener('change', handleChange);
    return () => queryList.removeEventListener('change', handleChange);
  }

  queryList.addListener(handleChange);
  return () => queryList.removeListener(handleChange);
}

function requestFrame(callback: FrameRequestCallback): number {
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    return window.requestAnimationFrame(callback);
  }

  callback(0);
  return -1;
}

function cancelFrame(frameId: number | null): void {
  if (frameId === null || frameId < 0) {
    return;
  }

  if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
    window.cancelAnimationFrame(frameId);
  }
}

function getCardDelay(priority: MenuCard['priority'], index: number): string {
  const start = priority === 'primary' ? PRIMARY_CARD_ENTRANCE_START_MS : SECONDARY_CARD_ENTRANCE_START_MS;
  const step = priority === 'primary' ? PRIMARY_CARD_ENTRANCE_STEP_MS : SECONDARY_CARD_ENTRANCE_STEP_MS;

  return `${start + index * step}ms`;
}

function getCardSequencerColumn(index: number): number {
  return index % SEQUENCER_WHITE_KEY_COUNT;
}

function getCardSequencerLane(index: number): number {
  return index % 6;
}

function getSequencerPosition(column: number): string {
  return `${12.5 + column * 6.25}%`;
}

function getLatestPlayedSong(snapshot: LibrarySnapshot): MenuSongTarget | null {
  const playedSongs = snapshot.songs
    .map((song) => ({ song, stats: snapshot.statsBySongId[song.id] ?? null }))
    .filter((entry): entry is MenuSongTarget & { stats: UserStatsRow & { lastPlayed: string } } => (
      Boolean(entry.stats?.lastPlayed)
    ))
    .sort((left, right) => right.stats.lastPlayed.localeCompare(left.stats.lastPlayed));

  return playedSongs[0] ?? null;
}

function getFallbackSong(snapshot: LibrarySnapshot): SongRow | null {
  return [...snapshot.songs]
    .sort((left, right) => right.dateAdded.localeCompare(left.dateAdded))
    [0] ?? null;
}

function getRecommendationTarget(snapshot: LibrarySnapshot): MenuRecommendationTarget | null {
  const recommendationGroups = snapshot.recommendations
    ? [
        ['Next Challenge', snapshot.recommendations.nextChallenge] as const,
        ['Skill Builder', snapshot.recommendations.skillBuilder] as const,
        ['Revisit', snapshot.recommendations.revisit] as const,
        ['You Might Like', snapshot.recommendations.youMightLike] as const,
      ]
    : [];

  for (const [group, items] of recommendationGroups) {
    const item = items[0];
    if (!item) {
      continue;
    }

    return {
      group,
      item,
      song: item.song,
      stats: snapshot.statsBySongId[item.song.id] ?? null,
    };
  }

  return null;
}

function formatAccuracy(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return `${Math.round(value)}% best`;
}

function buildPracticeAction(insights: MainMenuInsights): MenuPracticeAction {
  if (insights.recommendation) {
    const { group, item, song, stats } = insights.recommendation;
    return {
      actionLabel: 'Start Song',
      accent: 'var(--menu-neon-gold)',
      detail: item.reason,
      eyebrow: group,
      meta: [
        `Difficulty ${song.difficulty}`,
        formatAccuracy(stats?.bestAccuracy),
      ].filter((value): value is string => Boolean(value)),
      song,
      title: song.title,
    };
  }

  if (insights.recentSong) {
    const { song, stats } = insights.recentSong;
    return {
      actionLabel: 'Replay Song',
      accent: 'var(--menu-neon-cyan)',
      detail: 'Pick up from your most recent song and keep the practice thread moving.',
      eyebrow: 'Recent Song',
      meta: [
        `Played ${stats?.playCount ?? 1} ${(stats?.playCount ?? 1) === 1 ? 'time' : 'times'}`,
        formatAccuracy(stats?.bestAccuracy),
      ].filter((value): value is string => Boolean(value)),
      song,
      title: song.title,
    };
  }

  if (insights.fallbackSong) {
    return {
      actionLabel: 'Start Song',
      accent: 'var(--menu-neon-violet)',
      detail: 'Start with the newest song in your library.',
      eyebrow: 'Library Ready',
      meta: [`Difficulty ${insights.fallbackSong.difficulty}`],
      song: insights.fallbackSong,
      title: insights.fallbackSong.title,
    };
  }

  return {
    actionLabel: 'Open Library',
    accent: 'var(--menu-neon-gold)',
    detail: insights.status === 'loading'
      ? 'Checking your library and practice history.'
      : insights.status === 'unavailable'
        ? 'Open the library to choose a song while practice data is unavailable.'
        : 'Import a MIDI song to unlock scored practice recommendations.',
    eyebrow: insights.status === 'loading'
      ? 'Loading Practice'
      : insights.status === 'unavailable'
        ? 'Practice Data Unavailable'
        : 'No Songs Yet',
    meta: insights.status === 'unavailable' ? ['Practice data unavailable'] : [],
    song: null,
    title: insights.status === 'loading'
      ? 'Preparing your next step'
      : insights.status === 'unavailable'
        ? 'Open your library'
        : 'Import your first MIDI song',
  };
}

export function MainMenuScreen(props: MainMenuScreenProps) {
  const mainRef = useRef<HTMLElement | null>(null);
  const reduceMotionRef = useRef(getMediaQueryMatches(REDUCE_MOTION_QUERY));
  const compactViewportRef = useRef(getMediaQueryMatches(COMPACT_VIEWPORT_QUERY));
  const screenFrameRef = useRef<number | null>(null);
  const screenPointerRef = useRef({ x: 0, y: 0 });
  const cardFrameRef = useRef<number | null>(null);
  const pendingCardTiltRef = useRef<{
    element: HTMLButtonElement;
    shineX: number;
    shineY: number;
    tiltX: number;
    tiltY: number;
  } | null>(null);
  const [insights, setInsights] = useState<MainMenuInsights>(EMPTY_INSIGHTS);
  const [showBackgroundVideo, setShowBackgroundVideo] = useState(
    () => !reduceMotionRef.current && !compactViewportRef.current,
  );

  const primaryCards = useMemo(() => MENU_CARDS.filter((card) => card.priority === 'primary'), []);
  const secondaryCards = useMemo(() => MENU_CARDS.filter((card) => card.priority === 'secondary'), []);
  const practiceAction = useMemo(() => buildPracticeAction(insights), [insights]);

  useEffect(() => {
    let ignore = false;

    const loadInsights = async () => {
      if (!window.appBridge) {
        setInsights({ ...EMPTY_INSIGHTS, status: 'unavailable' });
        return;
      }

      try {
        const [snapshot, streak] = await Promise.all([
          window.appBridge.getLibrarySnapshot(),
          window.appBridge.getPracticeStreak().catch(() => null),
        ]);

        if (ignore) {
          return;
        }

        setInsights({
          status: 'ready',
          songCount: snapshot.songs.length,
          streak,
          recommendation: getRecommendationTarget(snapshot),
          recentSong: getLatestPlayedSong(snapshot),
          fallbackSong: getFallbackSong(snapshot),
        });
      } catch {
        if (!ignore) {
          setInsights({ ...EMPTY_INSIGHTS, status: 'unavailable' });
        }
      }
    };

    void loadInsights();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    const syncBackgroundVideo = () => {
      setShowBackgroundVideo(!reduceMotionRef.current && !compactViewportRef.current);
    };
    const unsubscribeReduceMotion = subscribeMediaQuery(REDUCE_MOTION_QUERY, (matches) => {
      reduceMotionRef.current = matches;
      syncBackgroundVideo();
    });
    const unsubscribeCompactViewport = subscribeMediaQuery(COMPACT_VIEWPORT_QUERY, (matches) => {
      compactViewportRef.current = matches;
      syncBackgroundVideo();
    });

    return () => {
      cancelFrame(screenFrameRef.current);
      cancelFrame(cardFrameRef.current);
      unsubscribeReduceMotion();
      unsubscribeCompactViewport();
    };
  }, []);

  const handleScreenPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (reduceMotionRef.current) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    screenPointerRef.current = {
      x: clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5),
      y: clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5),
    };

    if (screenFrameRef.current !== null) {
      return;
    }

    screenFrameRef.current = requestFrame(() => {
      screenFrameRef.current = null;
      const node = mainRef.current;
      if (!node) {
        return;
      }

      node.style.setProperty('--mouse-x', screenPointerRef.current.x.toFixed(3));
      node.style.setProperty('--mouse-y', screenPointerRef.current.y.toFixed(3));
    });
  };

  const handleScreenPointerLeave = () => {
    cancelFrame(screenFrameRef.current);
    screenFrameRef.current = null;
    mainRef.current?.style.setProperty('--mouse-x', '0');
    mainRef.current?.style.setProperty('--mouse-y', '0');
  };

  const handleCardPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (reduceMotionRef.current || compactViewportRef.current) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    pendingCardTiltRef.current = {
      element: event.currentTarget,
      shineX: x * 100,
      shineY: y * 100,
      tiltX: (0.5 - y) * 8,
      tiltY: (x - 0.5) * -10,
    };

    if (cardFrameRef.current !== null) {
      return;
    }

    cardFrameRef.current = requestFrame(() => {
      cardFrameRef.current = null;
      const nextTilt = pendingCardTiltRef.current;
      if (!nextTilt) {
        return;
      }

      nextTilt.element.style.setProperty('--tilt-x', nextTilt.tiltX.toFixed(3));
      nextTilt.element.style.setProperty('--tilt-y', nextTilt.tiltY.toFixed(3));
      nextTilt.element.style.setProperty('--shine-x', `${nextTilt.shineX.toFixed(2)}%`);
      nextTilt.element.style.setProperty('--shine-y', `${nextTilt.shineY.toFixed(2)}%`);
    });
  };

  const handleCardActivate = (card: MenuCard, index: number) => {
    const node = mainRef.current;
    if (!node) {
      return;
    }

    const column = getCardSequencerColumn(index);
    const lane = getCardSequencerLane(index);

    node.dataset.activeCard = card.id;
    node.style.setProperty('--active-card-color', card.accent);
    node.style.setProperty('--sequencer-column', String(column));
    node.style.setProperty('--sequencer-lane', String(lane));
    node.style.setProperty('--sequencer-position', getSequencerPosition(column));
  };

  const handleSequencerIdle = () => {
    const node = mainRef.current;
    if (!node) {
      return;
    }

    delete node.dataset.activeCard;
    node.style.setProperty('--active-card-color', 'var(--menu-neon-cyan)');
    node.style.setProperty('--sequencer-column', '2');
    node.style.setProperty('--sequencer-lane', '1');
    node.style.setProperty('--sequencer-position', '25%');
  };

  const handleCardPointerLeave = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (pendingCardTiltRef.current?.element === event.currentTarget) {
      pendingCardTiltRef.current = null;
    }

    event.currentTarget.style.setProperty('--tilt-x', '0');
    event.currentTarget.style.setProperty('--tilt-y', '0');
    event.currentTarget.style.setProperty('--shine-x', '50%');
    event.currentTarget.style.setProperty('--shine-y', '18%');
    handleSequencerIdle();
  };

  const renderMenuCard = (card: MenuCard, index: number) => {
    const description = card.getDescription?.(insights) ?? card.description;
    const descriptionId = `main-menu-${card.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-description`;

    return (
      <button
        key={card.title}
        aria-describedby={descriptionId}
        aria-label={card.title}
        className={`menu-card menu-card-${card.priority}`}
        onBlur={handleSequencerIdle}
        onClick={() => card.onSelect(props)}
        onFocus={() => handleCardActivate(card, index)}
        onPointerEnter={() => handleCardActivate(card, index)}
        onPointerLeave={handleCardPointerLeave}
        onPointerMove={handleCardPointerMove}
        style={
          {
            '--card-color': card.accent,
            '--entrance-delay': getCardDelay(card.priority, index),
          } as MenuStyle
        }
        type="button"
      >
        <span className="menu-card-glow" aria-hidden="true" />
        <span className="menu-card-sheen" aria-hidden="true" />
        <span className="menu-card-icon" aria-hidden="true">
          {card.icon}
        </span>
        <span className="menu-card-copy">
          <span className="menu-card-title">{card.title}</span>
          <span className="menu-card-intent" id={descriptionId}>{description}</span>
        </span>
        {card.actionLabel && <span className="menu-card-action" aria-hidden="true">{card.actionLabel}</span>}
      </button>
    );
  };

  return (
    <main
      className="app-shell main-menu-screen"
      onPointerLeave={handleScreenPointerLeave}
      onPointerMove={handleScreenPointerMove}
      ref={mainRef}
      style={
        {
          '--active-card-color': 'var(--menu-neon-cyan)',
          '--mouse-x': '0',
          '--mouse-y': '0',
          '--sequencer-column': '2',
          '--sequencer-lane': '1',
          '--sequencer-position': '25%',
        } as MenuStyle
      }
    >
      {showBackgroundVideo ? (
        <video
          aria-hidden="true"
          autoPlay
          className="main-menu-background-video"
          data-testid="main-menu-background-video"
          disablePictureInPicture
          loop
          muted
          playsInline
          preload="auto"
          src={resolvePublicAssetUrl(BACKGROUND_VIDEO_PATH)}
          tabIndex={-1}
        />
      ) : null}

      <div className="main-menu-backdrop" aria-hidden="true">
        <span className="main-menu-gradient-river main-menu-gradient-river-a" />
        <span className="main-menu-gradient-river main-menu-gradient-river-b" />
        <span className="main-menu-light main-menu-light-a" />
        <span className="main-menu-light main-menu-light-b" />
        <span className="main-menu-facet main-menu-facet-a" />
        <span className="main-menu-facet main-menu-facet-b" />
        <span className="main-menu-score-lines" />
      </div>

      <div className="main-menu-sequencer" aria-hidden="true">
        <div className="main-menu-sequencer-stage">
          <span className="main-menu-sequencer-scan" />
          <div className="main-menu-sequencer-lanes">
            {Array.from({ length: 6 }, (_, index) => (
              <span key={index} />
            ))}
          </div>
          <div className="main-menu-sequencer-notes">
            {SEQUENCER_NOTES.map((note, index) => (
              <span
                className="main-menu-sequencer-note"
                key={`${note.lane}-${note.x}-${index}`}
                style={
                  {
                    '--note-color': note.color,
                    '--note-delay': `${note.delay}s`,
                    '--note-lane': String(note.lane),
                    '--note-size': `${note.size}px`,
                    '--note-speed': `${note.speed}s`,
                    '--note-top': `${note.lane * 13 - 18}%`,
                    '--note-x': `${note.x}%`,
                  } as MenuStyle
                }
              />
            ))}
          </div>
        </div>
        <div className="main-menu-key-rail">
          <span className="main-menu-key-press" aria-hidden="true" />
          <div className="main-menu-white-keys">
            {Array.from({ length: SEQUENCER_WHITE_KEY_COUNT }, (_, index) => (
              <span
                className="main-menu-key main-menu-key-white"
                key={index}
                style={
                  {
                    '--key-delay': `${index * -110}ms`,
                    '--key-spark-delay': `${index * 70}ms`,
                    '--key-index': String(index),
                    '--sequencer-column': String(index),
                  } as MenuStyle
                }
              />
            ))}
          </div>
          <div className="main-menu-black-keys">
            {SEQUENCER_BLACK_KEY_POSITIONS.map((whiteKeyIndex, index) => (
              <span
                className="main-menu-key main-menu-key-black"
                key={whiteKeyIndex}
                style={
                  {
                    '--black-key-column': String(whiteKeyIndex + 1),
                    '--key-delay': `${(whiteKeyIndex + 0.5) * -110}ms`,
                    '--key-spark-delay': `${(index * 70) + 35}ms`,
                    '--key-index': String(whiteKeyIndex),
                    '--sequencer-column': String(whiteKeyIndex),
                  } as MenuStyle
                }
              />
            ))}
          </div>
        </div>
      </div>

      <section className="main-menu-hero">
        <div className="main-menu-hero-copy entrance-animate" style={{ '--entrance-delay': '0ms' } as MenuStyle}>
          <h1>LumaKeys</h1>
        </div>
      </section>

      <section
        aria-label="Recommended practice"
        className="main-menu-practice-panel entrance-animate"
        style={
          {
            '--card-color': practiceAction.accent,
            '--entrance-delay': '120ms',
          } as MenuStyle
        }
      >
        <div className="main-menu-practice-copy">
          <p className="main-menu-practice-eyebrow">{practiceAction.eyebrow}</p>
          <h2>{practiceAction.title}</h2>
          <p>{practiceAction.detail}</p>
          {practiceAction.meta.length > 0 && (
            <div className="main-menu-practice-meta" aria-label="Practice details">
              {practiceAction.meta.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          )}
        </div>
        <button
          className="main-menu-practice-action"
          onClick={() => {
            if (practiceAction.song) {
              props.onStartSong(practiceAction.song);
              return;
            }
            props.onOpenLibrary();
          }}
          type="button"
        >
          {practiceAction.actionLabel}
        </button>
      </section>

      <section aria-label="Primary destinations" className="main-menu-grid">
        {primaryCards.map((card, index) => renderMenuCard(card, index))}
      </section>

      <section
        className="main-menu-secondary-shell entrance-animate"
        style={{ '--entrance-delay': `${SECONDARY_SHELL_ENTRANCE_DELAY_MS}ms` } as MenuStyle}
      >
        <div className="main-menu-secondary-heading">
          <h2>Training and Setup</h2>
        </div>
        <section aria-label="More destinations" className="main-menu-secondary-grid">
          {secondaryCards.map((card, index) => renderMenuCard(card, index))}
        </section>
      </section>
    </main>
  );
}
