import { describe, expect, it, vi } from 'vitest';
import type { SessionConfig } from '../game/types';
import type { TierCapstone } from './types';
import {
  EMPTY_LEARNING_PROGRESS,
  getCapstoneRunSetup,
  isCapstoneRunSetupIntact,
  loadLearningProgress,
  markLessonCompleted,
  markLessonStepCompleted,
  saveLearningProgress,
  setLearningGating,
} from './learningProgress';

function createBridge(initial: Record<string, string | null>) {
  const store = new Map(Object.entries(initial));
  return {
    getSetting: vi.fn(async (category: string, key: string) => store.get(`${category}:${key}`) ?? null),
    setSetting: vi.fn(async (category: string, key: string, value: string) => {
      store.set(`${category}:${key}`, value);
    }),
    store,
  };
}

describe('learningProgress', () => {
  it('round-trips progress through the settings bridge', async () => {
    const bridge = createBridge({});
    const progress = setLearningGating(
      markLessonCompleted(markLessonStepCompleted(EMPTY_LEARNING_PROGRESS, 'novice-01-keyboard-map', 2), 'novice-01-keyboard-map'),
      true,
    );

    await saveLearningProgress(bridge, progress);
    const loaded = await loadLearningProgress(bridge);

    expect(loaded).toEqual(progress);
  });

  it('falls back safely when stored JSON is invalid', async () => {
    const bridge = createBridge({
      'learning:completedLessons': 'not-json',
      'learning:completedSteps': '{bad json',
      'learning:gatingEnabled': 'false',
    });

    const loaded = await loadLearningProgress(bridge);

    expect(loaded.completedLessons).toEqual([]);
    expect(loaded.completedSteps).toEqual({});
    expect(loaded.gatingEnabled).toBe(false);
  });

  describe('capstone run setup', () => {
    const capstone: TierCapstone = {
      songFileName: 'ode-to-joy.mid',
      displayTitle: 'Ode to Joy',
      accuracyThreshold: 85,
      tempoPercent: 90,
      handFilter: 'right',
      description: 'A capstone.',
    };

    function configFrom(setup: ReturnType<typeof getCapstoneRunSetup>): SessionConfig {
      return {
        ...setup,
        metronomeEnabled: false,
        handSize: 'medium',
        fingeringDisplayMode: 'learning-only',
        pitchBendEnabled: true,
        latencyCompMs: 0,
        hitWindowMs: 120,
        beatsVisible: 4,
        leadInBeats: 0,
      };
    }

    it('plays the capstone in Play mode, at its tempo and hand, without waiting for input', () => {
      expect(getCapstoneRunSetup(capstone)).toEqual({
        mode: 'luma-keys',
        waitForInput: false,
        tempoMultiplier: 0.9,
        handFilter: 'right',
        loopRange: null,
      });
    });

    it('accepts a run that kept the setup', () => {
      expect(isCapstoneRunSetupIntact(capstone, configFrom(getCapstoneRunSetup(capstone)))).toBe(true);
    });

    it.each([
      ['mode', { mode: 'learning' as const, waitForInput: true }],
      ['wait for input', { waitForInput: true }],
      ['tempo', { tempoMultiplier: 0.5 }],
      ['hand', { handFilter: 'both' as const }],
      ['loop range', { loopRange: { startMeasure: 0, endMeasure: 1 } }],
    ])('refuses a run whose %s was changed', (_name, change) => {
      const config = { ...configFrom(getCapstoneRunSetup(capstone)), ...change } as SessionConfig;

      expect(isCapstoneRunSetupIntact(capstone, config)).toBe(false);
    });
  });
});
