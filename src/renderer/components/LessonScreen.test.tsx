import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CURRICULUM } from '../../lib/learning/curriculum';
import { EMPTY_LEARNING_PROGRESS } from '../../lib/learning/learningProgress';
import { LessonScreen } from './LessonScreen';

const tier = CURRICULUM[0];
const lesson = tier.lessons[0];
const drillIndex = lesson.steps.findIndex((step) => step.kind !== 'tip');

function renderLesson(lastAttempt?: { stepIndex: number; accuracy: number; target: number } | null) {
  return render(
    <LessonScreen
      lesson={lesson}
      tier={tier}
      curriculum={CURRICULUM}
      progress={EMPTY_LEARNING_PROGRESS}
      initialStepIndex={drillIndex}
      lastAttempt={lastAttempt}
      onBack={vi.fn()}
      onOpenLesson={vi.fn()}
      onStartDrill={vi.fn()}
      onStartScale={vi.fn()}
      onStartInterval={vi.fn()}
      onStartQuiz={vi.fn()}
      onCompleteStep={vi.fn()}
      onCompleteLesson={vi.fn()}
    />,
  );
}

describe('LessonScreen last attempt', () => {
  afterEach(cleanup);

  it('shows the accuracy and the pass mark on the step that missed it', () => {
    renderLesson({ stepIndex: drillIndex, accuracy: 68, target: 70 });
    expect(screen.getByText('68% of 70% needed. Try again.')).toBeInTheDocument();
  });

  it('shows nothing when the attempt belongs to another step or there was none', () => {
    renderLesson({ stepIndex: drillIndex + 1, accuracy: 68, target: 70 });
    expect(screen.queryByText(/needed\. Try again\./)).toBeNull();
  });
});
