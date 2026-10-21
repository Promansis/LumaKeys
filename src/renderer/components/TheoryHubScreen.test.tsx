import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AudioEngine } from '../../lib/audio/audioEngine';
import type { TheoryResultType } from '../../shared/dbTypes';
import { TheoryHubScreen } from './TheoryHubScreen';
import { TheoryQuizScreen } from './TheoryQuizScreen';

function createAudioEngineStub(): AudioEngine {
  return {
    init: vi.fn().mockResolvedValue(undefined),
    noteOn: vi.fn().mockResolvedValue(undefined),
    noteOff: vi.fn(),
    allNotesOff: vi.fn(),
    prepareForPlayback: vi.fn().mockResolvedValue(undefined),
  } as unknown as AudioEngine;
}

describe('TheoryHubScreen', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders saved theory stats by result type', async () => {
    window.appBridge = {
      getTheoryStats: vi.fn(async (type: TheoryResultType) => ({
        type,
        sessionCount: type === 'quiz' ? 2 : 1,
        bestScore: type === 'interval-trainer' ? 9 : 8,
        averageAccuracy: type === 'scale-practice' ? 87.5 : 80,
        lastPlayed: '2026-05-21T12:00:00.000Z',
      })),
    } as unknown as typeof window.appBridge;

    render(
      <TheoryHubScreen
        onStartScalePractice={vi.fn()}
        onStartIntervalTrainer={vi.fn()}
        onStartQuiz={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(window.appBridge?.getTheoryStats).toHaveBeenCalledTimes(3);
    });

    // The stats render after the three calls resolve, so wait for the text rather than the calls.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Scale Practice' }).closest('article')).toHaveTextContent('87.5%');
      expect(screen.getByRole('heading', { name: 'Interval Trainer' }).closest('article')).toHaveTextContent('9');
      expect(screen.getByRole('heading', { name: 'Theory Quizzes' }).closest('article')).toHaveTextContent('2');
    });
  });

  it('saves completed quiz payloads with the same score sent to session completion', async () => {
    const onSessionComplete = vi.fn();
    const saveTheoryResult = vi.fn().mockResolvedValue({ unlockedAchievementIds: ['theorist'] });
    const onAchievementsUnlocked = vi.fn();

    window.appBridge = {
      saveTheoryResult,
    } as unknown as typeof window.appBridge;

    const { container } = render(
      <TheoryQuizScreen
        audioEngine={createAudioEngineStub()}
        preset={{ quizType: 'note-reading' }}
        onSessionComplete={onSessionComplete}
        onAchievementsUnlocked={onAchievementsUnlocked}
      />,
    );

    await waitFor(() => {
      expect(container.querySelectorAll('.theory-choice-button').length).toBeGreaterThan(0);
    });

    for (let i = 0; i < 10; i += 1) {
      const choices = container.querySelectorAll<HTMLButtonElement>('.theory-choice-button');
      fireEvent.click(choices[0]);
    }

    await waitFor(() => {
      expect(saveTheoryResult).toHaveBeenCalledOnce();
    });

    const completionPayload = onSessionComplete.mock.calls[0][0] as {
      accuracy: number;
      score: number;
      totalQuestions: number;
    };
    const savedPayload = saveTheoryResult.mock.calls[0][0] as {
      type: string;
      score: number;
      totalQuestions: number;
      accuracy: number;
      details: { quizType: string; answers: string[] };
    };

    expect(savedPayload).toMatchObject({
      type: 'quiz',
      totalQuestions: 10,
      score: completionPayload.score,
      accuracy: completionPayload.accuracy,
      details: {
        quizType: 'note-reading',
      },
    });
    expect(savedPayload.details.answers).toHaveLength(10);
    await waitFor(() => {
      expect(onAchievementsUnlocked).toHaveBeenCalledWith(['theorist']);
    });
  });
});
